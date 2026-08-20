/**
 * The shot list: what the `photos` step plans and the `assemble` step renders.
 *
 * Lives apart from either step because both need it — photos computes and
 * persists it, assemble reads it back.
 */

import { RELIGIOUS_PHOTO_DROP_REASON, isReligiousPhoto } from '@/lib/poi/religious-content';
import type { TourPlanPhoto } from '@/lib/poi/tour-orchestrator/plan';
import type { PhotoAnnotation } from '@/lib/poi/tour-orchestrator/types';
import { type RunRow, type TourDb, mustWrite } from './shared';

/** One planned clip as the photos step persisted it. */
export interface PlannedShot {
  photo_id: string;
  poi_id: string;
  poi_name: string;
  engine: string;
  move: string | null;
  duration_s: number;
  prompt: string | null;
  ai_generated: boolean;
}

/** The shot list the photos step planned, or [] if it has not run. */
export function plannedShots(run: RunRow): PlannedShot[] {
  const photos = run.step_results.photos as { shots?: PlannedShot[] } | undefined;
  return Array.isArray(photos?.shots) ? photos.shots : [];
}

/**
 * How many clips a kind of place earns.
 *
 * Owner 2026-08-19: "some places like gym we only need 1 picture". Screen time
 * is the scarce thing in a 70-second film, and these places are not
 * equivalent — a park or a restaurant is atmosphere a buyer lingers on; a gym
 * or an urgent care is a fact they need confirmed once. One shot answers "yes,
 * there is one, and it is three miles away"; a second says nothing more.
 *
 * The community's own amenities get the most, because they are the subject.
 */
const CLIPS_BY_BUCKET: Record<string, number> = {
  amenities: 3,
  // 3, not 2. Two reasons, both the owner's on 2026-08-19: he asked for a
  // third Lambert High frame ("we can get another high school pic there as
  // well"), and the schools chapter has to be long enough for the voice-over
  // to name all three tiers ("school we may need to reserve some time for tts
  // to talk about it"). Schools are the one bucket he has called #1.
  schools: 3,
  outdoor: 2,
  dining: 2,
  shopping: 2,
  kids: 2,
  waterfront: 2,
  asian_community: 2,
  // Confirmed, not toured.
  fitness: 1,
  healthcare: 1,
  civic: 1,
  daily_errands: 1,
  pets: 1,
  transit: 1,
  work_hubs: 1,
  nightlife: 1,
  other: 1,
};
const DEFAULT_CLIPS_PER_POI = 2;

export function clipsAllowedFor(bucket: string | null | undefined): number {
  return CLIPS_BY_BUCKET[bucket ?? ''] ?? DEFAULT_CLIPS_PER_POI;
}

/**
 * A photo whose SUBJECT is an organised event, not the place itself.
 *
 * A tour answers "what is this place like on an ordinary day". A one-off event
 * fails that on its own terms: it dates the footage, it shows a crowd rather
 * than a facility, and the buyer learns nothing about the school from a hall
 * full of chairs. Note this is about events, not about people — incidental
 * people are wanted (owner 2026-08-19: "we should add some back so it is more
 * real"); an event as the subject is not.
 *
 * It is also the route by which content the place filter cannot see gets in.
 * Aberdeen's Riverwatch Middle School shipped a garlanded shrine, and the very
 * next cut carried a second frame from the same event — "Interior of a school
 * gymnasium during an organized cultural event with many attendees", with no
 * religious word anywhere in its tags for `isReligiousPhoto` to catch. Widening
 * that filter would have meant screening for cultural content by keyword, which
 * is the wrong instrument; excluding events is a rule that stands on its own
 * and closes the same hole.
 */
const EVENT_SUBJECT =
  /\b(event|celebration|festival|ceremony|gathering|attendees|crowd|performance|parade|assembly|banquet|graduation)\b/i;

export function isEventPhoto(t: { description?: string | null; tags?: readonly string[] | null }) {
  const text = [t.description ?? '', ...(t.tags ?? [])].join(' ');
  return text.trim() ? EVENT_SUBJECT.test(text) : false;
}

