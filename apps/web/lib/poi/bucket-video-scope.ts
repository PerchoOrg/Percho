/**
 * What distinguishes a listing-scoped bucket video from a community-scoped
 * one. Everything else about the two flows is identical.
 *
 * Before this existed, `listing-video-actions.ts` and
 * `community-video-actions.ts` were ~93% the same file (435 of 451 lines
 * matched once the entity noun was normalised away). Every fix to the photo
 * pool, the cross-bucket dedup or the walk-in ordering had to be made twice,
 * and in practice the two drifted — see the `scope` guard note on
 * `regenerateBucketVideoNarrative` in bucket-video-core.ts.
 *
 * Adding a third scope (say agent-scoped tours) now means adding one object
 * here, not copying a third 450-line file.
 */
import type { IntentBucket } from './types';

export interface BucketVideoScope {
  /** Used in log prefixes and error `reason` strings. */
  readonly kind: 'listing' | 'community';
  /** `generated_videos.scope` discriminator. */
  readonly scope: 'listing_intent_bucket' | 'community_intent_bucket';
  /** Owning FK on `generated_videos` and on the per-scope join tables. */
  readonly idColumn: 'listing_id' | 'community_id';
  /** The other owning FK, explicitly nulled on insert. */
  readonly otherIdColumn: 'listing_id' | 'community_id';
  /** Entity table, and the column that names it in user-facing copy. */
  readonly entityTable: 'listings' | 'communities';
  readonly labelColumn: 'address' | 'name';
  /** Used when `labelColumn` is null on the row. */
  readonly labelFallback: string;
  /** Per-scope photo approval join table. */
  readonly photoJoinTable: 'listing_poi_photos' | 'community_poi_photos';
  /** Per-scope POI/bucket assignment table. */
  readonly poiTable: 'listing_pois' | 'community_pois';
  /** `reason` returned when the entity lookup misses. */
  readonly notFoundReason: 'listing_not_found' | 'community_not_found';
  readonly notFoundMessage: string;
  /** Page to revalidate after a write. */
  revalidatePathFor(entityId: string): string;
}

export const LISTING_BUCKET_VIDEO_SCOPE: BucketVideoScope = {
  kind: 'listing',
  scope: 'listing_intent_bucket',
  idColumn: 'listing_id',
  otherIdColumn: 'community_id',
  entityTable: 'listings',
  labelColumn: 'address',
  labelFallback: 'this listing',
  photoJoinTable: 'listing_poi_photos',
  poiTable: 'listing_pois',
  notFoundReason: 'listing_not_found',
  notFoundMessage: 'Listing not found or not owned by you.',
  revalidatePathFor: (id) => `/dashboard/listings/${id}/edit`,
};

export const COMMUNITY_BUCKET_VIDEO_SCOPE: BucketVideoScope = {
  kind: 'community',
  scope: 'community_intent_bucket',
  idColumn: 'community_id',
  otherIdColumn: 'listing_id',
  entityTable: 'communities',
  labelColumn: 'name',
  labelFallback: 'this community',
  photoJoinTable: 'community_poi_photos',
  poiTable: 'community_pois',
  notFoundReason: 'community_not_found',
  notFoundMessage: 'Community not found.',
  revalidatePathFor: (id) => `/dashboard/communities/${id}`,
};

/** Shape returned by both generate entry points. */
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
