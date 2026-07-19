/**
 * `/nearby` → 308 redirect to `/browse?tab=nearby`.
 *
 * the standalone /nearby grid was folded into the
 * Explore page as a sub-tab (Douyin recommendation/local model). The route is kept as
 * a permanent redirect so external links, profile shortcuts, and the
 * `percho:nearby_radius` localStorage flow (handed off to <NearbyClient>
 * unchanged inside /browse) keep working.
 *
 * The `NearbyClient` component itself still lives at
 * `app/(public)/nearby/NearbyClient.tsx` — `/browse/page.tsx` imports it.
 */
import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function NearbyPage() {
  permanentRedirect('/browse');
}
