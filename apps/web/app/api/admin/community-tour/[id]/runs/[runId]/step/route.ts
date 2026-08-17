/**
 * POST /api/admin/community-tour/[id]/runs/[runId]/step
 *   Execute one pipeline step, persist its output into step_results.
 *
 * Steps (owner-fixed 2026-08-15):
 *   research   — dual Gemini grounding calls (gemini_a/gemini_b). Runs
 *                INLINE on Vercel (plain HTTP to Gemini — no local CLI).
 *                ~5-10s total, under the platform function timeout.
 *   resolve    — Google Places Text Search firewall on agent candidates.
 *   photos     — fetch 3 photos per surviving POI (existing poi_photos path).
 *   tag        — Gemini tag every fetched photo + build shot list.
 *   generate   — enqueue photo→clip jobs in photo_clips (seedance worker
 *                picks them up).
 *   assemble   — ffmpeg concat per shot list (wired later; photo_clips must
 *                all be ready first).
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { buildResearchPrompt } from '@/lib/ai/community-tour-prompt';
import { extractJsonObject } from '@/lib/utils/extract-json';

export const runtime = 'nodejs';
// Tag loops Gemini per photo (~3s each); 50 photos = 150s+ > default 60s.
export const maxDuration = 300;

interface RunRow {
  id: string;
  community_id: string;
  status: string;
  step_results: Record<string, unknown>;
}

async function getRun(sb: any, runId: string): Promise<RunRow | null> {
  const { data } = await sb
    .from('community_tour_runs')
    .select('id, community_id, status, step_results')
    .eq('id', runId)
    .maybeSingle();
  return (data as RunRow | null) ?? null;
}

async function setRunStatus(
  sb: any,
  runId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  await sb
    .from('community_tour_runs')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', runId);
}

/** Persist a step's output under step_results.<step> (merge, not replace). */
async function saveStep(sb: any, run: RunRow, step: string, result: unknown) {
  await sb
    .from('community_tour_runs')
    .update({
      step_results: { ...run.step_results, [step]: result },
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id);
}

// ─── step: research (Gemini grounding, runs on Vercel) ─────────────────────

const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';

async function geminiResearch(opts: {
  community: { name: string; city: string | null; state: string | null; zip: string | null; lat: number | null; lng: number | null };
  runId: string;
  sb: any;
}): Promise<{ ok: boolean; text: string; error?: string; usage?: { input_tokens?: number; output_tokens?: number } }> {
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, text: '', error: 'GEMINI_API_KEY not set' };
  const prompt = buildResearchPrompt(opts.community);
  const url = `${GEMINI_API_BASE}/${model}:generateContent`;
  const startedAt = new Date().toISOString();
  const patchProgress = async (patch: Record<string, unknown>) => {
    const { data: run } = await opts.sb
      .from('community_tour_runs')
      .select('step_results')
      .eq('id', opts.runId)
      .maybeSingle();
    if (!run) return;
    await opts.sb
      .from('community_tour_runs')
      .update({
        step_results: { ...run.step_results, ...patch },
        updated_at: new Date().toISOString(),
      })
      .eq('id', opts.runId);
  };
  await patchProgress({
    research_progress: { status: 'running', started_at: startedAt, agents_done: [] },
  });

  const AGENTS = [
    { name: 'gemini_a', temperature: 0.4 },
    { name: 'gemini_b', temperature: 0.9 },
  ];
  const results: Record<string, unknown> = {};
  const agentsDone: string[] = [];
  for (const { name, temperature } of AGENTS) {
    let ok = false;
    let text = '';
    let error: string | undefined;
    let usage: { input_tokens?: number; output_tokens?: number } | undefined;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature, maxOutputTokens: 8000 },
        }),
      });
      if (!res.ok) {
        error = `Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`;
      } else {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: { text?: string }[] } }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? '';
        if (!text) error = 'Gemini returned no text content';
        else {
          ok = true;
          usage = {
            input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
            output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          };
        }
      }
    } catch (err) {
      error = (err as Error).message.slice(0, 500);
    }
    agentsDone.push(name);
    await patchProgress({
      research_progress: {
        status: ok ? 'running' : 'failed',
        started_at: startedAt,
        agents_done: [...agentsDone],
        [`${name}_ok`]: ok,
        error,
      },
    });
    results[name] = {
      ok,
      raw: ok ? text.slice(0, 20_000) : null,
      parsed: ok ? parseResearchJson(text) : null,
      error: error ?? null,
      usage: usage ?? null,
    };
  }
  return {
    ok: true,
    text: JSON.stringify(results),
    error: undefined,
  };
}

