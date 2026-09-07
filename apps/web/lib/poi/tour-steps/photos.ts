/**
 * `photos` step — Places photos for every POI the tour has, and the enhance
 * queue for them. Writes progress as it goes so a long run is not mistaken for
 * a dead one.
 *
 * The FIRST of the four steps that "Fetch & Tag" became on 2026-08-23. The
 * other three are `ingest` (photos from the community's own website), `tag`
 * and `filter`. `runPlan` moved out to `tour-steps/plan.ts` on 2026-09-06; it
 * still writes the shot list back into this step's result, because the whole
 * admin surface reads it from there.
 */
import type { PoiActor } from '@/lib/poi/poi-actions-core';
import { type RunRow, type TourDb, asJson, mustWrite, saveStep, setRunStatus } from './shared';

/**
 * How many places outside the community a film may visit.
 *
 * 15 since 2026-08-20 (owner). It was 10, derived from the runtime — the tour
 * targets 45-90s, a place gets up to 3 clips, and a clip runs 2-4.5s — but
 * priority now claims most of it: seven POIs carrying a hand-approved photo
 * plus six incumbents is thirteen before a single new candidate is considered,
 * so at 10 the film would have dropped three places it was already using.
 *
 * The runtime does not stretch to match. `fitDuration` shortens clips toward
 * their floor to stay under TOUR_TARGET_MAX_S, and raises
 * `tour_duration_off_target` when even the floors overshoot. So the cost of a
 * bigger budget is paid in seconds per clip, and the warning is where it shows
 * up — watch it rather than assuming 15 places fit.
 */
export const SURROUNDING_POI_BUDGET = 15;

/**
 * Slots reserved for schools, before every other kind of place competes.
 *
 * Three, for elementary / middle / high. In this market schools decide more
 * purchases than the rest of the list put together, and a buyer notices a
 * missing tier immediately.
 */
const SCHOOL_SLOTS = 3;

/**
 * @param actor 'user' (default) checks the caller's session, which is what the
 *   admin route needs. 'service' skips it for a script with no session — the
 *   whole step is otherwise service-role already. Must never be taken from
 *   request input; see PoiActor.
 */

/**
 * Which surrounding places make the film's budget. PURE.
 *
 * Three rules, in order:
 *
 *  0. HAND-PICKED — a POI carrying a photo the owner approved himself is
 *     seated before anything else. Approving was the strongest signal in the
 *     system and behaved as the weakest; seven of his approvals sat on POIs
 *     that never entered the competition at all.
 *
 *  1. INCUMBENTS — a POI already carrying an approved photo keeps its slot.
 *     Research is a grounded Gemini call and two runs a day apart agreed on
 *     only 53% of place_ids, so without this a re-run re-shuffles the budget
 *     and can silently drop a place whose photos the owner already reviewed
 *     and whose clips are already rendered. Owner 2026-08-20: "the current
 *     video is good, i think we should keep the most content here… we should
 *     improve so it is highly repeatable for good quality." Making the model
 *     deterministic is not on offer; making the RESULT stable is, and this is
 *     what makes a re-run monotonic — it can add a place, never take one away.
 *
 *     Not permanent: rejecting a POI's photos empties it of approved rows and
 *     it stops being an incumbent next run. The way out is the review.
 *
 *  2. SCHOOLS — up to SCHOOL_SLOTS, counting any an incumbent already brought
 *     in, so three tiers stay three rather than becoming six.
 *
 *  3. ROUND-ROBIN across the remaining buckets, strongest bucket first, so
 *     when the budget runs out it is the weakest KIND of place that misses
 *     out rather than whichever happened to sort last.
 */
