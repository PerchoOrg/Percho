/**
 * `photos` step — fetch photos for each surviving POI, then plan the shot
 * list from them. Writes progress as it goes so a long run is not mistaken
 * for a dead one.
 */
import type { PoiActor } from '@/lib/poi/poi-actions-core';
import type { PlaceFact } from '../tour-orchestrator/insights';
import { tourPoiIds } from '../tour-poi-set';
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
 * How long the photos step may spend tagging in one invocation.
 *
 * The route is `maxDuration = 300` on Vercel and a Gemini tag measures ~3.5s,
 * so an unbounded loop over a backlog gets the whole invocation killed — and a
 * platform kill skips the catch that records the failure, leaving the run
 * stuck on `fetching_photos`. 150s leaves room for the fetch that precedes it
 * and the judging that follows (owner 2026-08-23).
 */
const TAG_BUDGET_MS = 150_000;

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

  // WHAT THE STEP OWES WORK TO IS THE POIs IN SCOPE — not what this
  // invocation happened to download.
  //
  // Enhancing and tagging used to run off `fetchedPhotoIds`, filled only when
  // a fetch returned NEW photos. So the second time the step ran, every POI
  // already had its photos, every fetch came back `{ fetched: 0, reused: n }`,
  // the list stayed empty, and the step enhanced nothing and tagged nothing —
  // then reported itself complete. Apremont - Highcroft came out of a clean
  // run with 30 of 67 photos untagged and a green tick (owner 2026-08-23:
  // "clicked fetch and tag, it shows complete, but many are untagged"). Those
  // 30 had been downloaded by the runs that timed out before tagging reached
  // them, which is exactly the state a resumable step has to be able to see.
  const scopePhotos: Array<{ id: string; tagged_at: string | null; enhanced_status: string }> = [];
  for (let i = 0; i < resolvedPoiIds.length; i += 100) {
    const { data } = (await sb
      .from('poi_photos')
      .select('id, tagged_at, enhanced_status')
      .in('poi_id', resolvedPoiIds.slice(i, i + 100))
      .neq('status', 'rejected')) as {
      data: Array<{ id: string; tagged_at: string | null; enhanced_status: string }> | null;
    };
    scopePhotos.push(...(data ?? []));
  }

  // Auto-enhance the panel's photos (owner 2026-08-17): the enhance QUEUE is
  // poi_photos.enhanced_status itself — render-worker claims `queued` rows.
  // Set to queued unless already enhanced (ready/approved/rejected = keep
  // whatever exists; failed = retry once). Thumbnails + clips then pick up
  // the enhanced file automatically (approved → enhanced_path).
  //
  // 'queued' and 'processing' are left alone too. Re-writing 'queued' over a
  // row the worker has already claimed hands the same photo out twice, and a
  // re-run of this step is meant to cost nothing (owner 2026-08-23).
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

  // Auto-tag (owner 2026-08-17): each community has only dozens of photos, so
  // tagging needs no manual trigger.
  //
  // Bounded by the clock, not by a count. This route is `maxDuration = 300` on
  // Vercel, a tag costs ~3.5s, and a platform kill skips the catch block that
  // would have recorded a failure — so a run that overruns leaves a row
  // claiming to be in progress forever (see DEVLOG 2026-08-23 02:45). Under
  // budget the step finishes and opens the review gate; over it, the step says
  // so and stays on `tagging` for another click, which now resumes rather than
  // repeats.
  const untaggedIds = scopePhotos.filter((p) => !p.tagged_at).map((p) => p.id);
  const { tagPoiPhoto } = await import('@/lib/poi/vision-tagger');
  const tagStartedAt = Date.now();
  let tagged = 0;
  let attempted = 0;
  for (const id of untaggedIds) {
    if (Date.now() - tagStartedAt > TAG_BUDGET_MS) break;
    attempted += 1;
    const r = await tagPoiPhoto(id);
    if (r.ok) tagged += 1;
  }
  const remaining = untaggedIds.length - tagged;
  const taggedCount: Record<string, unknown> = {
    tagged,
    total: untaggedIds.length,
    remaining,
    ...(attempted < untaggedIds.length ? { stopped_on: 'time_budget' } : {}),
  };

  // Untagged photos are invisible to the Curator, so a review over a
  // half-tagged set is a review of the wrong thing. Stop here and say what is
  // left rather than opening the gate on it.
  if (remaining > 0) {
    await saveStep(sb, run, 'photos', {
      phase: 'tagging',
      results,
      resolved_poi_ids: resolvedPoiIds,
      auto_tag: taggedCount,
      shots: [],
      dropped: [],
    });
    await setRunStatus(sb, run.id, 'tagging');
    return {
      phase: 'tagging',
      auto_tag: taggedCount,
      message: `Tagged ${tagged}. ${remaining} photo(s) still untagged — run Fetch & Tag again.`,
    };
  }

  // Reject what CANNOT be used. Nothing here approves anything.
  //
  // Two different questions were sharing one column. "Is this photo usable at
  // all" is policy and measurable quality, and the pipeline can answer it here,
  // before the owner looks. "Does it go in the film" is the shot list, which
  // only exists after planning — so `plan` is what writes 'approved', and
  // approved therefore means exactly "in the current cut" (owner 2026-08-19:
  // "approved can not be 82!!"). Everything in between stays 'pending': usable,
  // not chosen, available for him to promote.
  //
  // Only rows still 'pending' are touched. A verdict the owner has already
  // given is his, and a re-run must not quietly overturn it.
  const { initialVerdict } = await import('./shots');
  // The POIs this step fetched and tagged for — no more, no less.
  //
  // Judging a narrower set than it tagged left the rest tagged-but-unjudged:
  // four photos one run fetched came back marked unusable by the tagger and
  // stayed 'pending', which the table renders as a red "rejected" sitting in
  // the Pending section (owner 2026-08-20: "i see some rejected photos in the
  // pending section"). Fetching, tagging and judging have to cover the same
  // set or the difference shows up as rows that contradict themselves — which
  // is why this is `resolvedPoiIds` and not another read of `community_pois`.
  // That read covered every link, including the hundreds of `candidate` rows
  // the Nearby button leaves behind, which this step no longer touches.
  const judgeablePoiIds = [...new Set(resolvedPoiIds)];

  const { data: toJudge } = (await sb
    .from('poi_photos')
    .select(
      'id, status, ai_tags, width_px, height_px, enhanced_status, enhanced_meta, storage_path',
    )
    .in('poi_id', judgeablePoiIds)
    .eq('status', 'pending')) as { data: Array<Record<string, unknown>> | null };

  // Grouped by reason so the verdict is written WITH its justification. A bare
  // 'rejected' made an automated call indistinguishable from the owner's own,
  // which left the automated ones unauditable — and two have already turned out
  // to be wrong this session (owner 2026-08-20: "we need to add reasons").
  const byReason = new Map<string, string[]>();
  for (const row of toJudge ?? []) {
    const v = initialVerdict(row as Parameters<typeof initialVerdict>[0]);
    if (v.ok) continue;
    const ids = byReason.get(v.reason) ?? [];
    ids.push(row.id as string);
    byReason.set(v.reason, ids);
  }
  let unusableCount = 0;
  for (const [reason, ids] of byReason) {
    unusableCount += ids.length;
    await mustWrite(
      `reject ${ids.length} photo(s): ${reason}`,
      sb.from('poi_photos').update({ status: 'rejected', rejection_reason: reason }).in('id', ids),
    );
  }

  // STOP HERE. Everything above is the automated half: fetch, enhance, tag,
  // initial filtering. Planning is a separate step the owner starts himself,
  // after reviewing what this produced.
  //
  // Owner 2026-08-19, defining the workflow: "for each community, you will do
  // the heavy lift work, including agent research and fetch photos, tagging,
  // and initial filtering, then i will do second manual review of approved and
  // rejected ones, after that, you can continue on the planning, clip
  // generation and assembly."
  //
  // The gate is the point. Automated filters cut the pile down; they do not
  // make the editorial call. Running straight into planning both hid that
  // decision and made his review pointless, because the shot list was already
  // fixed by the time he saw the photos.
  await saveStep(sb, run, 'photos', {
    phase: 'review',
    results,
    resolved_poi_ids: resolvedPoiIds,
    auto_tag: taggedCount,
    shots: [],
    dropped: [],
  });
  await setRunStatus(sb, run.id, 'review');
  return {
    ok: true,
    poiCount: Object.keys(results).length,
    awaitingReview: true,
    autoRejected: unusableCount,
    autoTagged: tagged,
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
    | { resolved?: Array<{ place_id: string }> }
    | undefined;
  const scopePoiIds = await tourPoiIds(sb, run.community_id, resolveStep?.resolved);

  const { data: allLinks } = (await sb
    .from('community_pois')
    .select('poi_id, intent_bucket, ai_score')
    .eq('community_id', run.community_id)
    .neq('status', 'rejected')) as {
    data: Array<{ poi_id: string; intent_bucket: string | null; ai_score: number | null }> | null;
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
    const scoreByPoi = new Map<string, number>();
    for (const l of links) {
      if (typeof l.ai_score === 'number') scoreByPoi.set(l.poi_id, l.ai_score);
    }
    cutPoiIds = [
      ...amenityIds,
      ...selectSurroundingPois({
        surrounding,
        bucketOf: (id) => bucketByPoiId.get(id) ?? 'other',
        scoreOf: (id) => scoreByPoi.get(id) ?? 0,
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

  // Queue reframing — AFTER selection, so it only runs on photos that reach
  // the film. Aberdeen has 103 photos linked but 29 in the cut, of which 21
  // are badly framed; outpainting all 103 would be four times the cost for
  // work nobody sees (owner 2026-08-19: "i see only 29 selected right?").
  //
  // The threshold means "already in a good shape" is left alone: a 3:4
  // portrait loses 25% to the crop and passes through untouched.
  const outpaintCandidates = await selectOutpaintCandidates(
    sb,
    shots as Array<{ photo_id?: string; engine?: string }>,
  );
  if (outpaintCandidates.length > 0) {
    await mustWrite(
      `queue ${outpaintCandidates.length} photo(s) for reframing`,
      sb
        .from('poi_photos')
        .update({ outpaint_status: 'queued', outpaint_error: null })
        .in('id', outpaintCandidates),
    );
  }

  // RESCUE — photos that are only too small, on POIs the film is visiting.
  //
  // Resolution stopped being a rejection (owner 2026-08-20: "we should decide
  // based on content first, quality can be improved with rendering"), which
  // leaves the question of who does the rendering. This does: a reframe
  // re-renders the frame at 768x1376 and the enhance pass takes that to
  // 1536x2752, clearing a gate the original failed from well below.
  //
  // It also breaks a loop that used to need hands. Reframing was queued only
  // for photos already in the cut, and a photo could not enter the cut while
  // it was too small — Lambert High's 512px facade sat outside for exactly that
  // reason until it was queued by hand. Queued here, it lands before the next
  // plan, which then picks it up on its own.
  const { tooLowRes } = await import('./shots');
  const { data: candidates } = (await sb
    .from('poi_photos')
    .select('id, width_px, height_px, enhanced_status, enhanced_meta, outpaint_status')
    .in('poi_id', cutPoiIds)
    .neq('status', 'rejected')) as {
    data: Array<{
      id: string;
      width_px: number | null;
      height_px: number | null;
      enhanced_status: string | null;
      enhanced_meta: { width?: number; height?: number } | null;
      outpaint_status: string | null;
    }> | null;
  };
  const chosenIds = new Set(
    (shots as Array<{ photo_id?: string }>).map((sh) => sh.photo_id).filter(Boolean) as string[],
  );
  const rescue = (candidates ?? [])
    .filter((c) => {
      if (chosenIds.has(c.id)) return false; // already in; nothing to rescue
      // Not already reframed, in flight, or deliberately set aside.
      if (c.outpaint_status && c.outpaint_status !== 'none') return false;
      const enh = c.enhanced_status === 'approved' ? c.enhanced_meta : null;
      const w = enh?.width ?? c.width_px ?? 0;
      const h = enh?.height ?? c.height_px ?? 0;
      return w > 0 && h > 0 && tooLowRes(w, h);
    })
    .map((c) => c.id);
  if (rescue.length > 0) {
    await mustWrite(
      `queue ${rescue.length} undersized photo(s) for a rescue reframe`,
      sb
        .from('poi_photos')
        .update({ outpaint_status: 'queued', outpaint_error: null })
        .in('id', rescue),
    );
  }

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
    outpaint_queued: outpaintCandidates.length,
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
    rescueQueued: rescue.length,
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
    .select('name, city, state')
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

/**
 * Which of the chosen photos are framed badly enough to be worth reframing.
 *
 * Three filters, each of which removes real spend:
 *  - Seedance shots are excluded. That engine generates its own 496x864 video
 *    from the photo and does the aspect conversion itself, so reframing first
 *    pays for work the video model redoes (owner 2026-08-19).
 *  - Photos already close to 9:16 are left alone.
 *  - Photos already reframed or in flight are not paid for twice on a re-run.
 */
async function selectOutpaintCandidates(
  sb: TourDb,
  shots: Array<{ photo_id?: string; engine?: string }>,
): Promise<string[]> {
  const ids = shots
    .filter((s) => s.engine !== 'seedance')
    .map((s) => s.photo_id)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const { needsOutpaint } = await import('@/lib/poi/outpaint');
  const { data: rows } = (await sb
    .from('poi_photos')
    .select('id, width_px, height_px, outpaint_status')
    .in('id', ids)) as {
    data: Array<{
      id: string;
      width_px: number | null;
      height_px: number | null;
      outpaint_status: string | null;
    }> | null;
  };
  return (rows ?? [])
    .filter(
      (r) => !r.outpaint_status || r.outpaint_status === 'none' || r.outpaint_status === 'failed',
    )
    .filter((r) => r.width_px && r.height_px && needsOutpaint(r.width_px, r.height_px))
    .map((r) => r.id);
}

// ─── step: tag ──────────────────────────────────────────────────────────────
