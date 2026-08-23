/**
 * `tag` step — a Gemini description for every photo the tour can see, and then
 * the initial filter over what it described.
 *
 * Tagging is what makes a photo visible to the Curator and to the filter: an
 * untagged row has no `ai_tags`, so `initialVerdict` cannot judge it and
 * `runPlan` orders it by `created_at` alone. It has to cover exactly the set
 * the fetch steps filled, or the difference shows up later as photos in the
 * cut that nothing ever looked at.
 *
 * Tag and filter were briefly two chips (2026-08-23) and are one again the
 * same day, at the owner's call: "tag and filtering can be combined". They
 * always were one decision wearing two buttons — filtering an untagged photo
 * is meaningless, so Filter's only honest response to a half-tagged pile was
 * to refuse, and a button whose job is to refuse until another button is done
 * is not a step. The two remain separate MODULES, and `filter` stays callable
 * on its own; what went away is the chip.
 *
 * The filter runs when tagging has ATTEMPTED every photo, not when every photo
 * has succeeded. `tagPoiPhoto` only stamps `tagged_at` on success
 * (vision-tagger.ts), so one photo with a dead storage path would otherwise
 * keep `remaining` above zero for ever and the review gate would never open.
 */
import { tourPoiIds } from '../tour-poi-set';
import { runFilter } from './filter';
import { type RunRow, type TourDb, getRun, saveStep, setRunStatus } from './shared';

/**
 * How long the tag loop may run before it stops and asks to be clicked again.
 *
 * The step route is `maxDuration = 300` on Vercel and a Gemini tag measures
 * ~3.5s — roughly 60 photos a click, against the 15 the old count-cap allowed.
 * 220s rather than 240s now that the filter runs in the same invocation; the
 * filter is a handful of DB round trips and a chunked update, seconds rather
 * than minutes, but it must not be the thing that overruns.
 *
 * A platform kill at `maxDuration` skips the route's catch, so an unbounded
 * loop does not merely run long: it leaves the run claiming to be working with
 * no record of why (DEVLOG 2026-08-23 02:45).
 */
const TAG_BUDGET_MS = 220_000;

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

  // UNREACHED, not UNSUCCESSFUL. These are the two questions the old
  // `remaining` was answering at once, and only the first should stop the
  // pipeline: a photo the loop never got to needs another click, a photo that
  // failed needs a person.
  const unreached = untagged.length - attempted;
  const failed = Object.keys(errors).length;

  if (unreached > 0) {
    await saveStep(sb, run, 'tag', {
      phase: 'partial',
      tagged,
      total: untagged.length,
      unreached,
      failed,
      errors,
      stopped_on: 'time_budget',
    });
    await setRunStatus(sb, run.id, 'tagging');
    return {
      ok: true,
      tagged,
      total: untagged.length,
      unreached,
      failed,
      message: `Tagged ${tagged}. ${unreached} photo(s) not reached — run Tag & Filter again.`,
    };
  }

  // Everything has been tried. Judge what came back, and let the ones that
  // failed through as `pending` rather than jamming the gate on them.
  const filtered = await runFilter(sb, run, { untaggedIsFatal: false });

  // RE-READ before saving. `saveStep` writes `{ ...run.step_results, [step]:
  // ... }`, and `run` is the snapshot from before `runFilter` wrote its own
  // key — so saving through it would erase the filter result we just produced,
  // silently, leaving the review gate closed with nothing to explain why.
  const fresh = (await getRun(sb, run.id)) ?? run;

  if ('error' in filtered) {
    await saveStep(sb, fresh, 'tag', {
      phase: 'failed',
      tagged,
      total: untagged.length,
      failed,
      errors,
      error: filtered.error,
    });
    return filtered;
  }

  await saveStep(sb, fresh, 'tag', {
    phase: 'done',
    tagged,
    total: untagged.length,
    unreached: 0,
    failed,
    errors,
    judged: filtered.judged,
    rejected: filtered.rejected,
    kept: filtered.kept,
  });
  // `runFilter` already moved the run to 'review'; nothing to add.

  return {
    ok: true,
    tagged,
    total: untagged.length,
    failed,
    judged: filtered.judged,
    rejected: filtered.rejected,
    kept: filtered.kept,
    awaitingReview: true,
    ...(failed > 0
      ? {
          message: `Tagged ${tagged}. ${failed} photo(s) could not be described and are waiting for you in Pending.`,
        }
      : {}),
  };
}
