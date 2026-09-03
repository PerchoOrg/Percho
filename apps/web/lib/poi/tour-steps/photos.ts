/**
 * `photos` step — Places photos for every POI the tour has, and the enhance
 * queue for them. Writes progress as it goes so a long run is not mistaken for
 * a dead one.
 *
 * The FIRST of the four steps that "Fetch & Tag" became on 2026-08-23. The
 * other three are `ingest` (photos from the community's own website), `tag`
 * and `filter`; `runPlan` still lives at the bottom of this file, because it
 * writes the shot list back into this step's result and the whole admin
 * surface reads it from there.
 */
import type { PoiActor } from '@/lib/poi/poi-actions-core';
import type { PlaceFact } from '../tour-orchestrator/insights';
import { tourPoiSet } from '../tour-poi-set';
import { type RunRow, type TourDb, asJson, mustWrite, saveStep, setRunStatus } from './shared';
import { computeFinalShots } from './shots';

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
const SURROUNDING_POI_BUDGET = 15;

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

/**
 * `plan` step — the shot list, run AFTER the owner's photo review.
 *
 * Split out of `photos` on 2026-08-19 so the review gate above has something to
 * gate. Selection lives here rather than in `assemble` (owner 2026-08-17);
 * assemble only enqueues what this produced.
 */
