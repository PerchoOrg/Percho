'use server';

/**
 * Listing-scoped bucket video generation.
 *
 * Thin adapter over `bucket-video-core.ts`, bound to
 * LISTING_BUCKET_VIDEO_SCOPE. Used when a listing has no covering community —
 * every listing must show nearby videos, so discovery + video generation can
 * anchor on the listing directly. POI photos stay global (poi_photos); only
 * the join / ownership rows are listing-scoped.
 *
 * Output: a `generated_videos` row with scope='listing_intent_bucket',
 * listing_id set, community_id null. The EC2 render worker polls the same
 * table (see scripts/render-worker/worker.py).
 *
 * The pipeline itself lives in bucket-video-core.ts — it is shared with the
 * community scope, which was a near-verbatim copy of this file until 50.8.
 */

import {
  generateBucketVideo,
  getBucketEligiblePhotoCount,
  getBucketVideoStatus,
  listBucketVideos,
  regenerateBucketVideoNarrative,
} from './bucket-video-core';
import {
  type BucketVideoRow,
  type BucketVideoStatus,
  type GenerateBucketVideoResult,
  LISTING_SCOPE as SCOPE,
} from './entity-scope';
import type { IntentBucket } from './types';

export type GenerateListingBucketVideoResult = GenerateBucketVideoResult<'listing_not_found'>;
export type ListingBucketVideoRow = BucketVideoRow;
export type ListingBucketVideoStatus = BucketVideoStatus;

export async function generateListingBucketVideo(
  listingId: string,
  bucket: IntentBucket,
): Promise<GenerateListingBucketVideoResult> {
  return generateBucketVideo<'listing_not_found'>(SCOPE, listingId, bucket);
}

export async function listListingBucketVideos(listingId: string): Promise<ListingBucketVideoRow[]> {
  return listBucketVideos(SCOPE, listingId);
}

export async function getListingBucketVideoStatus(
  listingId: string,
  bucket: IntentBucket,
): Promise<ListingBucketVideoStatus> {
  return getBucketVideoStatus(SCOPE, listingId, bucket);
}

export async function getListingBucketEligiblePhotoCount(
  listingId: string,
  bucket: IntentBucket,
): Promise<number> {
  return getBucketEligiblePhotoCount(SCOPE, listingId, bucket);
}

export async function regenerateListingBucketVideoNarrative(
  videoId: string,
): Promise<
  | { ok: true; narrative: NonNullable<ListingBucketVideoStatus>['narrative'] }
  | { ok: false; message: string }
> {
  return regenerateBucketVideoNarrative(SCOPE, videoId);
}
