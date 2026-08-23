/**
 * The shot list: what the `photos` step plans and the `assemble` step renders.
 *
 * Lives apart from either step because both need it — photos computes and
 * persists it, assemble reads it back.
 */

import { RELIGIOUS_PHOTO_DROP_REASON, isReligiousPhoto } from '@/lib/poi/religious-content';
import {
  AMENITY_LABEL,
  type Amenity,
  COMMUNITY_ACT_CLIP_BUDGET,
  amenityOf,
  communityActSlots,
} from '@/lib/poi/tour-orchestrator/amenity';
import type { TourPlanPhoto } from '@/lib/poi/tour-orchestrator/plan';
import { CANVAS_H, CANVAS_W } from '@/lib/poi/tour-orchestrator/scheduler';
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
 * The pipeline's own verdict on one photo, before any ordering happens.
 *
 * These are the gates that say a photo is UNUSABLE — policy and measurable
 * quality — as opposed to the per-POI caps and scoring, which only say a
 * usable photo did not make this particular cut. Only the former is a verdict
 * worth writing to `poi_photos.status`, and the distinction is the whole point:
 * "rejected" has to mean "never use this", or the owner's review list fills up
 * with photos that were merely runners-up.
 *
 * Exported so the `photos` step can record the verdict BEFORE the owner
 * reviews, and `computeFinalShots` can apply the same test after. One function,
 * so the proposal he reviews and the filter that runs later cannot disagree.
 */
/**
 * Listing photography, in a film that is not a listing.
 *
 * A community film is about the community. One house shot as a portrait is a
 * listing photo whatever site it came from, and a kitchen is a listing photo
 * even when nobody lives there yet — Bellmoore Park's builder site handed the
 * pipeline 92 interior and exterior photos of two specific houses for sale
 * (2026-08-23). Several houses together are a different thing: a streetscape
 * reads as a neighbourhood, which is the subject.
 *
 * Owner, setting the line: "it is ok to have photos for multiple houses to
 * give a vibe but not single one even inside designs".
 *
 * A rejection, not a deletion: the photo sits in the table with its reason and
 * the owner can promote it, which is the point of the review.
 */
const LISTING_SCOPES = new Set(['single_home', 'home_interior']);
export const LISTING_PHOTO_DROP_REASON = 'listing photo — one home, not the community';

