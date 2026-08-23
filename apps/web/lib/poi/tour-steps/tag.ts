/**
 * `tag` step — Gemini-tag the photos this run fetched, and only those. Scoped
 * to the tour's POIs (see tour-poi-set.ts), never to whatever is untagged.
 */
import { tourPoiIds } from '../tour-poi-set';
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

  // Scope to THIS run's POIs — not any global untagged photo (cross-community
  // bug fixed 2026-08-17).
  //
  // What this replaces was "no scope → tag whatever is untagged, in ANY
  // community". `resolved_poi_ids` is empty whenever the photos step died
  // before saving it — the state both of today's dead runs were left in — so
  // the fallback fired exactly when the scope was least knowable. The set is
  // rebuilt from the run instead (resolve's picks + the links a person
  // approved), and empty now means "nothing to tag", never "tag everything"
  // (owner 2026-08-23).
  const poiIds = photosStep?.resolved_poi_ids?.length
    ? photosStep.resolved_poi_ids
    : [...(await tourPoiIds(sb, run.community_id, resolve.resolved))];
  if (poiIds.length === 0) {
    return { error: 'no_poi_scope', message: 'No resolved or approved POIs to tag — run photos.' };
  }
  // Untagged rows only. `tagPoiPhoto` skips a tagged photo by itself, but not
  // before two queries — asking for them at all is what makes a second run of
  // this step cost nothing instead of re-walking everything it already did.
  const { data: photos } = await sb
    .from('poi_photos')
    .select('id, poi_id, ai_tags, ai_score, tagged_at')
    .in('poi_id', poiIds)
    .is('tagged_at', null) // NOT .eq(null) — PostgREST treats =null as invalid for timestamptz
    .limit(15); // ponytail: batch cap so the loop fits under the 300s function timeout; re-click for more.

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