function parseResearchJson(raw: string): { narrative_angle?: string; pois?: unknown[] } | null {
  const extracted = extractJsonObject(raw);
  if (!extracted) return null;
  try {
    const parsed = JSON.parse(extracted);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.pois)) {
      return parsed as { narrative_angle?: string; pois?: unknown[] };
    }
    return null;
  } catch {
    return null;
  }
}

async function runResearch(sb: any, run: RunRow): Promise<{ ok: boolean; started: boolean; error?: string }> {
  // If a previous run already produced research, reuse it — agents cost money
  // and the admin can re-run explicitly by clearing the step.
  if (run.step_results.agent_research) {
    return { ok: true, started: false };
  }

  const { data: community } = await sb
    .from('communities')
    .select('id, name, city, state, zip, lat, lng')
    .eq('id', run.community_id)
    .maybeSingle();
  if (!community) {
    return { ok: false, started: false, error: 'community not found' };
  }

  const result = await geminiResearch({
    community,
    runId: run.id,
    sb,
  });
  if (!result.ok) {
    return { ok: false, started: false, error: result.error ?? 'research failed' };
  }

  const parsed = JSON.parse(result.text) as Record<string, unknown>;
  const research = {
    community: {
      name: community.name,
      city: community.city,
      state: community.state,
      zip: community.zip,
      lat: community.lat,
      lng: community.lng,
    },
    prompt: buildResearchPrompt(community),
    agents: parsed,
  };
  await sb
    .from('community_tour_runs')
    .update({
      step_results: { ...run.step_results, agent_research: research },
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id);
  return { ok: true, started: true };
}

async function runResolve(sb: any, run: RunRow) {
  const research = run.step_results.agent_research as
    | {
        agents: {
          gemini_a?: { ok?: boolean; parsed?: { pois?: unknown[] } | null };
          gemini_b?: { ok?: boolean; parsed?: { pois?: unknown[] } | null };
        };
        community?: { lat?: number | null; lng?: number | null };
      }
    | undefined;

  if (!research?.agents) {
    return { error: 'no_research', message: 'Run the research step first.' };
  }

  const candidates: Array<{
    name: string;
    address_hint: string;
    bucket: string;
    why: string;
    shot_note: string;
    source: string;
    confidence: 'high' | 'medium';
    agent: 'gemini_a' | 'gemini_b';
  }> = [];

  for (const agent of ['gemini_a', 'gemini_b'] as const) {
    const a = research.agents[agent];
    if (!a?.ok || !a.parsed?.pois) continue;
    for (const raw of a.parsed.pois) {
      const p = raw as {
        name?: string;
        address_hint?: string;
        bucket?: string;
        why?: string;
        shot_note?: string;
        source?: string;
        confidence?: string;
      };
      if (!p.name) continue;
      candidates.push({
        name: p.name,
        address_hint: p.address_hint ?? '',
        bucket: p.bucket ?? 'other',
        why: p.why ?? '',
        shot_note: p.shot_note ?? '',
        source: p.source ?? '',
        confidence: p.confidence === 'high' ? 'high' : 'medium',
        agent,
      });
    }
  }

  const center = {
    lat: research.community?.lat ?? 0,
    lng: research.community?.lng ?? 0,
  };
  if (!center.lat || !center.lng) {
    return { error: 'no_community_center', message: 'Community has no lat/lng.' };
  }

  const { resolveCandidates } = await import('@/lib/poi/community-tour');
  const radiusMeters = 6000; // suburban default — the <4 POI widen hook lives at step 4
  const result = await resolveCandidates(candidates, center, radiusMeters);
  await saveStep(sb, run, 'resolve', result);
  await setRunStatus(sb, run.id, result.resolved.length >= 4 ? 'fetching_photos' : 'resolving');
  return { resolved: result.resolved.length, dropped: result.dropped.length };
}

// ─── step: photos ───────────────────────────────────────────────────────────

async function runPhotos(sb: any, run: RunRow) {
  const resolve = run.step_results.resolve as
    | { resolved?: Array<{ place_id: string }> }
    | undefined;
  if (!resolve?.resolved?.length) {
    return { error: 'no_resolved', message: 'Run the resolve step first.' };
  }

  const { fetchPhotosForCommunityPoi } = await import('@/lib/poi/community-actions');
  const results: Record<string, unknown> = {};
  const resolvedPoiIds: string[] = [];
  const fetchedPhotoIds: string[] = [];
  for (const poi of resolve.resolved) {
    // Agent-discovered POIs may not be in nearby scope yet — upsert `pois` by
    // google_place_id and link to this community before fetching photos.
    const { data: existing } = await sb
      .from('pois')
      .select('id')
      .eq('google_place_id', poi.place_id)
      .maybeSingle();
    let poiId: string | null = existing?.id ?? null;
    if (!poiId) {
      const { data: inserted, error: insErr } = await sb
        .from('pois')
        .insert({ google_place_id: poi.place_id })
        .select('id')
        .single();
      if (insErr || !inserted) {
        results[poi.place_id] = {
          skipped: `poi upsert failed: ${(insErr as { message?: string })?.message ?? 'unknown'}`,
        };
        continue;
      }
      poiId = inserted.id;
    }
    resolvedPoiIds.push(poiId!);
    // Ensure community link (candidate status — admin reviews later).
    const { data: link } = await sb
      .from('community_pois')
      .select('community_id')
      .eq('community_id', run.community_id)
      .eq('poi_id', poiId)
      .maybeSingle();
    if (!link) {
      await sb.from('community_pois').insert({
        community_id: run.community_id,
        poi_id: poiId,
        intent_bucket: 'other',
        status: 'candidate',
      });
    }
    const r = await fetchPhotosForCommunityPoi(run.community_id, poiId!, { max: 3 });
    results[poi.place_id] = r;
    if ((r as { fetched?: number }).fetched) {
      const { data: rows } = await sb
        .from('poi_photos')
        .select('id')
        .eq('poi_id', poiId!)
        .order('created_at', { ascending: false })
        .limit(3);
      fetchedPhotoIds.push(...(rows ?? []).map((row: { id: string }) => row.id));
    }
  }

  // Auto-enhance the panel's photos (owner 2026-08-17): the enhance QUEUE is
  // poi_photos.enhanced_status itself — render-worker claims `queued` rows.
  // Set to queued unless already enhanced (ready/approved/rejected = keep
  // whatever exists; failed = retry once). Thumbnails + clips then pick up
  // the enhanced file automatically (approved → enhanced_path).
  if (fetchedPhotoIds.length > 0) {
    const { data: existing } = await sb
      .from('poi_photos')
      .select('id, enhanced_status')
      .in('id', fetchedPhotoIds)
      .in('enhanced_status', ['ready', 'approved', 'rejected']);
    const keep = new Set((existing ?? []).map((r: { id: string }) => r.id));
    const toEnhance = fetchedPhotoIds.filter((id) => !keep.has(id));
    if (toEnhance.length > 0) {
      await sb
        .from('poi_photos')
        .update({ enhanced_status: 'queued', enhanced_error: null })
        .in('id', toEnhance);
    }
  }

  // Auto-tag (owner 2026-08-17): each community has only dozens of photos, so
  // tagging needs no manual trigger — tag what we just fetched (only photos
  // not yet tagged; tagPoiPhoto is idempotent but skip the API call anyway).
  const taggedCount: Record<string, unknown> = {};
  if (fetchedPhotoIds.length > 0) {
    const { data: untaggedRows } = await sb
      .from('poi_photos')
      .select('id')
      .in('id', fetchedPhotoIds)
      .is('tagged_at', null);
    const { tagPoiPhoto } = await import('@/lib/poi/vision-tagger');
    let tagged = 0;
    for (const row of untaggedRows ?? []) {
      const r = await tagPoiPhoto(row.id);
      if (r.ok) tagged += 1;
    }
    taggedCount.tagged = tagged;
    taggedCount.total = (untaggedRows ?? []).length;
  }

  await saveStep(sb, run, 'photos', { results, resolved_poi_ids: resolvedPoiIds, auto_tag: taggedCount });
  await setRunStatus(sb, run.id, 'tagging');
  return { ok: true, poiCount: Object.keys(results).length };
}

// ─── step: tag ──────────────────────────────────────────────────────────────

async function runTag(sb: any, run: RunRow) {
  const resolve = run.step_results.resolve as
    | { resolved?: Array<{ place_id: string }> }
    | undefined;
  const photosStep = run.step_results.photos as
    | { results?: Record<string, { fetched?: number }>; resolved_poi_ids?: string[] }
    | undefined;
  if (!resolve?.resolved?.length)
    return { error: 'no_resolved', message: 'Run the resolve step first.' };

  // Scope to THIS run's photos — not any global untagged photo (cross-community
  // bug fixed 2026-08-17). Fall back to all untagged for legacy runs.
  const poiIds = photosStep?.resolved_poi_ids;
  let query = sb
    .from('poi_photos')
    .select('id, poi_id, ai_tags, ai_score, tagged_at')
    .is('tagged_at', null) // NOT .eq(null) — PostgREST treats =null as invalid for timestamptz
    .limit(15); // ponytail: batch cap so the loop fits under the 300s function timeout; re-click for more.
  if (poiIds?.length) query = query.in('poi_id', poiIds);
  const { data: photos } = await query;

  const { tagPoiPhoto } = await import('@/lib/poi/vision-tagger');
  const tagged: string[] = [];
  const errors: Record<string, string> = {};
  for (const photo of photos ?? []) {
    const r = await tagPoiPhoto(photo.id);
    if (r.ok) tagged.push(photo.id);
    else if (r.error) errors[photo.id] = r.error;
  }

  await saveStep(sb, run, 'tag', { tagged: tagged.length, total: (photos ?? []).length, errors });
  await setRunStatus(sb, run.id, 'generating');
  return { tagged: tagged.length, total: (photos ?? []).length, errors };
}

// ─── step: generate ─────────────────────────────────────────────────────────

async function runGenerate(sb: any, run: RunRow, photoIds?: string[], engine?: string) {
  const resolve = run.step_results.resolve as
    | { resolved?: Array<{ place_id: string; bucket: string; name: string }> }
    | undefined;

  // Single-photo generate (row button): build the shot directly from the
  // requested photo_id — it may belong to a POI that was never resolved in
  // this run (the fetch-photo panel shows ALL community POIs, resolve only
  // covers the ~13 recommended). Falling through to the resolve-only path
  // silently did nothing for those photos (owner 2026-08-17: click no-op).
  if (photoIds && photoIds.length > 0) {
    const { data: photos } = await sb
      .from('poi_photos')
      .select('id, poi_id, ai_tags, ai_score, poi:pois!inner(display_name)')
      .in('id', photoIds);
    const { durationForCategory } = await import('@/lib/poi/community-tour');
    const forceEngine = engine === 'depthflow' || engine === 'kenburns' ? engine : null;
    // Owner 2026-08-17: tagger-unusable photos never enter the video pool.
    const selected = (photos ?? [])
      .filter((p: any) => ((p.ai_tags ?? {}) as { usable?: boolean }).usable !== false)
      .map((p: any) => {
      const tags = (p.ai_tags ?? {}) as {
        primary_category?: string;
        usable?: boolean;
        has_prominent_text?: boolean;
      };
      return {
        photo_id: p.id,
        poi_id: p.poi_id,
        poi_name: p.poi?.display_name ?? '',
        category: tags.primary_category ?? 'other',
        duration_s: durationForCategory(tags.primary_category ?? 'other'),
        engine: forceEngine ?? (tags.has_prominent_text ? 'depthflow' : 'seedance'),
        bucket: 'other',
      };
    });
    return enqueueClips(sb, run, selected, forceEngine);
  }

  if (!resolve?.resolved?.length)
    return { error: 'no_resolved', message: 'Run the resolve step first.' };

  // Pull photos for the resolved POIs, build photo_clips rows where missing.
  const placeIds = resolve.resolved.map((r) => r.place_id);
  const { data: pois } = await sb
    .from('pois')
    .select('id, google_place_id')
    .in('google_place_id', placeIds);
  const poiByPlace = new Map(
    (pois ?? []).map((p: { id: string; google_place_id: string }) => [p.google_place_id, p.id]),
  );
  const poiIds = [...poiByPlace.values()];

  const { data: photos } = await sb
    .from('poi_photos')
    .select('id, poi_id, ai_tags, ai_score')
    .in('poi_id', poiIds);

  // Shot list from tags
  const { buildShotList } = await import('@/lib/poi/community-tour');
  const byPoi = new Map(resolve.resolved.map((r) => [r.place_id, r]));

  const inputs: Array<{
    photo_id: string;
    poi_id: string;
    poi_name: string;
    category: string;
    usable: boolean;
    has_prominent_text: boolean;
    ai_score: number;
    bucket: string;
  }> = [];
  for (const photo of photos ?? []) {
    const poi = resolve.resolved.find((r) => poiByPlace.get(r.place_id) === photo.poi_id);
    const tags = (photo.ai_tags ?? {}) as {
      primary_category?: string;
      usable?: boolean;
      has_prominent_text?: boolean;
    };
    inputs.push({
      photo_id: photo.id,
      poi_id: photo.poi_id,
      poi_name: poi?.name ?? '',
      category: tags.primary_category ?? 'other',
      usable: tags.usable !== false,
      has_prominent_text: !!tags.has_prominent_text,
      ai_score: Number(photo.ai_score ?? 0.5),
      bucket: poi?.bucket ?? 'other',
    });
  }
  const shots = buildShotList(inputs);
  // Single-photo generate (row button): keep only that photo's shot.
  const selected =
    photoIds && photoIds.length > 0 ? shots.filter((s) => photoIds.includes(s.photo_id)) : shots;
  // Engine override: the row button on the DA+KB column requests depthflow/kenburns;
  // the seedance column requests seedance (the shot list default).
  const forceEngine = engine === 'depthflow' || engine === 'kenburns' ? engine : null;
  const shotsWithEngine = forceEngine ? selected.map((s) => ({ ...s, engine: forceEngine })) : selected;

  // Enqueue missing photo_clips — but a FAILED row is dead (expired TTL,
  // provider rejection); reset it to pending so the worker picks it up again
  // instead of silently skipping (owner 2026-08-17: generate after expired
  // showed no status change because the failed row blocked a re-create).
  // Keyed by (photo_id, engine): a photo can have both a seedance and a
  // depthflow/kenburns clip.
  return enqueueClips(sb, run, shotsWithEngine, forceEngine);
}

async function enqueueClips(
  sb: any,
  run: RunRow,
  shotsWithEngine: Array<{ photo_id: string; engine: string; duration_s: number }>,
  forceEngine?: string | null,
) {
  const existing = await sb
    .from('photo_clips')
    .select('photo_id, engine, status')
    .in(
      'photo_id',
      shotsWithEngine.map((s) => s.photo_id),
    );
  const have = new Map(
    (existing.data ?? []).map((r: { photo_id: string; engine: string; status: string }) => [
      `${r.photo_id}:${r.engine}`,
      r.status,
    ]),
  );
  const toCreate = shotsWithEngine.filter((s) => !have.has(`${s.photo_id}:${s.engine}`));
  if (toCreate.length > 0) {
    await sb.from('photo_clips').insert(
      toCreate.map((s) => ({
        photo_id: s.photo_id,
        engine: s.engine,
        duration_s: s.duration_s,
        status: 'pending',
      })),
    );
  }
  // Failed rows: reset to pending (re-generate). Leave ready/processing alone.
  const failedIds = shotsWithEngine
    .map((s) => s.photo_id)
    .filter((id) => have.get(`${id}:${forceEngine ?? 'seedance'}`) === 'failed');
  if (failedIds.length > 0) {
    await sb
      .from('photo_clips')
      .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
      .in('photo_id', failedIds)
      .eq('engine', forceEngine ?? 'seedance');
  }

  await saveStep(sb, run, 'generate', {
    shots: shotsWithEngine,
    created: toCreate.length,
    reused: shotsWithEngine.length - toCreate.length,
  });
  await setRunStatus(sb, run.id, 'generating');
  return { shots: shotsWithEngine.length, created: toCreate.length };
}

// ─── step: assemble ─────────────────────────────────────────────────────────
// Owner 2026-08-17: "敲定最后 assemble 要用的照片和clips 每个poi选择1-2个照片
// 尽量cover不同的category" + "show the final selected photos on tour pipeline
// and I will need to approve it before generating video".
//
// Phase 1 (this handler): compute the FINAL shot list from the generate step's
// shots + ready photo_clips, persist it to step_results.assemble so the UI can
// show it. Phase 2 (Approve button in the panel) POSTs the same step with
// {approve: true}, which inserts a tour_assemblies pending row the render
// worker consumes.
async function runAssemble(
  sb: any,
  run: RunRow,
  _photoIds?: string[],
  _engine?: string,
  approve?: boolean,
) {
  const generate = run.step_results.generate as
    | { shots?: Array<{ photo_id: string; poi_id: string; poi_name: string; category: string; engine: string; duration_s: number; bucket: string }> }
    | undefined;
  if (!generate?.shots?.length) {
    return { error: 'no_shots', message: 'Run the generate step first — it produces the candidate shot list.' };
  }

  const shots = generate.shots;
  const photoIdsAll = shots.map((s) => s.photo_id);

  // Ready clips only — assemble consumes actual video files.
  const { data: clips } = (await sb
    .from('photo_clips')
    .select('id, photo_id, engine, duration_s, status, storage_path')
    .in('photo_id', photoIdsAll)
    .in('status', ['ready'])) as {
    data: Array<{
      id: string;
      photo_id: string;
      engine: string;
      duration_s: number | null;
      status: string;
      storage_path: string | null;
    }> | null;
  };

  const clipByPhoto = new Map<string, NonNullable<typeof clips>[number]>();
  for (const c of clips ?? []) {
    // One clip per photo for assemble: prefer the shot list's engine.
    const prev = clipByPhoto.get(c.photo_id);
    if (!prev) {
      clipByPhoto.set(c.photo_id, c);
      continue;
    }
    const shotEngine = shots.find((s) => s.photo_id === c.photo_id)?.engine;
    if (c.engine === shotEngine) clipByPhoto.set(c.photo_id, c);
    else if (prev.engine !== shotEngine) {
      // Both non-preferred — keep the higher-quality (seedance > kenburns > depthflow).
      const rank = (e: string) => (e === 'seedance' ? 2 : e === 'kenburns' ? 1 : 0);
      if (rank(c.engine) > rank(prev.engine)) clipByPhoto.set(c.photo_id, c);
    }
  }

  // Selection: keep the shot list's order (opener → hero → round-robin → closer),
  // drop photos with no ready clip or unusable tags.
  const { data: photos } = (await sb
    .from('poi_photos')
    .select('id, ai_tags')
    .in('id', photoIdsAll)) as {
    data: Array<{ id: string; ai_tags: Record<string, unknown> | null }> | null;
  };
  const usableByPhoto = new Map(
    (photos ?? []).map((p) => [p.id, ((p.ai_tags ?? {}) as { usable?: boolean }).usable !== false]),
  );

  const ordered: Array<{
    photo_id: string;
    poi_id: string;
    poi_name: string;
    category: string;
    engine: string;
    duration_s: number;
    clip_id: string;
    clip_storage_path: string | null;
  }> = [];
  const dropped: Array<{ photo_id: string; reason: string }> = [];

  const perPoi = new Map<string, number>();
  for (const s of shots) {
    const clip = clipByPhoto.get(s.photo_id);
    if (!clip) {
      dropped.push({ photo_id: s.photo_id, reason: 'no ready clip yet' });
      continue;
    }
    if (usableByPhoto.get(s.photo_id) === false) {
      dropped.push({ photo_id: s.photo_id, reason: 'tagger-unusable' });
      continue;
    }
    const n = perPoi.get(s.poi_id) ?? 0;
    if (n >= 2) {
      dropped.push({ photo_id: s.photo_id, reason: 'POI cap (2 max)' });
      continue;
    }
    perPoi.set(s.poi_id, n + 1);
    ordered.push({
      photo_id: s.photo_id,
      poi_id: s.poi_id,
      poi_name: s.poi_name,
      category: s.category,
      engine: s.engine,
      duration_s: s.duration_s,
      clip_id: clip.id,
      clip_storage_path: clip.storage_path,
    });
  }

  if (approve) {
    const { error: insErr } = await sb.from('tour_assemblies').insert({
      community_id: run.community_id,
      run_id: run.id,
      status: 'pending',
      ordered_clips: ordered,
      photos_dropped: dropped,
    });
    if (insErr) return { error: 'insert_failed', message: (insErr as { message: string }).message };
    await setRunStatus(sb, run.id, 'assembled');
    return { approved: true, ordered, dropped };
  }

  // Preview (no DB write beyond step_results — the UI shows this before approve).
  return { approved: false, ordered, dropped };
}

// ─── dispatcher ─────────────────────────────────────────────────────────────

const STEP_HANDLERS: Record<
  string,
  (sb: any, run: RunRow, photoIds?: string[], engine?: string, approve?: boolean) => Promise<unknown>
> = {
  research: runResearch,
  resolve: runResolve,
  photos: runPhotos,
  tag: runTag,
  generate: runGenerate,
  assemble: runAssemble,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId, runId } = await params;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb: any = createServiceClient();

  const body = (await req.json().catch(() => ({}))) as {
    step?: string;
    photoIds?: string[];
    engine?: string;
    approve?: boolean;
  };
  const step = body.step;
  if (!step || !STEP_HANDLERS[step]) {
    return NextResponse.json(
      { error: 'invalid_step', message: `Unknown step: ${step}` },
      { status: 400 },
    );
  }

  const run = await getRun(sb, runId);
  if (!run) return NextResponse.json({ error: 'run_not_found' }, { status: 404 });
  if (run.community_id !== communityId) {
    return NextResponse.json({ error: 'run_mismatch' }, { status: 400 });
  }

  // Debug: record the raw engine the client sent (owner 2026-08-17: DA+KB
  // clicks were landing as seedance; need to see if engine reaches the route).
  await sb
    .from('community_tour_runs')
    .update({
      step_results: {
        ...run.step_results,
        last_generate_request: {
          photoIds: body.photoIds ?? null,
          engine: body.engine ?? null,
          at: new Date().toISOString(),
        },
      },
    })
    .eq('id', run.id);

  try {
    const result =
      step === 'generate'
        ? await STEP_HANDLERS[step]!(sb, run, body.photoIds, body.engine)
        : step === 'assemble'
          ? await STEP_HANDLERS[step]!(sb, run, undefined, undefined, body.approve)
          : await STEP_HANDLERS[step]!(sb, run);
    return NextResponse.json({ ok: true, step, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setRunStatus(sb, run.id, 'failed');
    return NextResponse.json({ ok: false, step, error: message }, { status: 500 });
  }
}