export async function runPlan(sb: TourDb, run: RunRow) {
  const photosStep = (run.step_results.photos ?? {}) as {
    results?: Record<string, unknown>;
    auto_tag?: unknown;
  };

  // The candidate set is the TOUR's POI set — what `resolve` picked for this
  // run, plus the links a person approved (the amenity ingest and the admin
  // panel both stamp 'approved'). NOT every non-rejected row in
  // `community_pois`.
  //
  // That table is two sets wearing one name: the Nearby button writes a
  // `candidate` row for 20 places per included type, so a single click leaves a
  // few hundred behind. Reading all of them put TEN POIs into Apremont -
  // Highcroft's fifteen-place cut that the photos step had never fetched,
  // enhanced, tagged or judged for — nine of the twenty-nine shots landed on
  // photos with no ai_tags and no ai_score at all, ordered by `created_at`
  // alone. One was Cornerstone Christian Academy, whose only TAGGED photo the
  // fair-housing filter had just dropped; three untagged ones took the slots it
  // vacated, and nothing had ever looked at them. Owner 2026-08-23: "the scope
  // of plan is only for photos from previous step, which is resolved photos and
  // manual fetched ones."
  //
  // `tourPoiIds` is that definition, already shared by the photos step, the tag
  // step and the review page — this was the last caller reading the raw table,
  // so all four now work on the same places. It is re-derived from
  // `resolve.resolved` on every call rather than replayed from a list an
  // earlier plan froze, which is what once left hand-approved photos
  // unreachable (owner 2026-08-20: "i ran 3 time, cost a lot for this test").
  //
  // Render and assembly need no equivalent change: both read the shot list this
  // step writes, so the scope reaches them through it.
  const resolveStep = run.step_results.resolve as
    | { resolved?: Array<{ place_id: string; score?: number }> }
    | undefined;
  const { ids: scopePoiIds, scoreByPoiId } = await tourPoiSet(
    sb,
    run.community_id,
    resolveStep?.resolved,
  );

  const { data: allLinks } = (await sb
    .from('community_pois')
    .select('poi_id, intent_bucket')
    .eq('community_id', run.community_id)
    .neq('status', 'rejected')) as {
    data: Array<{ poi_id: string; intent_bucket: string | null }> | null;
  };

  // Every photo behind every link, once. Three questions need it: which POIs in
  // scope actually have a photo to offer, which POIs the owner has ruled on by
  // hand, and which `approved` rows this plan has to stand down at the end.
  //
  // Chunked, because one `.in()` over every link is a URL a few hundred uuids
  // long and PostgREST sits behind an 8 KB header limit — the 1,000-uuid
  // `.in()` that forced the tour-index rewrite was 37 KB (2026-08-22).
  const linkPoiIds = [...new Set((allLinks ?? []).map((l) => l.poi_id))];
  type LinkedPhoto = {
    id: string;
    poi_id: string;
    status: string | null;
    reviewed_by: string | null;
  };
  const linkedPhotos: LinkedPhoto[] = [];
  for (let i = 0; i < linkPoiIds.length; i += 100) {
    const { data: photoRows } = (await sb
      .from('poi_photos')
      .select('id, poi_id, status, reviewed_by')
      .in('poi_id', linkPoiIds.slice(i, i + 100))) as { data: LinkedPhoto[] | null };
    linkedPhotos.push(...(photoRows ?? []));
  }

  // A POI the owner ruled on by hand is in scope whatever resolve says. The
  // review page shows him those rows deliberately (`keepPhotoForTour`), and a
  // photo he can approve but the plan cannot reach is exactly the complaint of
  // 2026-08-20: "the photos i manually approved are not in the plan".
  for (const p of linkedPhotos) {
    if (p.reviewed_by) scopePoiIds.add(p.poi_id);
  }

  // ...and only the POIs with a photo to offer. A place with none contributes
  // no shots, so leaving it in spends one of the fifteen surrounding slots on
  // nothing.
  const hasPhotos = new Set(
    linkedPhotos.filter((p) => p.status !== 'rejected').map((p) => p.poi_id),
  );
  const links = (allLinks ?? []).filter(
    (l) => scopePoiIds.has(l.poi_id) && hasPhotos.has(l.poi_id),
  );
  const resolvedPoiIds = [...new Set(links.map((l) => l.poi_id))];
  if (resolvedPoiIds.length === 0) {
    throw new Error(
      'no resolved or hand-picked POI has photos yet — run research, resolve and Fetch & Tag first',
    );
  }
  const bucketByPoiId = new Map<string, string>(
    links.map((l) => [l.poi_id, l.intent_bucket ?? 'other']),
  );

  // THE BUDGET, applied HERE so the owner's review counts toward it. Amenities
  // are the community's own and never compete; the surrounding places do.
  const amenityIds = resolvedPoiIds.filter((id) => bucketByPoiId.get(id) === 'amenities');
  const surrounding = resolvedPoiIds.filter((id) => bucketByPoiId.get(id) !== 'amenities');
  let cutPoiIds = resolvedPoiIds;
  if (surrounding.length > SURROUNDING_POI_BUDGET) {
    const { data: approvedPhotos } = (await sb
      .from('poi_photos')
      .select('poi_id, reviewed_by')
      .in('poi_id', surrounding)
      .eq('status', 'approved')) as {
      data: Array<{ poi_id: string; reviewed_by: string | null }> | null;
    };
    // `resolve`'s own score, not `community_pois.ai_score` — nothing has ever
    // written that column, so this ranking was comparing nulls and the winner
    // was row order. See `tourPoiSet`.
    cutPoiIds = [
      ...amenityIds,
      ...selectSurroundingPois({
        surrounding,
        bucketOf: (id) => bucketByPoiId.get(id) ?? 'other',
        scoreOf: (id) => scoreByPoiId.get(id) ?? 0,
        incumbents: new Set((approvedPhotos ?? []).map((r) => r.poi_id)),
        handPicked: new Set(
          (approvedPhotos ?? []).filter((r) => r.reviewed_by).map((r) => r.poi_id),
        ),
      }),
    ];
  }

  const { shots, dropped, plan } = await computeFinalShots(sb, cutPoiIds, bucketByPoiId);

  // NARRATION — written here, because the cut only exists here.
  //
  // It used to be written against the film's total runtime, which meant
  // nothing tied a sentence to a shot and the error compounded: on the last
  // Aberdeen cut the narration named Halcyon 4.6s early and was 28.7s ahead by
  // the closing Publix shot, talking about groceries over a park. Anchored to
  // the shot list instead, each line is spoken over the clips it describes.
  //
  // Text only. Synthesis and placement belong to the worker, which is the only
  // place the real timeline is known — see `NarrationSection.startClip`.
  const narration = await writeNarration(sb, run, shots);

  // THE MUSIC, chosen here rather than rolled by the worker.
  //
  // `pick_bgm()` took a uniform random pick from a folder, which is how the
  // loudest and most dynamic track in the library ended up under the first
  // narrated cut (owner: "the background music is too big"). Deciding in the
  // plan puts it beside every other decision about the film and makes it
  // reviewable before anything renders — owner 2026-08-20: "planner to
  // decide".
  const bgm = await chooseBgm(sb, run, shots);

  // NO reframing is queued here. Owner 2026-09-03, after Windward's plan queued
  // 16 outpaints in a single step: "never reframe automatically" — the function
  // stays, the automatic trigger does not. A reframe is now only ever started by
  // the Reframe button in the admin photo table (`requeueOutpaint`).
  //
  // Two behaviours went with it, deliberately. A badly framed photo in the cut
  // is centre-cropped again, as it was before phase71. And an undersized photo
  // is no longer rescued into eligibility — it stays out of the cut until
  // someone reframes it by hand, which is the loop phase73.23 automated away.

  // `approved` = in the cut. Stamped HERE, because this is where the cut is
  // decided — owner 2026-08-19: "approved can not be 82!!… they should already
  // be approved" of the photos in the video. Anything previously approved that
  // this plan did not pick goes back to 'pending': still usable, no longer in
  // the film. Rejected rows are never touched; that verdict is the review's.
  const chosen = new Set(
    (shots as Array<{ photo_id?: string }>).map((sh) => sh.photo_id).filter(Boolean) as string[],
  );
  //
  // Read across EVERY link, not only the POIs in this cut. Narrowing the cut to
  // the tour's own POI set (see the top of this step) strands rows an earlier,
  // wider plan stamped 'approved' — nine of them on Apremont - Highcroft — and
  // a photo claiming to be in the cut of a film that has never heard of its POI
  // is the very lie this stamp exists to prevent.
  const promote = linkedPhotos
    .filter((r) => chosen.has(r.id) && r.status !== 'approved')
    .map((r) => r.id);
  const demote = linkedPhotos
    .filter((r) => !chosen.has(r.id) && r.status === 'approved')
    .map((r) => r.id);
  // Chunked for the same 8 KB header limit as the read above: `demote` is now
  // community-wide, so it is no longer bounded by one cut's worth of photos.
  for (let i = 0; i < promote.length; i += 100) {
    const batch = promote.slice(i, i + 100);
    await mustWrite(
      `approve ${batch.length} photo(s) in the cut`,
      sb.from('poi_photos').update({ status: 'approved' }).in('id', batch),
    );
  }
  for (let i = 0; i < demote.length; i += 100) {
    const batch = demote.slice(i, i + 100);
    await mustWrite(
      `un-approve ${batch.length} photo(s) no longer in the cut`,
      sb.from('poi_photos').update({ status: 'pending' }).in('id', batch),
    );
  }

  await saveStep(sb, run, 'photos', {
    ...photosStep,
    phase: 'done',
    cut_poi_ids: cutPoiIds,
    shots,
    dropped,
    plan,
    narration,
    bgm,
  });
  await setRunStatus(sb, run.id, 'tagging');
  return {
    ok: true,
    shots: shots.length,
    dropped: dropped.length,
    approved: promote.length,
    unapproved: demote.length,
    plan,
    narration: { lines: narration.segments.length, voice: narration.voice, error: narration.error },
    bgm,
  };
}