/** Shared: build the final shot list for a set of POIs. Photos step computes
 *  and persists this; assemble consumes it. Clips per POI vary by kind of
 *  place — see CLIPS_BY_BUCKET. */
export async function computeFinalShots(
  sb: TourDb,
  poiIds: string[],
  buckets?: Map<string, string>,
): Promise<{ shots: unknown[]; dropped: unknown[]; plan: unknown }> {
  const { data: photosRaw } = (await sb
    .from('poi_photos')
    .select(
      'id, poi_id, status, source, ai_tags, ai_score, storage_path, enhanced_path, enhanced_status, enhanced_meta, created_at, width_px, height_px, curator_tags, curator_version',
    )
    .in('poi_id', poiIds)
    .order('created_at', { ascending: false, nullsFirst: false })) as {
    data: Array<{
      id: string;
      poi_id: string;
      status: string | null;
      source: string | null;
      ai_tags: Record<string, unknown> | null;
      ai_score: number | null;
      storage_path: string | null;
      enhanced_path: string | null;
      enhanced_status: string | null;
      enhanced_meta: { width?: number; height?: number } | null;
      created_at: string | null;
      width_px: number | null;
      height_px: number | null;
      curator_tags: Record<string, unknown> | null;
      curator_version: number | null;
    }> | null;
  };

  // Per POI, keep the BEST photos by quality, not the newest. Quality =
  // usable (tagger verdict) first, then hand-picked over Places, then
  // ai_score, then newest as tiebreak.
  //
  // The allowance per POI is CLIPS_BY_BUCKET and nothing else. A separate cap
  // of two on Places photos used to sit alongside it (owner 2026-08-17:
  // "同一个poi最多2张照片"), from when every bucket was allowed two anyway; once
  // CLIPS_BY_BUCKET started varying by kind of place the two disagreed and the
  // smaller won silently. See the ranking below.
  //
  // Bounded, not unlimited. "都采纳 不受限制" (owner 2026-08-18) was set when
  // clips of one POI were scattered through the film; now that a POI plays as
  // one contiguous block, six pool photos are fifteen unbroken seconds of
  // pool, and the owner called it (2026-08-19: "too many pool pictures … limit
  // the number of same thing to 3").
  /**
   * Tagger categories that show a place as a whole rather than a detail of it.
   * One of these is promoted to lead its POI — see the ranking below.
   */
  const ESTABLISHING_CATEGORIES = new Set([
    'storefront',
    'landscape',
    'aerial',
    'building',
    'exterior',
  ]);
  const photos: NonNullable<typeof photosRaw> = [];
  const dropped: Array<{ photo_id: string; poi_id: string; reason: string }> = [];

  // Resolution gate, BEFORE the per-POI cap so a POI with a sharper alternate
  // uses it instead of spending its slot on a soft frame. Owner 2026-08-17, on
  // a 680x497 storefront that needed 4.25x to fill a 1080x1920 frame: the
  // duration rule shortens a soft clip, it cannot rescue one.
  const { upscaleFactor, isTooLowRes } = await import('@/lib/poi/tour-orchestrator/scheduler');
  const byPoi = new Map<string, NonNullable<typeof photosRaw>>();
  for (const p of photosRaw ?? []) {
    // Religious subject matter, checked on the PHOTO — first, because it is a
    // policy gate rather than a quality one. The place-level filter cannot see
    // this: Riverwatch Middle School is a school by every Places signal, and it
    // shipped a garlanded shrine in its gymnasium, tagged "cultural-celebration".
    const tags = (p.ai_tags ?? {}) as { description?: string; tags?: string[] };
    if (isReligiousPhoto({ description: tags.description, tags: tags.tags })) {
      dropped.push({ photo_id: p.id, poi_id: p.poi_id, reason: RELIGIOUS_PHOTO_DROP_REASON });
      continue;
    }
    // An organised event is not the place — see isEventPhoto.
    if (isEventPhoto({ description: tags.description, tags: tags.tags })) {
      dropped.push({
        photo_id: p.id,
        poi_id: p.poi_id,
        reason: 'the subject is an event, not the place',
      });
      continue;
    }
    // Measure the file the render will actually read. The worker reads the
    // enhanced file once an admin approves it (approved_enhanced_path in
    // scripts/render-worker/worker.py), and Real-ESRGAN x2 doubles both
    // edges — so judging an approved photo on its pre-enhance width is what
    // the enhance pass exists to prevent. width_px/height_px are never
    // rewritten on enhance; enhanced_meta carries the new size.
    const enhanced = p.enhanced_status === 'approved' ? p.enhanced_meta : null;
    const w = enhanced?.width ?? p.width_px;
    const h = enhanced?.height ?? p.height_px;
    if (w && h && isTooLowRes(w, h)) {
      dropped.push({
        photo_id: p.id,
        poi_id: p.poi_id,
        reason: `too low resolution — ${w}x${h} needs ${upscaleFactor(w, h).toFixed(1)}x upscale for 1080x1920`,
      });
      continue;
    }
    const arr = byPoi.get(p.poi_id) ?? [];
    arr.push(p);
    byPoi.set(p.poi_id, arr);
  }
  for (const arr of byPoi.values()) {
    const ranked = [...arr].sort((a, b) => {
      const aTags = (a.ai_tags ?? {}) as { usable?: boolean };
      const bTags = (b.ai_tags ?? {}) as { usable?: boolean };
      // User-rejected photos rank last (they still appear in dropped).
      const aRej = a.status === 'rejected' ? 0 : 1;
      const bRej = b.status === 'rejected' ? 0 : 1;
      if (aRej !== bRej) return bRej - aRej;
      const aUsable = aTags.usable === false ? 0 : 1;
      const bUsable = bTags.usable === false ? 0 : 1;
      if (aUsable !== bUsable) return bUsable - aUsable;
      // A hand-picked photo of this community outranks a generic Places photo
      // of the same POI, whatever the tagger scored them.
      const aSite = a.source === 'community_site' ? 1 : 0;
      const bSite = b.source === 'community_site' ? 1 : 0;
      if (aSite !== bSite) return bSite - aSite;
      const score = (b.ai_score ?? 0) - (a.ai_score ?? 0);
      if (score !== 0) return score;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
    // ONE cap per POI: `clipsAllowedFor`. Hand-picked photos still rank first
    // so they fill the slots ahead of generic Places frames.
    //
    // There used to be a second, independent cap of two on Places photos. With
    // both in force a school — whose photos are all from Places — could never
    // reach the three clips CLIPS_BY_BUCKET grants it, so Lambert High showed
    // two frames when the owner had just asked for a third. The two caps said
    // different things about the same number and the smaller silently won.
    // CLIPS_BY_BUCKET already encodes the intent per kind of place, and its
    // default is 2, so every bucket that is not amenities or schools keeps
    // exactly the allowance it had.
    const handPicked = (r: (typeof ranked)[number]) =>
      r.source === 'community_site' && r.status !== 'rejected';
    const allowed = clipsAllowedFor(buckets?.get(arr[0]!.poi_id));
    // One ESTABLISHING frame is promoted ahead of the score order.
    //
    // A place has to be recognisable before a detail of it means anything, and
    // ai_score does not know that: at the Windermere Publix a refrigerated
    // sushi case scored 0.95 and the storefront 0.85, so the film carried two
    // interiors and no shopfront (owner 2026-08-19: "why reject the Exterior
    // facade of a Publix supermarket storefront?"). Promotion, not a reserved
    // slot — a POI whose only photos are interiors is unchanged.
    const establishing = (r: (typeof ranked)[number]) =>
      r.status !== 'rejected' &&
      ESTABLISHING_CATEGORIES.has(
        ((r.ai_tags ?? {}) as { primary_category?: string }).primary_category ?? '',
      );
    const lead = ranked.find((r) => establishing(r) && !handPicked(r));
    const places = ranked.filter((r) => !handPicked(r) && r !== lead);
    const kept = [...ranked.filter(handPicked), ...(lead ? [lead] : []), ...places].slice(
      0,
      allowed,
    );
    const keptIds = new Set(kept.map((r) => r.id));
    photos.push(...kept);
    // Owner 2026-08-17: "另外一张放到drop table里并说明原因" — every photo
    // beyond the per-POI cap lands in dropped with the reason it lost.
    for (const row of ranked) {
      if (keptIds.has(row.id)) continue;
      const tags = (row.ai_tags ?? {}) as { usable?: boolean };
      const reason =
        row.status === 'rejected'
          ? 'rejected in Review'
          : tags.usable === false
            ? 'tagger-unusable'
            : `not in the top ${clipsAllowedFor(buckets?.get(row.poi_id))} for this place`;
      dropped.push({ photo_id: row.id, poi_id: row.poi_id, reason });
    }
  }

  const { data: poiRows } = (await sb
    .from('pois')
    .select('id, display_name, primary_type')
    .in('id', poiIds)) as {
    data: Array<{ id: string; display_name: string | null; primary_type: string | null }> | null;
  };
  const poiName = new Map((poiRows ?? []).map((p) => [p.id, p.display_name ?? '']));
  const { PLACES_TYPE_TO_BUCKET } = await import('@/lib/poi/google-places');
  const poiBucket = new Map(
    (poiRows ?? []).map((p) => [
      p.id,
      // The resolve step's bucket is the accurate one; primary_type is the
      // fallback for POIs the agent upserted with nothing but a place_id.
      buckets?.get(p.id) ??
        (p.primary_type ? (PLACES_TYPE_TO_BUCKET[p.primary_type] ?? 'other') : 'other'),
    ]),
  );

  // Photos the tagger or the reviewer already rejected never reach the Curator
  // — no point paying to annotate a frame that cannot be used.
  const usable: typeof photos = [];
  for (const p of photos ?? []) {
    const tags = (p.ai_tags ?? {}) as { usable?: boolean };
    const rejectedByUser = p.status === 'rejected';
    const rejectedByTagger = tags.usable === false;
    if (rejectedByUser || rejectedByTagger) {
      dropped.push({
        photo_id: p.id,
        poi_id: p.poi_id,
        reason: rejectedByUser ? 'rejected in Review' : 'tagger-unusable',
      });
      continue;
    }
    usable.push(p);
  }

  // Orchestration layer (2026-08-17): the engine/move/order/duration used to be
  // a category lookup here. It is now Curator → Scheduler → Guard → VO Pass,
  // which is the only place those decisions live. See
  // lib/poi/tour-orchestrator/. The ORIGINAL file is sent for annotation, not
  // the enhanced one: enhancement changes the light, and time_of_day is judged
  // from the light.
  const { buildTourPlan } = await import('@/lib/poi/tour-orchestrator/plan');
  const { CURATOR_VERSION } = await import('@/lib/poi/tour-orchestrator/curator');
  const { annotationSchema } = await import('@/lib/poi/tour-orchestrator/types');
  const planPhotos: TourPlanPhoto[] = [];
  // photo_id → annotation already stored at the current CURATOR_VERSION.
  const cached = new Map<string, PhotoAnnotation>();
  for (const p of usable) {
    const widthPx = p.width_px ?? 0;
    const heightPx = p.height_px ?? 0;
    if (!p.storage_path || widthPx <= 0 || heightPx <= 0) {
      dropped.push({
        photo_id: p.id,
        poi_id: p.poi_id,
        reason: 'no stored file or no pixel dimensions',
      });
      continue;
    }
    // A photo whose annotation is already cached at the current version never
    // has to be downloaded, let alone uploaded to the model.
    const cachedAnnotation =
      p.curator_version === CURATOR_VERSION && p.curator_tags
        ? annotationSchema.safeParse(p.curator_tags)
        : null;
    let bytes = new Uint8Array();
    if (!cachedAnnotation?.success) {
      const { data: blob, error: dlErr } = await sb.storage
        .from('listing-photos')
        .download(p.storage_path);
      if (dlErr || !blob) {
        dropped.push({ photo_id: p.id, poi_id: p.poi_id, reason: 'storage download failed' });
        continue;
      }
      bytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      cached.set(p.id, cachedAnnotation.data);
    }
    const tags = (p.ai_tags ?? {}) as { description?: string };
    planPhotos.push({
      photo_id: p.id,
      poi_id: p.poi_id,
      poi_name: poiName.get(p.poi_id) ?? '',
      bucket: poiBucket.get(p.poi_id) ?? 'other',
      width_px: widthPx,
      height_px: heightPx,
      description: tags.description ?? '',
      bytes,
      mime_type: 'image/jpeg',
    });
  }

  if (planPhotos.length === 0) return { shots: [], dropped, plan: null };

  const plan = await buildTourPlan(planPhotos, cached);

  // Persist what was freshly annotated, so the next run of this step reuses it
  // instead of paying again (owner 2026-08-17: "every time rerun would make llm
  // call that is expensive").
  for (const a of plan.curator.fresh) {
    // Losing this silently means paying the Curator again on every future run.
    await mustWrite(
      `cache curator_tags(${a.photo_id})`,
      sb
        .from('poi_photos')
        .update({
          curator_tags: a,
          curator_version: CURATOR_VERSION,
          curated_at: new Date().toISOString(),
        })
        .eq('id', a.photo_id),
    );
  }
  for (const id of plan.curator.missing) {
    const photo = planPhotos.find((p) => p.photo_id === id);
    dropped.push({
      photo_id: id,
      poi_id: photo?.poi_id ?? '',
      reason: 'curator returned no annotation',
    });
  }
  for (const ex of plan.excluded) {
    const photo = planPhotos.find((p) => p.photo_id === ex.photo_id);
    dropped.push({ photo_id: ex.photo_id, poi_id: photo?.poi_id ?? '', reason: ex.reason });
  }

  // The on-screen label, computed here because this is where the POI's bucket
  // and distance are already in hand; the render worker just draws
  // `clip.label`. See clip-label.ts for why a community tour carries text and
  // the listing tour deliberately does not.
  const { clipLabel } = await import('@/lib/poi/tour-orchestrator/clip-label');
  const { data: distRows } = (await sb
    .from('community_pois')
    .select('poi_id, distance_m')
    .in('poi_id', poiIds)) as { data: Array<{ poi_id: string; distance_m: number | null }> | null };
  const distanceByPoi = new Map((distRows ?? []).map((r) => [r.poi_id, r.distance_m]));

  const labelled = plan.shots.map((s) => {
    const { name, distance } = clipLabel({
      poiName: poiName.get(s.poi_id) ?? s.poi_name ?? '',
      bucket: buckets?.get(s.poi_id) ?? poiBucket.get(s.poi_id) ?? null,
      distanceM: distanceByPoi.get(s.poi_id) ?? null,
    });
    // Two fields, not one string: the overlay is a pinned card that stacks the
    // place name over its distance, right-aligned (owner 2026-08-19).
    return { ...s, label: name, label_distance: distance };
  });

  // A school POI can survive selection and still reach the cut with nothing to
  // show — `photos.ts` reserves its slot, then the per-photo resolution gate
  // empties it. That is how Aberdeen shipped without a high school, and without
  // a word about it anywhere. The film still renders; review can now see that a
  // tier is gone (owner 2026-08-19: "schools are #1 important to have").
  const shotPois = new Set(labelled.map((s) => s.poi_id));
  const schoolWarnings = poiIds
    .filter((id) => (buckets?.get(id) ?? poiBucket.get(id)) === 'schools' && !shotPois.has(id))
    .map((id) => ({
      code: 'school_tier_missing' as const,
      photo_id: '',
      detail: `${poiName.get(id) ?? id} was selected but produced no usable shot`,
    }));

  return {
    shots: labelled,
    dropped,
    // Everything review needs to judge the plan, persisted next to it.
    plan: {
      warnings: [...plan.warnings, ...schoolWarnings],
      violations: plan.violations,
      narration: plan.narration,
      curator: plan.curator,
      vo: plan.vo,
    },
  };
}
