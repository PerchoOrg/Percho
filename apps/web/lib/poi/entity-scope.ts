/**
 * What distinguishes a listing from a community in the POI pipelines.
 * Everything else about the two flows is identical.
 *
 * Before this existed, `listing-actions.ts` / `community-actions.ts` and
 * `listing-video-actions.ts` / `community-video-actions.ts` were four files
 * that were really two: 403 of 429 and 435 of 451 lines matched once the
 * entity noun was normalised away. Every fix had to be made twice, and in
 * practice they drifted (see the link-error and scope-guard notes in
 * poi-actions-core.ts and bucket-video-core.ts).
 *
 * Adding a third scope now means adding one object here, not copying two
 * ~500-line files.
 */
import type { IntentBucket } from './types';

/**
 * What the POI discovery and photo fetch need (`poi-actions-core.ts`). A city
 * (phase318) is one of these, but not a `PoiEntityScope`: it has no bucket
 * videos, and `generated_videos` has no `city_id`.
 */
export interface PoiPlaceScope {
  /** Used in log prefixes and error `reason` strings. */
  readonly kind: 'listing' | 'community' | 'city';
  /** Log prefix shared by both pipelines. */
  readonly logPrefix: string;

  // ─── entity ───────────────────────────────────────────────────────────
  readonly entityTable: 'listings' | 'communities' | 'cities';
  /** Column that names the entity in user-facing copy. */
  readonly labelColumn: 'address' | 'name';
  /** Used when `labelColumn` is null on the row. */
  readonly labelFallback: string;

  // ─── join tables ──────────────────────────────────────────────────────
  /** Owning FK on the per-scope join tables. */
  readonly idColumn: 'listing_id' | 'community_id' | 'city_id';
  readonly poiTable: 'listing_pois' | 'community_pois' | 'city_pois';
  readonly photoJoinTable: 'listing_poi_photos' | 'community_poi_photos' | 'city_poi_photos';

  readonly notFoundReason: 'listing_not_found' | 'community_not_found' | 'city_not_found';
  readonly notFoundMessage: string;

  // ─── messages / routing ───────────────────────────────────────────────
  anchorNotFound(entityId: string): string;
  missingLatLng(label: string): string;
  revalidatePathFor(entityId: string): string;
}

/** A place that also has bucket videos — a listing or a community. */
export interface PoiEntityScope extends PoiPlaceScope {
  readonly kind: 'listing' | 'community';
  readonly entityTable: 'listings' | 'communities';
  /** Owning FK on generated_videos and on the per-scope join tables. */
  readonly idColumn: 'listing_id' | 'community_id';
  /** The other owning FK, explicitly nulled on insert. */
  readonly otherIdColumn: 'listing_id' | 'community_id';
  readonly poiTable: 'listing_pois' | 'community_pois';
  readonly photoJoinTable: 'listing_poi_photos' | 'community_poi_photos';
  /** `generated_videos.scope` discriminator. */
  readonly videoScope: 'listing_intent_bucket' | 'community_intent_bucket';
  readonly notFoundReason: 'listing_not_found' | 'community_not_found';
}

export const LISTING_SCOPE: PoiEntityScope = {
  kind: 'listing',
  logPrefix: '[listing-poi]',
  entityTable: 'listings',
  labelColumn: 'address',
  labelFallback: 'this listing',
  idColumn: 'listing_id',
  otherIdColumn: 'community_id',
  poiTable: 'listing_pois',
  photoJoinTable: 'listing_poi_photos',
  videoScope: 'listing_intent_bucket',
  notFoundReason: 'listing_not_found',
  notFoundMessage: 'Listing not found or not owned by you.',
  anchorNotFound: (id) => `listing ${id} not found or not owned`,
  missingLatLng: (label) => `listing "${label}" has no lat/lng — geocode before running discovery`,
  revalidatePathFor: (id) => `/dashboard/listings/${id}/edit`,
};

export const COMMUNITY_SCOPE: PoiEntityScope = {
  kind: 'community',
  logPrefix: '[community-poi]',
  entityTable: 'communities',
  labelColumn: 'name',
  labelFallback: 'this community',
  idColumn: 'community_id',
  otherIdColumn: 'listing_id',
  poiTable: 'community_pois',
  photoJoinTable: 'community_poi_photos',
  videoScope: 'community_intent_bucket',
  notFoundReason: 'community_not_found',
  notFoundMessage: 'Community not found.',
  anchorNotFound: (id) => `community ${id} not found`,
  missingLatLng: (label) =>
    `community "${label}" has no lat/lng — geocode the subdivision anchor first`,
  revalidatePathFor: (id) => `/dashboard/communities/${id}`,
};

export const CITY_SCOPE: PoiPlaceScope = {
  kind: 'city',
  logPrefix: '[city-poi]',
  entityTable: 'cities',
  labelColumn: 'name',
  labelFallback: 'this city',
  idColumn: 'city_id',
  poiTable: 'city_pois',
  photoJoinTable: 'city_poi_photos',
  notFoundReason: 'city_not_found',
  notFoundMessage: 'City not found.',
  anchorNotFound: (id) => `city ${id} not found`,
  missingLatLng: (label) => `city "${label}" has no lat/lng — set its town-centre point first`,
  revalidatePathFor: (id) => `/admin/pipeline/city-tours/${id}`,
};

/** Storage bucket for POI photos. Shared by every scope. */
export const POI_PHOTO_BUCKET = 'listing-photos';

// ─── bucket-video result shapes ─────────────────────────────────────────

export type GenerateBucketVideoResult<NotFound extends string> =
  | {
      ok: true;
      video_id: string;
      photo_count: number;
      status: 'pending' | 'processing';
    }
  | {
      ok: false;
      reason:
        | 'unauthorized'
        | NotFound
        | 'not_enough_photos'
        | 'already_in_progress'
        | 'internal_error';
      message: string;
      approved_count?: number;
    };

export type BucketVideoRow = {
  video_id: string;
  bucket: IntentBucket;
  status: 'pending' | 'processing' | 'ready' | 'approved' | 'rejected' | 'failed' | 'superseded';
  cf_stream_uid: string | null;
  duration_s: number | null;
  photo_count: number;
  error: string | null;
  created_at: string;
};

export type BucketVideoStatus = {
  video_id: string;
  status: 'pending' | 'processing' | 'ready' | 'approved' | 'rejected' | 'failed';
  cf_stream_uid: string | null;
  duration_s: number | null;
  photo_count: number;
  error: string | null;
  created_at: string;
  narrative?: (import('./narrative').VideoNarrative & { source?: string }) | null;
} | null;
