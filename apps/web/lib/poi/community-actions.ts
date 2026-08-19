'use server';

/**
 * Community-scoped POI content pipeline.
 *
 * Thin adapter over `poi-actions-core.ts`, bound to COMMUNITY_SCOPE.
 * Nearby content is neighborhood-shared, so one discovery pass for
 * "Waterside" serves every listing inside it, populating `community_pois` /
 * `community_poi_photos`.
 *
 * POIs and their photos remain GLOBAL (`pois`, `poi_photos`) and are shared
 * with the listing scope; only the join rows are community-scoped.
 *
 * The pipeline itself lives in poi-actions-core.ts — it is shared with
 * listing-actions.ts, which this file duplicated near-verbatim until 50.9.
 */

import { COMMUNITY_SCOPE as SCOPE } from './entity-scope';
import {
  type DiscoverResult,
  type NearbyPoi,
  type PhotoFetchResult,
  type PoiActor,
  discoverPois,
  fetchPhotosForPoi,
  loadNearbyPois,
  setPhotoStatus,
  setPoiStatus,
} from './poi-actions-core';
import type { PhotoStatus, PoiStatus, ReviewAction } from './types';

export type CommunityDiscoverResult = DiscoverResult;
export type CommunityPhotoFetchResult = PhotoFetchResult;
export type NearbyPoiForCommunity = NearbyPoi;
export type { ReviewAction };

export async function discoverPoisForCommunity(
  communityId: string,
  opts: { radiusMeters?: number; includedTypes?: readonly string[] } = {},
): Promise<CommunityDiscoverResult> {
  return discoverPois(SCOPE, communityId, opts);
}

/** `opts.actor: 'service'` skips the session check — admin scripts only, and
 *  never from a value a request supplied. See PoiActor. */
export async function fetchPhotosForCommunityPoi(
  communityId: string,
  poiId: string,
  opts: { max?: number; maxHeightPx?: number; actor?: PoiActor } = {},
): Promise<CommunityPhotoFetchResult> {
  return fetchPhotosForPoi(SCOPE, communityId, poiId, opts);
}

export async function setCommunityPoiStatus(communityId: string, poiId: string, status: PoiStatus) {
  return setPoiStatus(SCOPE, communityId, poiId, status);
}

export async function setCommunityPhotoStatus(
  communityId: string,
  poiPhotoId: string,
  status: PhotoStatus,
) {
  return setPhotoStatus(SCOPE, communityId, poiPhotoId, status);
}

export async function loadNearbyPoisForCommunity(
  communityId: string,
): Promise<NearbyPoiForCommunity[]> {
  return loadNearbyPois(SCOPE, communityId);
}
