/**
 * `photos` step — fetch photos for each surviving POI, then plan the shot
 * list from them. Writes progress as it goes so a long run is not mistaken
 * for a dead one.
 */
import type { PoiActor } from '@/lib/poi/poi-actions-core';
import { type RunRow, type TourDb, asJson, mustWrite, saveStep, setRunStatus } from './shared';
import { computeFinalShots } from './shots';

/**
 * How many places outside the community a film may visit.
 *
 * Derived from the runtime, not chosen: the tour targets 45-90s, a place gets
 * up to 3 clips, and a clip runs 2-4.5s. Ten surrounding places plus the
 * community's own amenities lands inside that; twenty-two produced 96s.
 */
const SURROUNDING_POI_BUDGET = 10;

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

  const { fetchPhotosForCommunityPoi } = await import('@/lib/poi/community-actions');
  const results: Record<string, unknown> = {};
  const resolvedPoiIds: string[] = [];
  const fetchedPhotoIds: string[] = [];
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
          raw_place: asJson(rawPlace),
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

  // `community_pois` — not `resolve.resolved` — is the community's POI set.
  // Resolve is how most of them got there, but not the only way: amenity POIs
  // are ingested from the community's own site (PhotoSourcePanel /
  // ingest-community-photos.ts), and an admin can add a place the research
  // agent missed. Aberdeen is the case in point — its HOA recommends four
  // county parks within 2.6 miles and the agent proposed none of them
  // (owner 2026-08-19). Anything linked to the community belongs in the film,
  // however it arrived, so the set is unioned here and any POI without photos
  // gets the same Places fetch a resolved one would.
  const { data: links } = (await sb
    .from('community_pois')
    .select('poi_id, intent_bucket')
    .eq('community_id', run.community_id)
    .neq('status', 'rejected')) as {
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

    const { data: rows } = await sb
      .from('poi_photos')
      .select('id')
      .eq('poi_id', link.poi_id)
      .is('tagged_at', null);
    // Tagging is what gives the Curator something to plan with; an untagged
    // photo is invisible to the shot list.
    fetchedPhotoIds.push(...(rows ?? []).map((row: { id: string }) => row.id));
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
  const amenityIds = resolvedPoiIds.filter((id) => bucketByPoiId.get(id) === 'amenities');
  const surrounding = resolvedPoiIds.filter((id) => bucketByPoiId.get(id) !== 'amenities');
  if (surrounding.length > SURROUNDING_POI_BUDGET) {
    const scoreByPoi = new Map<string, number>();
    for (const poi of resolve.resolved) {
      const id = placeIdToPoiId.get(poi.place_id);
      if (id && typeof poi.score === 'number') scoreByPoi.set(id, poi.score);
    }
    const byBucket = new Map<string, string[]>();
    for (const id of surrounding) {
      const b = bucketByPoiId.get(id) ?? 'other';
      const arr = byBucket.get(b) ?? [];
      arr.push(id);
      byBucket.set(b, arr);
    }
    for (const arr of byBucket.values()) {
      arr.sort((a, b) => (scoreByPoi.get(b) ?? 0) - (scoreByPoi.get(a) ?? 0));
    }
    // Buckets themselves in score order, so when the budget runs out it is the
    // weakest kind of place that misses out, not whichever sorted last.
    const bucketOrder = [...byBucket.keys()].sort(
      (a, b) =>
        (scoreByPoi.get(byBucket.get(b)![0]!) ?? 0) - (scoreByPoi.get(byBucket.get(a)![0]!) ?? 0),
    );
    const kept: string[] = [];
    // Schools take their slots before the round-robin starts. A pure
    // round-robin gives every bucket one before any bucket gets two, so with
    // ten buckets and ten slots the film would carry exactly one school —
    // and elementary/middle/high is the thing this buyer pool decides on
    // (owner 2026-08-19: "school is very important one").
    const schools = byBucket.get('schools') ?? [];
    kept.push(...schools.slice(0, SCHOOL_SLOTS));
    byBucket.set('schools', schools.slice(SCHOOL_SLOTS));

    for (let round = 0; kept.length < SURROUNDING_POI_BUDGET; round++) {
      let placed = false;
      for (const b of bucketOrder) {
        const id = byBucket.get(b)?.[round];
        if (!id) continue;
        if (kept.includes(id)) continue;
        kept.push(id);
        placed = true;
        if (kept.length >= SURROUNDING_POI_BUDGET) break;
      }
      if (!placed) break; // every bucket exhausted
    }
    resolvedPoiIds.length = 0;
    resolvedPoiIds.push(...amenityIds, ...kept);
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
      await mustWrite(
        `queue ${toEnhance.length} photo(s) for enhancement`,
        sb
          .from('poi_photos')
          .update({ enhanced_status: 'queued', enhanced_error: null })
          .in('id', toEnhance),
      );
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
  return { ok: true, poiCount: Object.keys(results).length, awaitingReview: true };
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
    resolved_poi_ids?: string[];
    auto_tag?: unknown;
  };
  const resolvedPoiIds = photosStep.resolved_poi_ids ?? [];
  if (resolvedPoiIds.length === 0) {
    throw new Error('run the photos step first — no resolved POIs to plan from');
  }

  // Buckets come from the link table rather than from the photos step's saved
  // state: the owner's review sits between the two, and he can re-bucket a POI
  // while he is in there.
  const { data: links } = (await sb
    .from('community_pois')
    .select('poi_id, intent_bucket')
    .eq('community_id', run.community_id)) as {
    data: Array<{ poi_id: string; intent_bucket: string | null }> | null;
  };
  const bucketByPoiId = new Map<string, string>(
    (links ?? []).map((l) => [l.poi_id, l.intent_bucket ?? 'other']),
  );

  const { shots, dropped, plan } = await computeFinalShots(sb, resolvedPoiIds, bucketByPoiId);

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

  await saveStep(sb, run, 'photos', {
    ...photosStep,
    phase: 'done',
    outpaint_queued: outpaintCandidates.length,
    shots,
    dropped,
    plan,
  });
  await setRunStatus(sb, run.id, 'tagging');
  return { ok: true, shots: shots.length, dropped: dropped.length, plan };
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
