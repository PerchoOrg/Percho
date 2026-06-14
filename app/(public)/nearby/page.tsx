/**
 * `/nearby` — Pinterest-style grid of listings within the buyer's radius.
 *
 * Phase 14 (2026-06-13): visually consistent with `/browse` (Explore).
 * Same card shape, same click-through to the swipe feed. The radius
 * preference moved off this page — it now lives in `/profile` →
 * Preferences (persisted in `localStorage` since buyers are anon in V1).
 *
 * Flow:
 *   1. Mount → request browser geolocation (one-time prompt).
 *   2. Read radius preference from localStorage (default 10 mi).
 *   3. GET /api/nearby?lat&lng&radius → render Explore-style grid.
 *
 * If geolocation is denied, fall back to a manual lat/lng input.
 */

import { NearbyClient } from './NearbyClient';

export const metadata = {
  title: 'Nearby · Vicinity',
};

export const dynamic = 'force-dynamic';

export default function NearbyPage() {
  return (
    <main className="min-h-dvh bg-ink pb-20 text-cream md:pb-0">
      <header className="sticky top-0 z-20 flex items-center justify-center border-cream/10 border-b bg-ink/85 px-4 py-3 backdrop-blur-md md:hidden">
        <div className="font-medium text-cream/80 text-sm uppercase tracking-wider">Nearby</div>
      </header>
      <NearbyClient />
    </main>
  );
}
