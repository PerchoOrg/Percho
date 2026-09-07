/**
 * The only thing that differs between a listing's nearby panel and a
 * community's — which server actions to call, which buckets to render, and
 * what to call the video. The client-side twin of `lib/poi/entity-scope.ts`:
 * adding a third entity type means adding one object here, not a third copy
 * of the panel.
 *
 * Until 2026-09-06 the two panels were separate 1,100-line files that matched
 * on all but ~60 lines, and had already diverged — the listing copy was
 * missing the unknown-bucket guard the community copy gained on 2026-08-17.
 */

import {
  discoverPoisForCommunity,
  fetchPhotosForCommunityPoi,
  loadNearbyPoisForCommunity,
  setCommunityPhotoStatus,
} from '@/lib/poi/community-actions';
import {
  generateCommunityBucketVideo,
  getCommunityBucketEligiblePhotoCount,
  getCommunityBucketVideoStatus,
  regenerateCommunityBucketVideoNarrative,
} from '@/lib/poi/community-video-actions';
import type { BucketVideoStatus, GenerateBucketVideoResult } from '@/lib/poi/entity-scope';
import {
  discoverPoisForListing,
  fetchPhotosForListingPoi,
  loadNearbyPoisForListing,
  setListingPhotoStatus,
} from '@/lib/poi/listing-actions';
import {
  generateListingBucketVideo,
  getListingBucketEligiblePhotoCount,
  getListingBucketVideoStatus,
  regenerateListingBucketVideoNarrative,
} from '@/lib/poi/listing-video-actions';
import type { DiscoverResult, NearbyPoi, PhotoFetchResult } from '@/lib/poi/poi-actions-core';
import type { IntentBucket, PhotoStatus } from '@/lib/poi/types';

export type NearbyPanelPoi = NearbyPoi;

export interface NearbyPanelScope {
  /** Buckets rendered, in order. */
  buckets: IntentBucket[];
  /** `title` on the inline Cloudflare Stream iframe. */
  videoTitle: string;
  loadPois: (entityId: string) => Promise<NearbyPoi[]>;
  discover: (entityId: string) => Promise<DiscoverResult>;
  fetchPhotos: (entityId: string, poiId: string) => Promise<PhotoFetchResult>;
  setPhotoStatus: (entityId: string, poiPhotoId: string, status: PhotoStatus) => Promise<unknown>;
  getVideoStatus: (entityId: string, bucket: IntentBucket) => Promise<BucketVideoStatus>;
  getEligiblePhotoCount: (entityId: string, bucket: IntentBucket) => Promise<number>;
  generateVideo: (
    entityId: string,
    bucket: IntentBucket,
  ) => Promise<GenerateBucketVideoResult<string>>;
  regenerateNarrative: (
    videoId: string,
  ) => Promise<
    | { ok: true; narrative: NonNullable<BucketVideoStatus>['narrative'] }
    | { ok: false; message: string }
  >;
}

export const BUCKET_LABELS: Record<IntentBucket, string> = {
  amenities: 'Community Amenities',
  schools: 'Schools',
  dining: 'Dining',
  nightlife: 'Nightlife & Entertainment',
  shopping: 'Shopping',
  outdoor: 'Outdoor & Trails',
  fitness: 'Fitness & Wellness',
  kids: 'Kids & Family',
  asian_community: 'Asian Community',
  daily_errands: 'Daily Errands',
  faith: 'Faith Communities',
  work_hubs: 'Work Hubs',
  healthcare: 'Healthcare',
  pets: 'Pets',
  transit: 'Transit & Commute',
};

export const BUCKET_SHORT: Record<IntentBucket, string> = {
  amenities: 'Amenities',
  schools: 'Schools',
  dining: 'Dining',
  nightlife: 'Nightlife',
  shopping: 'Shopping',
  outdoor: 'Outdoor',
  fitness: 'Fitness',
  kids: 'Kids',
  asian_community: 'Asian',
  daily_errands: 'Errands',
  faith: 'Faith',
  work_hubs: 'Work',
  healthcare: 'Health',
  pets: 'Pets',
  transit: 'Transit',
};

/**
 * Everything a listing renders. `faith` is deliberately absent — places of
 * worship are excluded from every generated tour (fair-housing policy, owner
 * 2026-08-19; see `lib/poi/religious-content.ts`). `amenities` is a
 * community-level bucket, so it is absent here too; both stay in the label
 * maps above because those must cover `IntentBucket`.
 */
const LISTING_BUCKETS: IntentBucket[] = [
  'schools',
  'dining',
  'nightlife',
  'shopping',
  'outdoor',
  'fitness',
  'kids',
  'asian_community',
  'daily_errands',
  'work_hubs',
  'healthcare',
  'pets',
  'transit',
];

const COMMUNITY_BUCKETS: IntentBucket[] = ['amenities', ...LISTING_BUCKETS];

export const LISTING_NEARBY_SCOPE: NearbyPanelScope = {
  buckets: LISTING_BUCKETS,
  videoTitle: 'Nearby listing video',
  loadPois: loadNearbyPoisForListing,
  discover: (id) => discoverPoisForListing(id),
  fetchPhotos: (id, poiId) => fetchPhotosForListingPoi(id, poiId),
  setPhotoStatus: setListingPhotoStatus,
  getVideoStatus: getListingBucketVideoStatus,
  getEligiblePhotoCount: getListingBucketEligiblePhotoCount,
  generateVideo: generateListingBucketVideo,
  regenerateNarrative: regenerateListingBucketVideoNarrative,
};

export const COMMUNITY_NEARBY_SCOPE: NearbyPanelScope = {
  buckets: COMMUNITY_BUCKETS,
  videoTitle: 'Nearby community video',
  loadPois: loadNearbyPoisForCommunity,
  discover: (id) => discoverPoisForCommunity(id),
  fetchPhotos: (id, poiId) => fetchPhotosForCommunityPoi(id, poiId),
  setPhotoStatus: setCommunityPhotoStatus,
  getVideoStatus: getCommunityBucketVideoStatus,
  getEligiblePhotoCount: getCommunityBucketEligiblePhotoCount,
  generateVideo: generateCommunityBucketVideo,
  regenerateNarrative: regenerateCommunityBucketVideoNarrative,
};
