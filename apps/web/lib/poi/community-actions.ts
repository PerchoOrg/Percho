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
  discoverPois,
  fetchPhotosForPoi,
  loadNearbyPois,
  setPhotoStatus,
} from './poi-actions-core';
import type { PhotoStatus, ReviewAction } from './types';

export type CommunityDiscoverResult = DiscoverResult;
export type CommunityPhotoFetchResult = PhotoFetchResult;
export type NearbyPoiForCommunity = NearbyPoi;
export type { ReviewAction };

/**
 * Every export here is a server action: its arguments arrive from the browser.
 * So nothing a caller passes may widen what runs — the Places radius and type
 * list stay the server's defaults (each type is one billed Nearby call), and
 * `actor` is not accepted at all. A `{ actor: 'service' }` from the client used
 * to skip the session check and run on the service role. Trusted callers that
 * need `actor` (the tour steps) import `poi-actions-core` directly.
 */
export async function discoverPoisForCommunity(
  communityId: string,
): Promise<CommunityDiscoverResult> {
  return discoverPois(SCOPE, communityId);
}

export async function fetchPhotosForCommunityPoi(
  communityId: string,
  poiId: string,
  opts: { max?: number; maxHeightPx?: number } = {},
): Promise<CommunityPhotoFetchResult> {
  return fetchPhotosForPoi(SCOPE, communityId, poiId, {
    max: opts.max,
    maxHeightPx: opts.maxHeightPx,
  });
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
