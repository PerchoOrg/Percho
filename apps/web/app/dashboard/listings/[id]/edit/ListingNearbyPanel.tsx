'use client';

/**
 * Listing-scoped adapter over the shared `NearbyPanel`. Keyed on a listing so
 * that listings without a covering community still get nearby videos; backed
 * by listing_pois / listing_poi_photos + listing-scoped video actions. POIs
 * and photo binaries stay global (pois / poi_photos).
 *
 * No logic here — the entity difference lives in `LISTING_NEARBY_SCOPE`
 * (`app/_components/nearby-panel/scope.ts`), the client-side twin of
 * `lib/poi/entity-scope.ts`.
 */

import { NearbyPanel } from '@/app/_components/nearby-panel/NearbyPanel';
import { LISTING_NEARBY_SCOPE } from '@/app/_components/nearby-panel/scope';
import type { NearbyPoiForListing } from '@/lib/poi/listing-actions';

export function ListingNearbyPanel({
  listingId,
  initialPois,
  supabaseStorageBase,
  photoBucket,
}: {
  listingId: string;
  initialPois: NearbyPoiForListing[];
  /** Public Supabase storage host, so we can render photos by storage_path. */
  supabaseStorageBase: string;
  /** Bucket name where poi photos live (default: "listing-photos"). */
  photoBucket?: string;
}) {
  return (
    <NearbyPanel
      entityId={listingId}
      scope={LISTING_NEARBY_SCOPE}
      initialPois={initialPois}
      supabaseStorageBase={supabaseStorageBase}
      photoBucket={photoBucket}
    />
  );
}