export function initialVerdict(p: {
  ai_tags?: Record<string, unknown> | null;
  width_px?: number | null;
  height_px?: number | null;
  enhanced_status?: string | null;
  enhanced_meta?: { width?: number; height?: number } | null;
  storage_path?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const tags = (p.ai_tags ?? {}) as {
    description?: string;
    tags?: string[];
    usable?: boolean;
    residential_scope?: string;
  };
  if (isReligiousPhoto({ description: tags.description, tags: tags.tags })) {
    return { ok: false, reason: RELIGIOUS_PHOTO_DROP_REASON };
  }
  if (tags.usable === false) return { ok: false, reason: 'tagger-unusable' };
  // Defaults to 'none' when the tagger did not say, so photos tagged before
  // `residential_scope` existed keep whatever verdict they already had.
  if (LISTING_SCOPES.has(String(tags.residential_scope ?? 'none'))) {
    return { ok: false, reason: LISTING_PHOTO_DROP_REASON };
  }
  const enhanced = p.enhanced_status === 'approved' ? p.enhanced_meta : null;
  const w = enhanced?.width ?? p.width_px ?? 0;
  const h = enhanced?.height ?? p.height_px ?? 0;
  if (!p.storage_path || w <= 0 || h <= 0) {
    return { ok: false, reason: 'no stored file or no pixel dimensions' };
  }
  // Resolution is NOT a rejection. Owner 2026-08-20: "we should decide based on
  // content first, quality can be improved with rendering" — and he is right,
  // because the rendering that fixes it is ours: Real-ESRGAN doubles the edges
  // and a reframe re-renders the frame at 768x1376, which together clear this
  // gate from well below it. Lambert High's 512px facade is the proof; it was
  // dropped as too small and is now three clips in the film.
  //
  // Rejecting on a fixable property also created a loop: reframing was only
  // queued for photos in the cut, and a photo could not enter the cut while it
  // was too small. `runPlan` breaks it by queueing a rescue for exactly these.
  return { ok: true };
}

/**
 * Too small to fill the canvas even with the zoom headroom.
 *
 * Exported for the rescue in `runPlan`: this is no longer a rejection (see
 * `initialVerdict`), it is a "needs rendering first" signal.
 */
export function tooLowRes(w: number, h: number): boolean {
  const upscale = Math.max(CANVAS_W / w, CANVAS_H / h) * ZOOM_HEADROOM;
  return upscale > MAX_UPSCALE;
}
const ZOOM_HEADROOM = 1.1;
const MAX_UPSCALE = 2.0;

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
      'id, poi_id, status, reviewed_by, source, ai_tags, ai_score, storage_path, enhanced_path, enhanced_status, enhanced_meta, created_at, width_px, height_px, curator_tags, curator_version',
    )
    .in('poi_id', poiIds)
    .order('created_at', { ascending: false, nullsFirst: false })) as {
    data: Array<{
      id: string;
      poi_id: string;
      status: string | null;
      reviewed_by: string | null;
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

  // The community is a special POI, and that is the whole reason for the split
  // below. One synthetic row holds every photo its website handed over —
  // Bellmoore Park's held 49, covering five amenities — so a cap keyed on
  // `poi_id` gives the pool, the clubhouse and the gate three slots BETWEEN
  // them, and lets whichever sorted first take all three. It did: the cut of
  // 2026-08-23 opened on three streetscapes of houses and showed no amenity at
  // all. Owner: "for website, the rule should be applied on the amenity level,
  // not poi level, the community itself is a special poi."
  //
  // So its photos group by what they SHOW, and the act's allowance is
  // COMMUNITY_ACT_CLIP_BUDGET across all of them rather than one POI's three.
  const GROUP_SEP = '\u0000';
  const amenityOfKey = (key: string): Amenity | null => {
    const i = key.indexOf(GROUP_SEP);
    return i < 0 ? null : (key.slice(i + 1) as Amenity);
  };
  const amenityByPhoto = new Map<string, Amenity>();
  const byPoi = new Map<string, NonNullable<typeof photosRaw>>();
  for (const p of photosRaw ?? []) {
    // Religious subject matter, checked on the PHOTO — first, because it is a
    // policy gate rather than a quality one. The place-level filter cannot see
    // this: Riverwatch Middle School is a school by every Places signal, and it
    // shipped a garlanded shrine in its gymnasium, tagged "cultural-celebration".
    const tags = (p.ai_tags ?? {}) as {
      description?: string;
      tags?: string[];
      primary_category?: string;
      residential_scope?: string;
    };
    if (isReligiousPhoto({ description: tags.description, tags: tags.tags })) {
      dropped.push({ photo_id: p.id, poi_id: p.poi_id, reason: RELIGIOUS_PHOTO_DROP_REASON });
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
    let key = p.poi_id;
    if (buckets?.get(p.poi_id) === 'amenities') {
      const amenity = amenityOf(tags);
      amenityByPhoto.set(p.id, amenity);
      key = `${p.poi_id}${GROUP_SEP}${amenity}`;
    }
    const arr = byPoi.get(key) ?? [];
    arr.push(p);
    byPoi.set(key, arr);
  }

  // ONE allocation for the whole community act, made before any group is cut,
  // because the amenities are competing with each other for the same budget
  // and a per-group decision cannot see that. Counts only photos still in
  // play — a rejected one is not material the act can spend a slot on.
  const availableByAmenity = new Map<Amenity, number>();
  for (const [key, arr] of byPoi) {
    const amenity = amenityOfKey(key);
    if (!amenity) continue;
    const live = arr.filter((r) => r.status !== 'rejected').length;
    if (live > 0) availableByAmenity.set(amenity, live);
  }
  const amenitySlots = communityActSlots(availableByAmenity, {
    budget: COMMUNITY_ACT_CLIP_BUDGET,
    ceiling: clipsAllowedFor('amenities'),
  });

  for (const [groupKey, arr] of byPoi) {
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
    // Two kinds of "picked by a person", and both outrank a Places photo:
    // one the owner approved in the review, and one an admin ingested from the
    // community's own site. His explicit approval also survives the per-POI
    // cap below — a verdict he gave by hand is not a candidate to be ranked
    // (owner 2026-08-20: "the photos i manually approved are not in the plan").
    const ownerApproved = (r: (typeof ranked)[number]) =>
      !!r.reviewed_by && r.status === 'approved';
    const handPicked = (r: (typeof ranked)[number]) =>
      ownerApproved(r) || (r.source === 'community_site' && r.status !== 'rejected');
    const groupAmenity = amenityOfKey(groupKey);
    const allowed = groupAmenity
      ? (amenitySlots.get(groupAmenity) ?? 0)
      : clipsAllowedFor(buckets?.get(arr[0]!.poi_id));
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
    // The owner's own approvals are not subject to `allowed`. The cap exists to
    // stop a POI monopolising the film with interchangeable Places photos; it
    // has no business overruling someone who looked at the frame and said yes.
    const mine = ranked.filter(ownerApproved);
    const rest = [...ranked.filter((r) => handPicked(r) && !ownerApproved(r))];
    const kept = [
      ...mine,
      ...[...rest, ...(lead ? [lead] : []), ...places].slice(0, Math.max(0, allowed - mine.length)),
    ];
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
            : groupAmenity
              ? allowed === 0
                ? `${AMENITY_LABEL[groupAmenity]} got no slot in the community act's ${COMMUNITY_ACT_CLIP_BUDGET} clips`
                : `not in the top ${allowed} for ${AMENITY_LABEL[groupAmenity]}`
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

  // The community's POI is named after the PAGE the ingest was pointed at, and
  // that name is now wrong in two ways at once: it says the same thing for
  // every clip in the act — Bellmoore Park's read "Bellmoore Park Bellmoore
  // Park" three times over — and it says nothing about what is on screen. The
  // amenity does both jobs, so the label, the narration's place list and the
  // scheduler's grouping all read "Bellmoore Park Pool".
  let communityName = '';
  if (amenityByPhoto.size > 0) {
    const { data: communityRow } = (await sb
      .from('community_pois')
      .select('communities(name)')
      .in('poi_id', poiIds)
      .limit(1)
      .maybeSingle()) as { data: { communities: { name: string | null } | null } | null };
    communityName = communityRow?.communities?.name ?? '';
  }
  const displayNameFor = (photoId: string, poiId: string): string => {
    const amenity = amenityByPhoto.get(photoId);
    if (!amenity) return poiName.get(poiId) ?? '';
    const label = AMENITY_LABEL[amenity];
    return communityName ? `${communityName} ${label}` : label;
  };
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

  // Anything not rejected is a CANDIDATE. `approved` is this step's OUTPUT —
  // `runPlan` stamps it on whatever ends up in the shot list — so reading it as
  // an input here would be circular: nothing could ever be chosen the first
  // time. What the review controls is the rejected set, and that is enforced
  // right here.
  const usable: typeof photos = [];
  for (const p of photos ?? []) {
    if (p.status === 'rejected') {
      dropped.push({ photo_id: p.id, poi_id: p.poi_id, reason: 'rejected in Review' });
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
      poi_name: displayNameFor(p.id, p.poi_id),
      amenity: amenityByPhoto.get(p.id),
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
      // The plan's name first: for a community amenity it is the only one that
      // says which amenity this is.
      poiName: s.poi_name || (poiName.get(s.poi_id) ?? ''),
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
