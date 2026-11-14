/**
 * Whether the public web shows home listings at all.
 *
 * Off since phase311 (owner, 2026-11-14: "web上不要显示房子"). The web follows
 * the iOS v1.0 rule — communities only (`apps/mobile/lib/listings-in-app.ts`,
 * DEVLOG phase308). The FMLS rows on the site are demo data, and the licence
 * fee falls due when live listings are first displayed (Appendix B), so
 * nothing listing-shaped reaches a buyer until the owner turns this back on.
 *
 * Off means: every buyer-facing listing route redirects to the neighbourhood
 * grid (`isListingRoute`, enforced in the middleware), and the surfaces that
 * embed listings — search, Favorites, the community page and its feed — skip
 * the listing read. The agent dashboard is untouched: agents still manage
 * their own listings there.
 */
export const LISTINGS_ON_WEB = false;

/**
 * The buyer's home surface — where the landing page, sign-in and empty states
 * send them, and where a listing route redirects while listings are off.
 */
export const BUYER_HOME = LISTINGS_ON_WEB ? '/browse' : '/communities';

/**
 * Buyer-facing routes whose whole purpose is listings: the For You grid and
 * swipe feed (`/browse/*`), the legacy `/nearby`, listing pages (`/v/*`) and
 * agent portfolio pages (`/a/*`, a grid of the agent's listings).
 */
export function isListingRoute(path: string): boolean {
  return (
    path === '/browse' ||
    path.startsWith('/browse/') ||
    path === '/nearby' ||
    path.startsWith('/v/') ||
    path.startsWith('/a/')
  );
}