export function selectSurroundingPois({
  surrounding,
  bucketOf,
  scoreOf,
  incumbents,
  handPicked = new Set<string>(),
  budget = SURROUNDING_POI_BUDGET,
  schoolSlots = SCHOOL_SLOTS,
}: {
  surrounding: string[];
  bucketOf: (id: string) => string;
  scoreOf: (id: string) => number;
  incumbents: Set<string>;
  /** POIs carrying a photo the owner approved by hand. Seated first. */
  handPicked?: Set<string>;
  budget?: number;
  schoolSlots?: number;
}): string[] {
  const byBucket = new Map<string, string[]>();
  for (const id of surrounding) {
    const b = bucketOf(id);
    const arr = byBucket.get(b) ?? [];
    arr.push(id);
    byBucket.set(b, arr);
  }
  for (const arr of byBucket.values()) arr.sort((a, b) => scoreOf(b) - scoreOf(a));
  const bucketOrder = [...byBucket.keys()].sort(
    (a, b) => scoreOf(byBucket.get(b)![0]!) - scoreOf(byBucket.get(a)![0]!),
  );

  const kept: string[] = [];
  // 0. HAND-PICKED first — before incumbents, before anything. An explicit
  //    human approval outranks a machine's previous decision.
  for (const id of surrounding) {
    if (handPicked.has(id) && kept.length < budget) kept.push(id);
  }
  for (const id of surrounding) {
    if (incumbents.has(id) && !kept.includes(id) && kept.length < budget) kept.push(id);
  }

  const allSchools = byBucket.get('schools') ?? [];
  const schoolsAlreadyKept = allSchools.filter((id) => kept.includes(id)).length;
  const schoolsFree = allSchools.filter((id) => !kept.includes(id));
  const slotsLeft = Math.max(0, schoolSlots - schoolsAlreadyKept);
  kept.push(...schoolsFree.slice(0, slotsLeft).slice(0, Math.max(0, budget - kept.length)));
  byBucket.set('schools', schoolsFree.slice(slotsLeft));

  for (let round = 0; kept.length < budget; round++) {
    let placed = false;
    for (const b of bucketOrder) {
      const id = byBucket.get(b)?.[round];
      if (!id) continue;
      if (kept.includes(id)) continue;
      kept.push(id);
      placed = true;
      if (kept.length >= budget) break;
    }
    if (!placed) break; // every bucket exhausted
  }
  return kept;
}

/**
 * Enhance statuses this step must not touch. PURE.
 *
 * `ready` / `approved` / `rejected` are a finished verdict; `queued` /
 * `processing` are work the render worker has already been handed. Re-stamping
 * either of the last two hands the same photo out twice, which is how a
 * re-run stopped being free (owner 2026-08-23). `failed` and `none` are the
 * two that DO want queueing — a retry and a first attempt.
 */
const ENHANCE_SETTLED = new Set(['ready', 'approved', 'rejected', 'queued', 'processing']);

/** Photos in scope that still owe the render worker an enhance pass. PURE. */
export function enhanceTargets(photos: Array<{ id: string; enhanced_status: string }>): string[] {
  return photos.filter((p) => !ENHANCE_SETTLED.has(p.enhanced_status)).map((p) => p.id);
}

