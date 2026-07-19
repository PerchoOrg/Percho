import type { Metadata } from 'next';
import { CommunitiesNearbyClient } from './CommunitiesNearbyClient';

export const metadata: Metadata = {
  title: 'Nearby Neighborhoods · Percho',
  description: 'Neighborhoods with videos near your current location.',
};

export const dynamic = 'force-dynamic';

/**
 * /communities/nearby — geolocation-driven community grid.
 *
 * . The TopBar pins Explore | Nearby sub-tabs on
 * /communities/* (see app/_components/nav-config.ts → getSubTabs). Owner
 * spec: communities themselves don't have lat/lng but the videos inside
 * them do (community_videos.lat/lng, Phase 11 migration). So Nearby here
 * = "communities that have at least one video within radius mi".
 *
 * Sorts by closest video distance. Grid card shape is identical to
 * /communities so the surfaces stay visually consistent.
 */
export default function CommunitiesNearbyPage() {
  return (
    <div className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
      <CommunitiesNearbyClient />
    </div>
  );
}
