/**
 * Shared types between @percho/web and @percho/mobile.
 *
 * Deliberately tiny. This file once carried 18 types covering the whole
 * discovery-feed model — persona, scope strip, evidence profile, tradeoff and
 * challenge cards — ported from `percho-prototypes/` in July 2026. The mobile
 * app then built its own feed (`apps/mobile/lib/feed/`) rather than consuming
 * those, so the ports and their types were retired in phase53. Only what both
 * surfaces actually import survives here.
 *
 * Before adding a type: it belongs here only if BOTH apps import it. One-app
 * types live in that app.
 */

// ─── Dimensions (evidence vocabulary) ────────────────────────────────
// 11 dims ported from `percho-prototypes/discovery-v3-snapshot/_data.js`
// `window.DIMS`. Listings, communities and asks tag against these; the web
// feed's highlight and gate logic reads them, and the mobile card faces
// render them.
export type DimKey =
  | 'outdoors'
  | 'walkable'
  | 'schools'
  | 'quiet'
  | 'hip'
  | 'entertaining'
  | 'trails'
  | 'nightlife'
  | 'family'
  | 'move_in'
  | 'space';
