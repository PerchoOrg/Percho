'use server';

/**
 * Listing-scoped POI content pipeline.
 *
 * Thin adapter over `poi-actions-core.ts`, bound to LISTING_SCOPE. Not every
 * listing sits inside a curated community, but every listing must show nearby
 * videos — when a listing has no covering community, discovery anchors on the
 * listing itself and populates `listing_pois` / `listing_poi_photos`.
 *
 * POIs and their photos remain GLOBAL (`pois`, `poi_photos`, keyed on
 * google_place_id / google_photo_name) and are shared with the community
 * scope; only the join rows are listing-scoped.
 *
 * The pipeline itself lives in poi-actions-core.ts — it is shared with
 * community-actions.ts, which was a near-verbatim copy of this file
 * until 50.9.
 */

import { LISTING_SCOPE as SCOPE } from './entity-scope';
import {
  type DiscoverResult,
  type NearbyPoi,
  type PhotoFetchResult,
  discoverPois,
  fetchPhotosForPoi,
  loadNearbyPois,
  setPhotoStatus,
  setPoiStatus,
} from './poi-actions-core';
import type { PhotoStatus, PoiStatus } from './types';

export type ListingDiscoverResult = DiscoverResult;
export type ListingPhotoFetchResult = PhotoFetchResult;
export type NearbyPoiForListing = NearbyPoi;

export async function discoverPoisForListing(
  listingId: string,
  opts: { radiusMeters?: number; includedTypes?: readonly string[] } = {},
): Promise<ListingDiscoverResult> {
  return discoverPois(SCOPE, listingId, opts);
}

export async function fetchPhotosForListingPoi(
  listingId: string,
  poiId: string,
  opts: { max?: number; maxHeightPx?: number } = {},
): Promise<ListingPhotoFetchResult> {
  return fetchPhotosForPoi(SCOPE, listingId, poiId, opts);
}

export async function setListingPoiStatus(listingId: string, poiId: string, status: PoiStatus) {
  return setPoiStatus(SCOPE, listingId, poiId, status);
}

export async function setListingPhotoStatus(
  listingId: string,
  poiPhotoId: string,
  status: PhotoStatus,
) {
  return setPhotoStatus(SCOPE, listingId, poiPhotoId, status);
}

export async function loadNearbyPoisForListing(listingId: string): Promise<NearbyPoiForListing[]> {
  return loadNearbyPois(SCOPE, listingId);
}
