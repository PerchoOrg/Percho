/**
 * `tag` step — Gemini-tag every photo this run fetched. Scoped to this run's
 * photos, not any globally untagged photo.
 */
import { type RunRow, type TourDb, saveStep, setRunStatus } from './shared';

export async function runTag(sb: TourDb, run: RunRow) {
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
