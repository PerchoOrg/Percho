/**
 * `resolve` step — Google Places Text Search firewall over the agents'
 * candidate POIs. A name the agents invented resolves to nothing and is
 * dropped here rather than reaching the photo fetch.
 */
import { type RunRow, type TourDb, saveStep, setRunStatus } from './shared';

export async function runResolve(sb: TourDb, run: RunRow) {
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

  // Mark which of these the community ALREADY has, and which already earn
  // their place in the film.
  //
  // Research is a grounded Gemini call, so two runs a day apart agreed on only
  // 53% of place_ids. That is fine as long as a re-run is additive — the POI
  // set is durable and this step only ever adds to it — but the panel could
  // not show which was which, and neither could the budget (see `incumbent` in
  // photos.ts). Owner 2026-08-20 wants a re-run "highly repeatable for good
  // quality"; making the RESULT stable is more attainable than making the
  // model deterministic.
  const { data: existing } = (await sb
    .from('community_pois')
    .select('poi_id, pois!inner(google_place_id)')
    .eq('community_id', run.community_id)) as {
    data: Array<{ poi_id: string; pois: { google_place_id: string | null } | null }> | null;
  };
  const knownPlaceIds = new Map(
    (existing ?? [])
      .filter((e) => e.pois?.google_place_id)
      .map((e) => [e.pois?.google_place_id as string, e.poi_id]),
  );
  const { data: approvedRows } = (await sb
    .from('poi_photos')
    .select('poi_id')
    .in('poi_id', [...knownPlaceIds.values()])
    .eq('status', 'approved')) as { data: Array<{ poi_id: string }> | null };
  const inFilm = new Set((approvedRows ?? []).map((r) => r.poi_id));

  const annotated = {
    ...result,
    resolved: result.resolved.map((r) => {
      const poiId = knownPlaceIds.get(r.place_id);
      return { ...r, is_new: !poiId, in_film: !!poiId && inFilm.has(poiId) };
    }),
  };
  await saveStep(sb, run, 'resolve', annotated);
  await setRunStatus(sb, run.id, result.resolved.length >= 4 ? 'fetching_photos' : 'resolving');
  return { resolved: result.resolved.length, dropped: result.dropped.length };
}

// ─── step: photos ───────────────────────────────────────────────────────────
