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

import { buildResearchPrompt } from '@/lib/ai/community-tour-prompt';
import { requireAdmin } from '@/lib/auth/require-admin';
import type { TourPlanPhoto } from '@/lib/poi/tour-orchestrator/plan';
import type { PhotoAnnotation } from '@/lib/poi/tour-orchestrator/types';
import { createServiceClient } from '@/lib/supabase/server';
import { extractJsonObject } from '@/lib/utils/extract-json';
import { NextResponse } from 'next/server';

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

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function geminiResearch(opts: {
  community: {
    name: string;
    city: string | null;
    state: string | null;
    zip: string | null;
    lat: number | null;
    lng: number | null;
  };
  runId: string;
  sb: any;
}): Promise<{
  ok: boolean;
  text: string;
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}> {
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

async function runResearch(
  sb: any,
  run: RunRow,
): Promise<{ ok: boolean; started: boolean; error?: string }> {
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
        community?: {
          lat?: number | null;
          lng?: number | null;
          city?: string | null;
          state?: string | null;
        };
      }
    | undefined;

  if (!research?.agents) {
    return { error: 'no_research', message: 'Run the research step first.' };
  }

  const candidates: Array<{
    name: string;
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
        bucket?: string;
        why?: string;
        shot_note?: string;
        source?: string;
        confidence?: string;
      };
      if (!p.name) continue;
      candidates.push({
        name: p.name,
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
  // The community's real city/state, not the agent's guess at a street address.
  const locality = [research.community?.city, research.community?.state].filter(Boolean).join(', ');
  const result = await resolveCandidates(candidates, center, radiusMeters, locality);
  await saveStep(sb, run, 'resolve', result);
  await setRunStatus(sb, run.id, result.resolved.length >= 4 ? 'fetching_photos' : 'resolving');
  return { resolved: result.resolved.length, dropped: result.dropped.length };
}

// ─── step: photos ───────────────────────────────────────────────────────────

async function runPhotos(sb: any, run: RunRow) {
  const resolve = run.step_results.resolve as
    | {
        resolved?: Array<{
          place_id: string;
          name?: string;
          formatted_address?: string | null;
          primary_type?: string | null;
          types?: string[] | null;
          rating?: number | null;
          user_ratings_total?: number | null;
          raw_place?: unknown;
          lat?: number | null;
          lng?: number | null;
          bucket?: string;
        }>;
      }
    | undefined;
  if (!resolve?.resolved?.length) {
    return { error: 'no_resolved', message: 'Run the resolve step first.' };
  }

  const { fetchPhotosForCommunityPoi } = await import('@/lib/poi/community-actions');
  const results: Record<string, unknown> = {};
  const resolvedPoiIds: string[] = [];
  const fetchedPhotoIds: string[] = [];
  // The resolve step already decided each POI's tour bucket; the Scheduler
  // needs it to keep one bucket from running more than two clips in a row.
  const bucketByPoiId = new Map<string, string>();
  for (const poi of resolve.resolved) {
    // Agent-discovered POIs may not be in nearby scope yet — upsert `pois` by
    // google_place_id and link to this community before fetching photos.
    //
    // This used to insert `{ google_place_id }` alone, which violates the
    // NOT NULL on display_name — so EVERY new POI failed and only communities
    // whose POIs the nearby pipeline had already created could ever get
    // photos. It went unseen because the test community's POIs already
    // existed (owner 2026-08-17, on Aberdeen: "0 fetched · 0 selected").
    // Same columns the nearby pipeline writes (lib/poi/community-actions.ts),
    // and an upsert so a re-run refreshes rather than fails.
    // Runs resolved before raw_place was carried through have none, and the
    // photo fetch needs it. One details call per such POI, once — the value is
    // stored, so this does not repeat.
    let rawPlace = poi.raw_place ?? null;
    if (!rawPlace) {
      const { getPlaceDetails } = await import('@/lib/poi/google-places');
      rawPlace = await getPlaceDetails(poi.place_id);
    }
    const { data: upserted, error: insErr } = await sb
      .from('pois')
      .upsert(
        {
          google_place_id: poi.place_id,
          display_name: poi.name || '(unnamed)',
          formatted_address: poi.formatted_address ?? null,
          primary_type: poi.primary_type ?? null,
          types: poi.types ?? null,
          rating: poi.rating ?? null,
          user_ratings_total: poi.user_ratings_total ?? null,
          // The photo fetch reads its references out of raw_place; a POI
          // without it resolves and then yields zero photos.
          raw_place: rawPlace,
          location: poi.lng != null && poi.lat != null ? `(${poi.lng},${poi.lat})` : null,
          refreshed_at: new Date().toISOString(),
        },
        { onConflict: 'google_place_id' },
      )
      .select('id')
      .single();
    if (insErr || !upserted) {
      results[poi.place_id] = {
        skipped: `poi upsert failed: ${(insErr as { message?: string })?.message ?? 'unknown'}`,
      };
      continue;
    }
    const poiId: string = upserted.id;
    resolvedPoiIds.push(poiId!);
    if (poi.bucket) bucketByPoiId.set(poiId!, poi.bucket);
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

  // Save progress before the slow half. This step now runs for minutes —
  // fetch, then enhance, then a Gemini tag per photo, then the whole
  // orchestration plan — and it used to write nothing until the very end, so
  // the panel showed the PREVIOUS run's numbers throughout. That is
  // indistinguishable from "it did nothing", and cost three rounds of the
  // owner reporting an empty table while the step was in fact working
  // (2026-08-17).
  await saveStep(sb, run, 'photos', {
    phase: 'tagging',
    results,
    resolved_poi_ids: resolvedPoiIds,
    shots: [],
    dropped: [],
  });

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

  // Final shot list — owner 2026-08-17: selection (2/POI cap + engine/category
  // mapping + rejected/unusable drop) lives in the PHOTOS step, not assemble.
  // Assemble just enqueues this list. Computed AFTER tag so ai_tags exist.
  await saveStep(sb, run, 'photos', {
    phase: 'planning',
    results,
    resolved_poi_ids: resolvedPoiIds,
    auto_tag: taggedCount,
    shots: [],
    dropped: [],
  });

  const { shots, dropped, plan } = await computeFinalShots(sb, resolvedPoiIds, bucketByPoiId);

  await saveStep(sb, run, 'photos', {
    phase: 'done',
    results,
    resolved_poi_ids: resolvedPoiIds,
    auto_tag: taggedCount,
    shots,
    dropped,
    plan,
  });
  await setRunStatus(sb, run.id, 'tagging');
  return { ok: true, poiCount: Object.keys(results).length, shots: shots.length, plan };
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

/** One planned clip as the photos step persisted it. */
interface PlannedShot {
  photo_id: string;
  poi_id: string;
  poi_name: string;
  engine: string;
  move: string | null;
  duration_s: number;
  prompt: string | null;
  ai_generated: boolean;
}

/** The shot list the photos step planned, or [] if it has not run. */
function plannedShots(run: RunRow): PlannedShot[] {
  const photos = run.step_results.photos as { shots?: PlannedShot[] } | undefined;
  return Array.isArray(photos?.shots) ? photos.shots : [];
}

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
    // Each column's button names its own engine: the Clip column means "make a
    // Seedance clip", the DA+KB column means the local one. Without that the
    // Seedance column would silently enqueue Ken Burns for any photo the plan
    // assigned locally, which is not what the column says.
    const forceEngine =
      engine === 'depthflow' || engine === 'kenburns' || engine === 'seedance' ? engine : null;
    const planned = plannedShots(run);
    const plannedById = new Map(planned.map((s) => [s.photo_id, s]));

    // A photo the plan covers renders exactly as planned. A photo outside the
    // plan can still be generated (the fetch-photo panel lists every community
    // POI, the plan only covers the resolved ones) — but with no annotation
    // there is no Seedance prompt, so it falls back to the worker's own
    // conservative default.
    const { data: photos } = await sb
      .from('poi_photos')
      .select('id, poi_id, ai_tags, poi:pois!inner(display_name)')
      .in('id', photoIds);
    const selected = (photos ?? [])
      .filter((p: any) => ((p.ai_tags ?? {}) as { usable?: boolean }).usable !== false)
      .map((p: any): PlannedShot => {
        const shot = plannedById.get(p.id);
        if (shot) {
          if (!forceEngine || forceEngine === shot.engine) return shot;
          // Off-plan override: the plan's move and prompt belong to the engine
          // it chose, so neither survives the switch. A forced Seedance clip
          // therefore has no Guard-built prompt and gets the worker's
          // conservative default.
          return {
            ...shot,
            engine: forceEngine,
            move: null,
            prompt: null,
            ai_generated: forceEngine === 'seedance',
          };
        }
        return {
          photo_id: p.id,
          poi_id: p.poi_id,
          poi_name: p.poi?.display_name ?? '',
          engine: forceEngine ?? 'seedance',
          move: null,
          duration_s: forceEngine && forceEngine !== 'seedance' ? 3.0 : 4.0,
          prompt: null,
          ai_generated: (forceEngine ?? 'seedance') === 'seedance',
        };
      });
    // Per-row click: re-render even a clip that is already ready.
    return enqueueClips(sb, run, selected, forceEngine, true);
  }

  if (!resolve?.resolved?.length)
    return { error: 'no_resolved', message: 'Run the resolve step first.' };

  // The plan is the shot list (orchestration layer, 2026-08-17). Generate no
  // longer re-derives engines from categories — it enqueues what the photos
  // step planned, so what renders is what review approved.
  const planned = plannedShots(run);
  if (planned.length === 0) {
    return {
      error: 'no_plan',
      message: 'No planned shots — run the photos step first (it builds the shot list).',
    };
  }
  // Deliberately narrower than the per-row path: a bulk override to seedance
  // would bill a generation for every photo in the run.
  const forceEngine = engine === 'depthflow' || engine === 'kenburns' ? engine : null;
  const shotsWithEngine = forceEngine
    ? planned.map((s) => ({
        ...s,
        engine: forceEngine,
        prompt: null,
        ai_generated: false,
        move: null,
      }))
    : planned;

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
  shotsWithEngine: Array<{
    photo_id: string;
    engine: string;
    duration_s: number;
    move?: string | null;
    prompt?: string | null;
    ai_generated?: boolean;
  }>,
  forceEngine?: string | null,
  /**
   * A per-row click means "render this again", so a clip that is already
   * ready has to go back to pending — otherwise the button updates the row's
   * prompt and nothing ever re-renders (owner 2026-08-17, on the Regenerate
   * button). Bulk enqueues leave ready clips alone: re-rendering a whole tour
   * on every Generate would burn Seedance spend nobody asked for.
   */
  requeueReady = false,
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
        // The plan's decisions travel with the row: the render worker takes the
        // move and the seedance worker takes the prompt instead of each
        // improvising one (migration 20260817210000).
        move: s.move ?? null,
        prompt: s.prompt ?? null,
        ai_generated: s.ai_generated ?? false,
        status: 'pending',
      })),
    );
  }
  // Rows that already exist keep their id but must follow the current plan —
  // a re-plan that changed the move or the prompt has to reach the worker.
  let requeued = 0;
  for (const s of shotsWithEngine) {
    const status = have.get(`${s.photo_id}:${s.engine}`);
    if (status === undefined) continue;
    if (status === 'processing') continue;
    const rerender = requeueReady && status === 'ready';
    if (rerender) requeued += 1;
    await sb
      .from('photo_clips')
      .update({
        duration_s: s.duration_s,
        move: s.move ?? null,
        prompt: s.prompt ?? null,
        ai_generated: s.ai_generated ?? false,
        ...(rerender ? { status: 'pending', error: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('photo_id', s.photo_id)
      .eq('engine', s.engine);
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
    requeued,
    reused: shotsWithEngine.length - toCreate.length - requeued,
  });
  await setRunStatus(sb, run.id, 'generating');
  return { shots: shotsWithEngine.length, created: toCreate.length, requeued };
}

// ─── step: regenerate-all (DA+KB bulk re-render, owner 2026-08-17) ────────
// Resets every existing depthflow/kenburns clip for the run's POIs back to
// pending and enqueues new ones for photos that never got one, so the whole
// table can be re-rendered with current code in one click. Seedance rows are
// untouched — this button must never spend generation money.
// (The per-row button re-renders one photo, ready or not, since 2026-08-17;
// this one is still the way to redo the whole local half at once.)

async function runRegenerateAll(sb: any, run: RunRow) {
  const photos = run.step_results.photos as { resolved_poi_ids?: string[] } | undefined;
  const poiIds = photos?.resolved_poi_ids ?? [];
  if (poiIds.length === 0) {
    return { error: 'no_photos', message: 'Run the photos step first.' };
  }

  const { data: photoRows } = await sb
    .from('poi_photos')
    .select('id, ai_tags, ai_score, poi_id, created_at, poi:pois!inner(display_name)')
    .in('poi_id', poiIds);
  // The plan already assigned depthflow vs kenburns per photo; this button
  // re-renders the LOCAL half of it, so it follows the plan rather than
  // flattening everything to kenburns the way it used to.
  const plannedById = new Map(plannedShots(run).map((s) => [s.photo_id, s]));

  // Selected Photos panel trim (gotcha 46): newest 3 per POI + any photo with
  // a READY clip. Matches loadNearbyPhotos / computeFinalShots so the bulk
  // re-render covers exactly what the panel shows.
  const { data: clipRows } = await sb
    .from('photo_clips')
    .select('photo_id, status')
    .in(
      'photo_id',
      (photoRows ?? []).map((p: any) => p.id),
    );
  const readyIds = new Set(
    (clipRows ?? []).filter((r: any) => r.status === 'ready').map((r: any) => r.photo_id),
  );
  const byPoi = new Map<string, typeof photoRows>();
  for (const p of photoRows ?? []) {
    if (!byPoi.has(p.poi_id)) byPoi.set(p.poi_id, []);
    byPoi.get(p.poi_id)!.push(p);
  }
  const kept: any[] = [];
  for (const list of byPoi.values()) {
    list.sort((a: any, b: any) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    );
    const top = list.slice(0, 3);
    kept.push(...top.filter((p: any) => readyIds.has(p.id) || top.includes(p)));
  }

  // Unusable photos never enter the video pool (gotcha 37).
  const selected = kept
    .filter((p: any) => ((p.ai_tags ?? {}) as { usable?: boolean }).usable !== false)
    .map((p: any) => {
      const shot = plannedById.get(p.id);
      // Off-plan photos, and the Seedance half of the plan, still render
      // locally here — that is what this button is for — but as Ken Burns,
      // whose move the worker can derive on its own.
      const local = shot && shot.engine === 'depthflow' ? 'depthflow' : 'kenburns';
      return {
        photo_id: p.id,
        poi_id: p.poi_id,
        poi_name: p.poi?.display_name ?? '',
        duration_s: shot?.duration_s ?? 3.0,
        engine: local,
        move: shot && shot.engine === local ? shot.move : null,
      };
    });

  // Reset EVERY existing depthflow/kenburns row for these photos (ready
  // included — the whole point is re-rendering old 16:9 clips with the new
  // 9:16 code). Seedance rows are untouched.
  const photoIds = selected.map((s) => s.photo_id);
  if (photoIds.length > 0) {
    await sb
      .from('photo_clips')
      .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
      .in('photo_id', photoIds)
      .in('engine', ['depthflow', 'kenburns']);
  }

  // Enqueue clips for photos that never had one.
  const { data: existing } = await sb
    .from('photo_clips')
    .select('photo_id, engine')
    .in('photo_id', photoIds)
    .in('engine', ['depthflow', 'kenburns']);
  const have = new Set((existing ?? []).map((r: any) => `${r.photo_id}:${r.engine}`));
  const toCreate = selected.filter((s) => !have.has(`${s.photo_id}:${s.engine}`));
  if (toCreate.length > 0) {
    await sb.from('photo_clips').insert(
      toCreate.map((s) => ({
        photo_id: s.photo_id,
        engine: s.engine,
        duration_s: s.duration_s,
        move: s.move ?? null,
        status: 'pending',
      })),
    );
  }
  // Existing rows get the planned move too — otherwise a re-render repeats the
  // old hash-picked one.
  for (const s of selected) {
    if (!s.move) continue;
    await sb
      .from('photo_clips')
      .update({ move: s.move, duration_s: s.duration_s, updated_at: new Date().toISOString() })
      .eq('photo_id', s.photo_id)
      .eq('engine', s.engine);
  }

  await saveStep(sb, run, 'regenerate_all', {
    reset: photoIds.length,
    created: toCreate.length,
  });
  await setRunStatus(sb, run.id, 'generating');
  return { reset: photoIds.length, created: toCreate.length };
}

// ─── step: assemble ─────────────────────────────────────────────────────────
// Owner 2026-08-17: "筛选去重确实上一步做了,但 2 张上限 + engine/category 映射
// 还是要在这里 - no 这一步也应该在上一步做" — the photos step computes the
// FINAL shot list (2 per POI + engine/category/duration) and persists it as
// step_results.photos.shots. Assemble is now a pure job enqueue: it reads the
// saved shots and inserts a pending tour_assemblies row. No re-selection.

/** Shared: build the final shot list for a set of POIs. Photos step computes
 *  and persists this; assemble consumes it. Per-POI cap 2 (owner 2026-08-17). */
async function computeFinalShots(
  sb: any,
  poiIds: string[],
  buckets?: Map<string, string>,
): Promise<{ shots: unknown[]; dropped: unknown[]; plan: unknown }> {
  const { data: photosRaw } = (await sb
    .from('poi_photos')
    .select(
      'id, poi_id, status, ai_tags, ai_score, storage_path, enhanced_path, enhanced_status, created_at, width_px, height_px, curator_tags, curator_version',
    )
    .in('poi_id', poiIds)
    .order('created_at', { ascending: false, nullsFirst: false })) as {
    data: Array<{
      id: string;
      poi_id: string;
      status: string | null;
      ai_tags: Record<string, unknown> | null;
      ai_score: number | null;
      storage_path: string | null;
      enhanced_path: string | null;
      enhanced_status: string | null;
      created_at: string | null;
      width_px: number | null;
      height_px: number | null;
      curator_tags: Record<string, unknown> | null;
      curator_version: number | null;
    }> | null;
  };

  // Owner 2026-08-17: "同一个poi最多2张照片" + "从取到的3张里选取两张质量好的
  // 更适合的" — per POI pick the 2 BEST by quality, not newest-first. Quality =
  // usable (tagger verdict) first, then ai_score desc, then newest as tiebreak.
  const POI_PHOTO_CAP = 2;
  const photos: NonNullable<typeof photosRaw> = [];
  const dropped: Array<{ photo_id: string; poi_id: string; reason: string }> = [];

  // Resolution gate, BEFORE the per-POI cap so a POI with a sharper alternate
  // uses it instead of spending its slot on a soft frame. Owner 2026-08-17, on
  // a 680x497 storefront that needed 4.25x to fill a 1080x1920 frame: the
  // duration rule shortens a soft clip, it cannot rescue one.
  const { upscaleFactor, isTooLowRes } = await import('@/lib/poi/tour-orchestrator/scheduler');
  const byPoi = new Map<string, NonNullable<typeof photosRaw>>();
  for (const p of photosRaw ?? []) {
    if (p.width_px && p.height_px && isTooLowRes(p.width_px, p.height_px)) {
      dropped.push({
        photo_id: p.id,
        poi_id: p.poi_id,
        reason: `too low resolution — ${p.width_px}x${p.height_px} needs ${upscaleFactor(p.width_px, p.height_px).toFixed(1)}x upscale for 1080x1920`,
      });
      continue;
    }
    const arr = byPoi.get(p.poi_id) ?? [];
    arr.push(p);
    byPoi.set(p.poi_id, arr);
  }
  for (const arr of byPoi.values()) {
    const ranked = [...arr].sort((a, b) => {
      const aTags = (a.ai_tags ?? {}) as { usable?: boolean };
      const bTags = (b.ai_tags ?? {}) as { usable?: boolean };
      // User-rejected photos rank last (they still appear in dropped).
      const aRej = a.status === 'rejected' ? 0 : 1;
      const bRej = b.status === 'rejected' ? 0 : 1;
      if (aRej !== bRej) return bRej - aRej;
      const aUsable = aTags.usable === false ? 0 : 1;
      const bUsable = bTags.usable === false ? 0 : 1;
      if (aUsable !== bUsable) return bUsable - aUsable;
      const score = (b.ai_score ?? 0) - (a.ai_score ?? 0);
      if (score !== 0) return score;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
    const kept = ranked.slice(0, POI_PHOTO_CAP);
    const keptIds = new Set(kept.map((r) => r.id));
    photos.push(...kept);
    // Owner 2026-08-17: "另外一张放到drop table里并说明原因" — every photo
    // beyond the 2/POI cap lands in dropped with the reason it lost.
    for (const row of ranked.slice(POI_PHOTO_CAP)) {
      if (keptIds.has(row.id)) continue;
      const tags = (row.ai_tags ?? {}) as { usable?: boolean };
      const reason =
        row.status === 'rejected'
          ? 'rejected in Review'
          : tags.usable === false
            ? 'tagger-unusable'
            : 'not in top 2 by quality score';
      dropped.push({ photo_id: row.id, poi_id: row.poi_id, reason });
    }
  }

  const { data: poiRows } = (await sb
    .from('pois')
    .select('id, display_name, primary_type')
    .in('id', poiIds)) as {
    data: Array<{ id: string; display_name: string | null; primary_type: string | null }> | null;
  };
  const poiName = new Map((poiRows ?? []).map((p) => [p.id, p.display_name ?? '']));
  const { PLACES_TYPE_TO_BUCKET } = await import('@/lib/poi/google-places');
  const poiBucket = new Map(
    (poiRows ?? []).map((p) => [
      p.id,
      // The resolve step's bucket is the accurate one; primary_type is the
      // fallback for POIs the agent upserted with nothing but a place_id.
      buckets?.get(p.id) ??
        (p.primary_type ? (PLACES_TYPE_TO_BUCKET[p.primary_type] ?? 'other') : 'other'),
    ]),
  );

  // Photos the tagger or the reviewer already rejected never reach the Curator
  // — no point paying to annotate a frame that cannot be used.
  const usable: typeof photos = [];
  for (const p of photos ?? []) {
    const tags = (p.ai_tags ?? {}) as { usable?: boolean };
    const rejectedByUser = p.status === 'rejected';
    const rejectedByTagger = tags.usable === false;
    if (rejectedByUser || rejectedByTagger) {
      dropped.push({
        photo_id: p.id,
        poi_id: p.poi_id,
        reason: rejectedByUser ? 'rejected in Review' : 'tagger-unusable',
      });
      continue;
    }
    usable.push(p);
  }

  // Orchestration layer (2026-08-17): the engine/move/order/duration used to be
  // a category lookup here. It is now Curator → Scheduler → Guard → VO Pass,
  // which is the only place those decisions live. See
  // lib/poi/tour-orchestrator/. The ORIGINAL file is sent for annotation, not
  // the enhanced one: enhancement changes the light, and time_of_day is judged
  // from the light.
  const { buildTourPlan } = await import('@/lib/poi/tour-orchestrator/plan');
  const { CURATOR_VERSION } = await import('@/lib/poi/tour-orchestrator/curator');
  const { annotationSchema } = await import('@/lib/poi/tour-orchestrator/types');
  const planPhotos: TourPlanPhoto[] = [];
  // photo_id → annotation already stored at the current CURATOR_VERSION.
  const cached = new Map<string, PhotoAnnotation>();
  for (const p of usable) {
    const widthPx = p.width_px ?? 0;
    const heightPx = p.height_px ?? 0;
    if (!p.storage_path || widthPx <= 0 || heightPx <= 0) {
      dropped.push({
        photo_id: p.id,
        poi_id: p.poi_id,
        reason: 'no stored file or no pixel dimensions',
      });
      continue;
    }
    // A photo whose annotation is already cached at the current version never
    // has to be downloaded, let alone uploaded to the model.
    const cachedAnnotation =
      p.curator_version === CURATOR_VERSION && p.curator_tags
        ? annotationSchema.safeParse(p.curator_tags)
        : null;
    let bytes = new Uint8Array();
    if (!cachedAnnotation?.success) {
      const { data: blob, error: dlErr } = await sb.storage
        .from('listing-photos')
        .download(p.storage_path);
      if (dlErr || !blob) {
        dropped.push({ photo_id: p.id, poi_id: p.poi_id, reason: 'storage download failed' });
        continue;
      }
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      cached.set(p.id, cachedAnnotation.data);
    }
    const tags = (p.ai_tags ?? {}) as { description?: string };
    planPhotos.push({
      photo_id: p.id,
      poi_id: p.poi_id,
      poi_name: poiName.get(p.poi_id) ?? '',
      bucket: poiBucket.get(p.poi_id) ?? 'other',
      width_px: widthPx,
      height_px: heightPx,
      description: tags.description ?? '',
      bytes,
      mime_type: 'image/jpeg',
    });
  }

  if (planPhotos.length === 0) return { shots: [], dropped, plan: null };

  const plan = await buildTourPlan(planPhotos, cached);

  // Persist what was freshly annotated, so the next run of this step reuses it
  // instead of paying again (owner 2026-08-17: "every time rerun would make llm
  // call that is expensive").
  for (const a of plan.curator.fresh) {
    await sb
      .from('poi_photos')
      .update({
        curator_tags: a,
        curator_version: CURATOR_VERSION,
        curated_at: new Date().toISOString(),
      })
      .eq('id', a.photo_id);
  }
  for (const id of plan.curator.missing) {
    const photo = planPhotos.find((p) => p.photo_id === id);
    dropped.push({
      photo_id: id,
      poi_id: photo?.poi_id ?? '',
      reason: 'curator returned no annotation',
    });
  }
  for (const ex of plan.excluded) {
    const photo = planPhotos.find((p) => p.photo_id === ex.photo_id);
    dropped.push({ photo_id: ex.photo_id, poi_id: photo?.poi_id ?? '', reason: ex.reason });
  }

  return {
    shots: plan.shots,
    dropped,
    // Everything review needs to judge the plan, persisted next to it.
    plan: {
      warnings: plan.warnings,
      violations: plan.violations,
      narration: plan.narration,
      curator: plan.curator,
      vo: plan.vo,
    },
  };
}

async function runAssemble(
  sb: any,
  run: RunRow,
  _photoIds?: string[],
  _engine?: string,
  approve?: boolean,
) {
  // Final shot list is computed + persisted by the photos step (owner 2026-08-17).
  const photosStep = run.step_results.photos as
    | { resolved_poi_ids?: string[]; shots?: unknown[]; dropped?: unknown[] }
    | undefined;
  const shots = photosStep?.shots;
  if (!Array.isArray(shots) || shots.length === 0) {
    return {
      error: 'no_shots',
      message: 'No final shot list yet — run the photos step first (it selects 2 per POI).',
    };
  }
  const dropped = photosStep?.dropped ?? [];

  if (approve) {
    const { error: insErr } = await sb.from('tour_assemblies').insert({
      community_id: run.community_id,
      run_id: run.id,
      status: 'pending',
      ordered_clips: shots,
      photos_dropped: dropped,
    });
    if (insErr) return { error: 'insert_failed', message: (insErr as { message: string }).message };
    await setRunStatus(sb, run.id, 'assembled');
    await saveStep(sb, run, 'assemble', { approved: true, ordered: shots, dropped });
    return { approved: true, ordered: shots, dropped };
  }

  await saveStep(sb, run, 'assemble', { approved: false, ordered: shots, dropped });
  return { approved: false, ordered: shots, dropped };
}

// ─── dispatcher ─────────────────────────────────────────────────────────────

const STEP_HANDLERS: Record<
  string,
  (
    sb: any,
    run: RunRow,
    photoIds?: string[],
    engine?: string,
    approve?: boolean,
  ) => Promise<unknown>
> = {
  research: runResearch,
  resolve: runResolve,
  photos: runPhotos,
  tag: runTag,
  generate: runGenerate,
  'regenerate-all': runRegenerateAll,
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
          : step === 'regenerate-all'
            ? await STEP_HANDLERS[step]!(sb, run)
            : await STEP_HANDLERS[step]!(sb, run);
    return NextResponse.json({ ok: true, step, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setRunStatus(sb, run.id, 'failed');
    return NextResponse.json({ ok: false, step, error: message }, { status: 500 });
  }
}
