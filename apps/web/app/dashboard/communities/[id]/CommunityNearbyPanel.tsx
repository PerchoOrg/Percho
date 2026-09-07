'use client';

/**
 * Community-scoped adapter over the shared `NearbyPanel`. Scoped to a
 * community so multiple listings inside the same neighborhood share one set
 * of nearby videos; keyed on communityId and backed by community_pois /
 * community_poi_photos + community-scoped video actions.
 *
 * No logic here — the entity difference lives in `COMMUNITY_NEARBY_SCOPE`
 * (`app/_components/nearby-panel/scope.ts`), the client-side twin of
 * `lib/poi/entity-scope.ts`.
 */

import { NearbyPanel } from '@/app/_components/nearby-panel/NearbyPanel';
import { COMMUNITY_NEARBY_SCOPE } from '@/app/_components/nearby-panel/scope';
import type { NearbyPoiForCommunity } from '@/lib/poi/community-actions';

export function CommunityNearbyPanel({
  communityId,
  initialPois,
  supabaseStorageBase,
  photoBucket,
}: {
  communityId: string;
  initialPois: NearbyPoiForCommunity[];
  /** Public Supabase storage host, so we can render photos by storage_path. */
  supabaseStorageBase: string;
  /** Bucket name where poi photos live (default: "listing-photos"). */
  photoBucket?: string;
}) {
  return (
    <NearbyPanel
      entityId={communityId}
      scope={COMMUNITY_NEARBY_SCOPE}
      initialPois={initialPois}
      supabaseStorageBase={supabaseStorageBase}
      photoBucket={photoBucket}
    />
  );
}
