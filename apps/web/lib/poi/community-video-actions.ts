'use server';

/**
 * Community-scoped bucket video generation.
 *
 * Thin adapter over `bucket-video-core.ts`, bound to
 * COMMUNITY_BUCKET_VIDEO_SCOPE. Nearby content is neighborhood-shared, so one
 * dining video for "Waterside" serves every listing inside it.
 *
 * Photo pool: `community_poi_photos.status='approved'` for this community,
 * filtered by bucket via applicable_buckets (tagger) or the POI's
 * community_pois bucket (untagged fallback).
 *
 * Output: a `generated_videos` row with scope='community_intent_bucket',
 * community_id set, listing_id null.
 *
 * "Multiple videos, one primary" (owner 07-15): ready rows are never
 * superseded; community_videos.is_primary picks the one buyers see.
 *
 * The pipeline itself lives in bucket-video-core.ts — it is shared with the
 * listing scope, which this file duplicated near-verbatim until 50.8.
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
  COMMUNITY_BUCKET_VIDEO_SCOPE as SCOPE,
} from './bucket-video-scope';
import type { IntentBucket } from './types';

export type GenerateCommunityBucketVideoResult = GenerateBucketVideoResult<'community_not_found'>;
export type CommunityBucketVideoRow = BucketVideoRow;
export type CommunityBucketVideoStatus = BucketVideoStatus;

export async function generateCommunityBucketVideo(
  communityId: string,
  bucket: IntentBucket,
): Promise<GenerateCommunityBucketVideoResult> {
  return generateBucketVideo<'community_not_found'>(SCOPE, communityId, bucket);
}

export async function listCommunityBucketVideos(
  communityId: string,
): Promise<CommunityBucketVideoRow[]> {
  return listBucketVideos(SCOPE, communityId);
}

export async function getCommunityBucketVideoStatus(
  communityId: string,
  bucket: IntentBucket,
): Promise<CommunityBucketVideoStatus> {
  return getBucketVideoStatus(SCOPE, communityId, bucket);
}

export async function getCommunityBucketEligiblePhotoCount(
  communityId: string,
  bucket: IntentBucket,
): Promise<number> {
  return getBucketEligiblePhotoCount(SCOPE, communityId, bucket);
}

export async function regenerateCommunityBucketVideoNarrative(
  videoId: string,
): Promise<
  | { ok: true; narrative: NonNullable<CommunityBucketVideoStatus>['narrative'] }
  | { ok: false; message: string }
> {
  return regenerateBucketVideoNarrative(SCOPE, videoId);
}
