import type { Metadata } from 'next';
import { NearbyClient } from '../../nearby/NearbyClient';

export const metadata: Metadata = {
  title: 'Nearby · Percho',
  description: 'Listings near your current location.',
};

export const dynamic = 'force-dynamic';

/**
 * /browse/nearby — radius-bound listings around the viewer's geolocation.
 *
 * Phase 45 (2026-06-20): Nearby was Phase 37-collapsed into Explore as a
 * sub-tab on the same page, then Phase 43.7 dropped that split entirely.
 * Now it's resurrected as its own route under /browse/* so the global
 * TopBar can render Explore | Nearby as proper sub-tabs (per
 * nav-config.getSubTabs). The radius preference, geolocation flow, and
 * grid markup all reuse the existing <NearbyClient> component verbatim.
 *
 * The legacy `/nearby` route still 308-redirects to /browse (Explore) for
 * external link compatibility — see app/(public)/nearby/page.tsx.
 */
export default function BrowseNearbyPage() {
  return (
    <div className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
      <NearbyClient />
    </div>
  );
}