export async function runPhotos(sb: TourDb, run: RunRow, actor: PoiActor = 'user') {
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
          distance_m?: number | null;
          score?: number;
          bucket?: string;
        }>;
      }
    | undefined;
  if (!resolve?.resolved?.length) {
    return { error: 'no_resolved', message: 'Run the resolve step first.' };
  }

  // Claim the step before the first fetch. Until now the earliest write was the
  // 'tagging' one below — minutes in — so a death during the fetch loop (Vercel
  // timeout, a throw) left step_results.photos never written at all: the run sat
  // on status 'fetching_photos' and the strip, which reads 'no result = idle',
  // showed nothing. No green, no spinner, no failure, just a corpse.
  await saveStep(sb, run, 'photos', {
    phase: 'running',
    results: {},
    resolved_poi_ids: [],
    shots: [],
    dropped: [],
  });

  const { fetchPhotosForCommunityPoi } = await import('@/lib/poi/community-actions');
  const results: Record<string, unknown> = {};
  const resolvedPoiIds: string[] = [];
  // The resolve step already decided each POI's tour bucket; the Scheduler
  // needs it to keep one bucket from running more than two clips in a row.
  const bucketByPoiId = new Map<string, string>();
  // resolve keys its scores by place_id; the budget below needs them by poi_id.
  const placeIdToPoiId = new Map<string, string>();
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
    // photo fetch needs it — so it is fetched from Places once. ONCE was the
    // claim, not the behaviour: the check read `poi.raw_place`, which comes
    // from the run's frozen `step_results.resolve` and never gains a value, so
    // every re-run of this step paid for a details call on every such POI
    // while the answer sat in `pois.raw_place` from the first time (owner
    // 2026-08-23, asking for the step to be idempotent). The stored row is
    // consulted first now, and Places is the last resort.
    let rawPlace = poi.raw_place ?? null;
    if (!rawPlace) {
      const { data: stored } = (await sb
        .from('pois')
        .select('raw_place')
        .eq('google_place_id', poi.place_id)
        .maybeSingle()) as { data: { raw_place: unknown } | null };
      rawPlace = stored?.raw_place ?? null;
    }
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
          // without it resolves and then yields zero photos. Only written when
          // we HAVE one — an upsert carrying `raw_place: null` would erase a
          // good stored value on a run where the details call came back empty.
          ...(rawPlace ? { raw_place: asJson(rawPlace) } : {}),
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
    placeIdToPoiId.set(poi.place_id, poiId!);
    if (poi.bucket) bucketByPoiId.set(poiId!, poi.bucket);
    // Ensure community link (candidate status — admin reviews later).
    const { data: link } = await sb
      .from('community_pois')
      .select('community_id')
      .eq('community_id', run.community_id)
      .eq('poi_id', poiId)
      .maybeSingle();
    if (!link) {
      // The POI's real bucket, not a hardcoded 'other'. And the error is read:
      // this insert silently violated the intent_bucket CHECK for every new
      // POI, which left `community_pois` empty — and that table is where the
      // admin page starts when it looks for a community's photos, so the
      // photos existed and the page showed none (owner 2026-08-17, Aberdeen).
      const { error: linkErr } = await sb.from('community_pois').insert({
        community_id: run.community_id,
        poi_id: poiId,
        intent_bucket: poi.bucket ?? 'other',
        status: 'candidate',
        // Resolve measured this; without carrying it over, the on-screen
        // label has no distance to show and reads as if the place were
        // inside the community (owner 2026-08-19: seven labels came out bare).
        distance_m: poi.distance_m ?? null,
      });
      if (linkErr) {
        results[poi.place_id] = {
          skipped: `community link failed: ${(linkErr as { message?: string })?.message ?? 'unknown'}`,
        };
        continue;
      }
    }
    const r = await fetchPhotosForCommunityPoi(run.community_id, poiId!, { max: 3, actor });
    results[poi.place_id] = r;
  }

  // Resolve is how most of the community's POIs got here, but not the only
  // way: amenity POIs are ingested from the community's own site
  // (PhotoSourcePanel / ingest-community-photos.ts), and an admin can add a
  // place the research agent missed. Aberdeen is the case in point — its HOA
  // recommends four county parks within 2.6 miles and the agent proposed none
  // of them (owner 2026-08-19). Those belong in the film however they arrived,
  // so they are unioned in here, and any of them without photos gets the same
  // Places fetch a resolved POI would.
  //
  // APPROVED ONLY. This used to take every link that was not 'rejected', which
  // is a different set entirely: the Nearby button (`discoverPois`) writes a
  // `candidate` row for 20 places per included type, so Apremont - Highcroft
  // carried 228 links against 16 resolved POIs. At 3 photos each that is ~680
  // photos to download, tag through Gemini one at a time and enhance on the
  // GPU — for a film that visits 15 places. The run had been in
  // `fetching_photos` for four hours when the owner asked why a 16-POI
  // community was showing 335 photos (2026-08-23).
  //
  // 'approved' is exactly the "a person chose this place" set: the amenity
  // ingest stamps it (ingest-page-photos.ts) and so does the admin panel. Bulk
  // discovery output stays 'candidate', and picking from that is what `resolve`
  // is for.
  const { data: links } = (await sb
    .from('community_pois')
    .select('poi_id, intent_bucket')
    .eq('community_id', run.community_id)
    .eq('status', 'approved')) as {
    data: Array<{ poi_id: string; intent_bucket: string | null }> | null;
  };
  for (const link of links ?? []) {
    if (resolvedPoiIds.includes(link.poi_id)) continue;
    resolvedPoiIds.push(link.poi_id);
    bucketByPoiId.set(link.poi_id, link.intent_bucket ?? 'other');

    const { count } = (await sb
      .from('poi_photos')
      .select('id', { count: 'exact', head: true })
      .eq('poi_id', link.poi_id)) as { count: number | null };
    // Amenity POIs arrive with their photos already ingested; a POI added by
    // hand usually arrives with none, and Places is where they come from.
    if (!count) {
      const r = await fetchPhotosForCommunityPoi(run.community_id, link.poi_id, { max: 3, actor });
      results[link.poi_id] = r;
    }
  }

  // A film has room for a dozen places, not every place we know about.
  //
  // Nothing capped the POI COUNT before — only clips per POI (3) — so when the
  // rewritten research prompt started returning 17 resolved POIs on top of 5
  // amenities, the plan came out at 44 clips and 96s against a 90s ceiling
  // (owner 2026-08-19). Trimming here rather than in the scheduler keeps the
  // reason legible: these places are in the film, those are not.
  //
  // The community's own amenities are never trimmed — they are the subject.
  //
  // The rest are chosen one bucket at a time, best first, before any bucket
  // gets a second: coverage before depth, which is the owner's stated order
  // (2026-08-19). Ranking by distance alone was tried and picked a recycling
  // centre at 0.7 mi over three parks and the high school — near is not the
  // same as worth filming. `resolve` already scored each POI on bucket weight,
  // distance, confidence and photo count, so that is the rank used here.
  // NO BUDGET HERE. This step saves the full candidate set; `runPlan` picks
  // which of them the film visits.
  //
  // The budget used to be applied here, which put it BEFORE the owner's review
  // — so a photo he approved could not influence which places made the cut
  // until the whole photos step was re-run. Seven of his approvals sat on POIs
  // that `plan` never even loaded, and re-running plan changed nothing, because
  // plan was only reading a list this step had already frozen (owner
  // 2026-08-20: "the approved ones still dont have plan").
  //
  // Selection belongs after the gate for the same reason planning does: it is a
  // decision the review is supposed to inform.

  // WHAT THE STEP OWES WORK TO IS THE POIs IN SCOPE — not what this
  // invocation happened to download.
  //
  // Enhancing used to run off a `fetchedPhotoIds` list, filled only when a
  // fetch returned NEW photos. So the second time the step ran, every POI
  // already had its photos, every fetch came back `{ fetched: 0, reused: n }`,
  // the list stayed empty, and the step enhanced nothing — then reported
  // itself complete (owner 2026-08-23: "clicked fetch and tag, it shows
  // complete, but many are untagged"). A resumable step has to be able to see
  // the work an earlier, killed invocation left behind.
  const scopePhotos: Array<{ id: string; enhanced_status: string }> = [];
  for (let i = 0; i < resolvedPoiIds.length; i += 100) {
    const { data } = (await sb
      .from('poi_photos')
      .select('id, enhanced_status')
      .in('poi_id', resolvedPoiIds.slice(i, i + 100))
      .neq('status', 'rejected')) as {
      data: Array<{ id: string; enhanced_status: string }> | null;
    };
    scopePhotos.push(...(data ?? []));
  }

  // Auto-enhance (owner 2026-08-17): the enhance QUEUE is
  // poi_photos.enhanced_status itself — render-worker claims `queued` rows.
  // Thumbnails and clips then pick up the enhanced file automatically
  // (approved → enhanced_path).
  //
  // Queueing stays HERE rather than moving to its own step: it costs two DB
  // writes and hands the work to a different process entirely, so it is part
  // of fetching a photo, not a stage of the pipeline the owner would ever want
  // to run on its own. `enhanceTargets` is what keeps it idempotent — a row
  // already 'queued' or 'processing' is left alone, because re-stamping one
  // the worker has claimed hands the same photo out twice and a re-run is
  // meant to cost nothing (owner 2026-08-23).
  const toEnhance = enhanceTargets(scopePhotos);
  if (toEnhance.length > 0) {
    await mustWrite(
      `queue ${toEnhance.length} photo(s) for enhancement`,
      sb
        .from('poi_photos')
        .update({ enhanced_status: 'queued', enhanced_error: null })
        .in('id', toEnhance),
    );
  }

  // STOP HERE — and this is now a much earlier stop than it used to be.
  //
  // This step was "Fetch & Tag": Places photos, then the website ingest that
  // never actually ran, then a Gemini tag per photo, then the initial filter,
  // then the review gate. Four jobs and one 300s Vercel function between them,
  // which is why the tag loop needed a clock budget and why a community with a
  // real backlog could not finish in one click without one of the four
  // silently doing nothing. They are four steps now (owner 2026-08-23: "we
  // need to split the fetch & tag to 4 steps: fetch from resolved pois, fetch
  // from selected websites, tag selected photos, auto-filtering"), each with
  // the whole function to itself and each individually re-runnable.
  //
  // The review gate moved with the filter, to `tour-steps/filter.ts`.
  await saveStep(sb, run, 'photos', {
    phase: 'done',
    results,
    resolved_poi_ids: resolvedPoiIds,
    enhance_queued: toEnhance.length,
    shots: [],
    dropped: [],
  });
  await setRunStatus(sb, run.id, 'fetching_photos');
  return {
    ok: true,
    poiCount: Object.keys(results).length,
    photoCount: scopePhotos.length,
    enhanceQueued: toEnhance.length,
  };
}