/**
 * The track this film will play, or null to leave the choice to the worker.
 *
 * Reads the library straight from Storage and its review state from the
 * sidecar, so only tracks a human approved are candidates — the same rule the
 * worker's sync applies, checked here because this is where the decision now
 * happens. Returning null is a real outcome, not a failure: an empty library
 * or an unreachable bucket should fall back to the worker's own pick rather
 * than produce a silent film.
 */
async function chooseBgm(sb: TourDb, run: RunRow, shots: unknown[]) {
  try {
    const [{ selectBgm, paletteForCommunity }, { readBgmState }, { BGM_BUCKET, BGM_VIBES }] =
      await Promise.all([
        import('@/lib/bgm/select'),
        import('@/lib/bgm/state-store'),
        import('@/lib/bgm/storage'),
      ]);
    type Candidate = Parameters<typeof selectBgm>[0]['candidates'][number];
    const state = await readBgmState();
    const blocked = new Set([...state.rejected, ...(state.pending ?? [])]);

    const candidates: Candidate[] = [];
    for (const vibe of BGM_VIBES) {
      const { data } = await sb.storage.from(BGM_BUCKET).list(vibe, { limit: 1000 });
      for (const obj of data ?? []) {
        if (!/\.mp3$/i.test(obj.name)) continue;
        const path = `${vibe}/${obj.name}`;
        if (blocked.has(path)) continue;
        candidates.push({ path, meta: state.meta?.[path] });
      }
    }
    if (candidates.length === 0) return null;

    // Counts and distance, not a set of names: the pipeline forces bucket
    // variety, so which buckets EXIST says almost nothing.
    const bucketCounts: Record<string, number> = {};
    for (const sh of shots as Array<{ bucket?: string | null }>) {
      const b = sh.bucket ?? 'other';
      bucketCounts[b] = (bucketCounts[b] ?? 0) + 1;
    }
    const { data: links } = await sb
      .from('community_pois')
      .select('distance_m')
      .eq('community_id', run.community_id)
      .not('distance_m', 'is', null);
    const miles = (links ?? []).map((l) => (l.distance_m as number) / 1609).sort((a, b) => a - b);
    const medianMiles = miles.length > 0 ? (miles[Math.floor(miles.length / 2)] ?? null) : null;
    const vibe = paletteForCommunity({ bucketCounts, medianMiles });

    // What this community last shipped with. Keeping it is what actually makes
    // the choice stable: the seed only picks an index, so growing the library
    // moves every index and a re-render would come back with music nobody
    // reviewed. Assemblies are the record of what really went out.
    const { data: shipped } = await sb
      .from('tour_assemblies')
      .select('bgm')
      .eq('community_id', run.community_id)
      .not('bgm', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    const incumbent = (shipped?.[0]?.bgm as { path?: string } | null)?.path ?? null;

    // 'bed' always: this film is narrated, and a track that surges fights the
    // voice however well it suits the place.
    const picked = selectBgm({
      candidates,
      vibe,
      role: 'bed',
      seed: run.community_id,
      incumbent,
    });
    if (!picked) return null;
    return { path: picked.path, title: picked.meta?.title ?? null, vibe, role: 'bed' as const };
  } catch {
    return null;
  }
}

/**
 * The narration for this cut, or an empty script if the call fails.
 *
 * Never throws: the tour shipped with music alone until this week, so losing
 * narration is a downgrade, while a plan step that dies on a text-generation
 * call after paying for Curator is a regression. The reason is kept on the
 * step result so the admin table can say why the column is empty.
 */
async function writeNarration(sb: TourDb, run: RunRow, shots: unknown[]) {
  const { runNarration } = await import('../tour-orchestrator/narration');
  const { data: community } = await sb
    .from('communities')
    .select('name, city, state, narration_voice')
    .eq('id', run.community_id)
    .maybeSingle();

  // `narrative_angle` is the research step's one-line read on the place. It has
  // been written on every run since research shipped and consumed by nothing;
  // it is what stops every community opening the same way.
  const agents = (
    run.step_results.agent_research as { agents?: Record<string, unknown> } | undefined
  )?.agents;
  const narrativeAngle =
    Object.values((agents ?? {}) as Record<string, { parsed?: { narrative_angle?: unknown } }>)
      .map((a) => a?.parsed?.narrative_angle)
      .find((v): v is string => typeof v === 'string' && v.length > 0) ?? null;

  // What we know about each place beyond its name. Without this the model can
  // only caption the picture, which is exactly what it did (owner 2026-08-21:
  // "the narrative is just talking about the pics").
  const poiIds = [
    ...new Set(
      (shots as Array<{ poi_id?: string }>).map((sh) => sh.poi_id).filter(Boolean) as string[],
    ),
  ];
  const facts: Record<string, PlaceFact> = {};
  if (poiIds.length > 0) {
    const { data: links } = await sb
      .from('community_pois')
      .select(
        'poi_id, distance_m, intent_bucket, poi:pois(display_name, rating, user_ratings_total)',
      )
      .eq('community_id', run.community_id)
      .in('poi_id', poiIds);
    for (const l of links ?? []) {
      const poi = l.poi as unknown as {
        display_name?: string;
        rating?: number | null;
        user_ratings_total?: number | null;
      } | null;
      facts[l.poi_id as string] = {
        name: poi?.display_name ?? '',
        bucket: (l.intent_bucket as string) ?? 'other',
        miles: l.distance_m == null ? null : (l.distance_m as number) / 1609,
        rating: poi?.rating ?? null,
        reviews: poi?.user_ratings_total ?? null,
      };
    }
  }

  const fresh = await runNarration(
    shots as Array<{
      bucket?: string | null;
      poi_name?: string | null;
      poi_id?: string | null;
      duration_s: number;
    }>,
    {
      communityName: community?.name ?? 'this community',
      city: community?.city ?? null,
      state: community?.state ?? null,
      narrativeAngle,
      seed: run.community_id,
      voiceOverride: community?.narration_voice ?? null,
      facts,
    },
  );

  // A FAILED RUN MUST NOT ERASE A GOOD SCRIPT.
  //
  // The generator retries, but it can still come back empty, and this used to
  // save whatever it returned — so one bad reply replaced a working narration
  // with nothing, and the next assembly shipped a silent film without anything
  // going red. Keep the old script and carry the error alongside it, so the
  // admin says what happened and the film still speaks.
  const previous = (run.step_results.photos as { narration?: { segments?: unknown[] } } | undefined)
    ?.narration;
  if (!fresh.ok && (previous?.segments?.length ?? 0) > 0) {
    return { ...previous, error: fresh.error, stale: true } as typeof fresh & { stale: true };
  }
  return fresh;
}

// ─── step: tag ──────────────────────────────────────────────────────────────
