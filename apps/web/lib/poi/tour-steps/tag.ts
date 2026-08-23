/**
 * `tag` step — a Gemini description for every photo the tour can see.
 *
 * The third of the four steps "Fetch & Tag" was split into (2026-08-23).
 * Tagging is what makes a photo visible to the Curator and to the initial
 * filter: an untagged row has no `ai_tags`, so `initialVerdict` cannot judge
 * it and `runPlan` orders it by `created_at` alone. It has to cover exactly
 * the set the fetch steps filled, or the difference shows up later as photos
 * in the cut that nothing ever looked at.
 *
 * This step used to be a vestige — registered in the route, absent from the
 * strip, scoped to whatever `photos` had frozen in `resolved_poi_ids`, and
 * capped at 15 photos a click. It now runs the whole set, bounded by the clock
 * rather than by a count.
 */
import { tourPoiIds } from '../tour-poi-set';
import { type RunRow, type TourDb, saveStep, setRunStatus } from './shared';

/**
 * How long the tag loop may run before it stops and asks to be clicked again.
 *
 * The step route is `maxDuration = 300` on Vercel and a Gemini tag measures
 * ~3.5s. Tagging no longer shares its invocation with the fetch and the
 * judging, so the budget is most of the function rather than half of it —
 * roughly 60 photos a click, against the 15 the old count-cap allowed.
 *
 * A platform kill at `maxDuration` skips the route's catch, so an unbounded
 * loop does not merely run long: it leaves the run claiming to be working with
 * no record of why (DEVLOG 2026-08-23 02:45).
 */
const TAG_BUDGET_MS = 240_000;

export async function runTag(sb: TourDb, run: RunRow) {
  const resolve = run.step_results.resolve as
    | { resolved?: Array<{ place_id: string }> }
    | undefined;

  // The tour's POIs — what `resolve` picked, plus the links a person approved,
  // which is where the website ingest's amenity POIs come from. NOT the frozen
  // `resolved_poi_ids` the photos step happened to write: `ingest` runs after
  // `photos` and creates POIs it could not have known about, and those are
  // precisely the community's own amenities.
  const poiIds = [...(await tourPoiIds(sb, run.community_id, resolve?.resolved))];
  if (poiIds.length === 0) {
    return { error: 'no_pois', message: 'Nothing to tag — run resolve and the fetch steps first.' };
  }

  // Chunked: one `.in()` over a few hundred uuids is a URL PostgREST rejects
  // against its 8 KB header limit (2026-08-22).
  const untagged: string[] = [];
  for (let i = 0; i < poiIds.length; i += 100) {
    const { data } = (await sb
      .from('poi_photos')
      .select('id')
      .in('poi_id', poiIds.slice(i, i + 100))
      .neq('status', 'rejected')
      // NOT `.eq(null)` — PostgREST treats =null as invalid for timestamptz.
      .is('tagged_at', null)) as { data: Array<{ id: string }> | null };
    untagged.push(...(data ?? []).map((r) => r.id));
  }

  const { tagPoiPhoto } = await import('@/lib/poi/vision-tagger');
  const startedAt = Date.now();
  const errors: Record<string, string> = {};
  let tagged = 0;
  let attempted = 0;
  for (const id of untagged) {
    if (Date.now() - startedAt > TAG_BUDGET_MS) break;
    attempted += 1;
    const r = await tagPoiPhoto(id);
    if (r.ok) tagged += 1;
    else if (r.error) errors[id] = r.error;
  }

  const remaining = untagged.length - tagged;
  await saveStep(sb, run, 'tag', {
    phase: remaining > 0 ? 'partial' : 'done',
    tagged,
    total: untagged.length,
    remaining,
    errors,
    ...(attempted < untagged.length ? { stopped_on: 'time_budget' } : {}),
  });
  await setRunStatus(sb, run.id, 'tagging');

  return {
    ok: true,
    tagged,
    total: untagged.length,
    remaining,
    ...(remaining > 0
      ? { message: `Tagged ${tagged}. ${remaining} photo(s) still untagged — run Tag again.` }
      : {}),
  };
}
