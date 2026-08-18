/**
 * `photos` step — fetch photos for each surviving POI, then plan the shot
 * list from them. Writes progress as it goes so a long run is not mistaken
 * for a dead one.
 */
import { type RunRow, type TourDb, asJson, mustWrite, saveStep, setRunStatus } from './shared';
import { computeFinalShots } from './shots';

export async function runPhotos(sb: TourDb, run: RunRow) {
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
      });
      if (linkErr) {
        results[poi.place_id] = {
          skipped: `community link failed: ${(linkErr as { message?: string })?.message ?? 'unknown'}`,
        };
        continue;
      }
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
