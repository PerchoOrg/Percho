/**
 * The §0.2 listing hard gate, server side.
 *
 * Lives in `lib/` rather than the route file for two reasons: Next.js forbids a
 * route module from exporting anything but route handlers, and this is the one
 * piece of the endpoint worth unit-testing directly — it is the server half of
 * the product's core promise ("no listings before the buyer has told us
 * anything"). The client enforces the same rule in
 * `apps/mobile/lib/feed/generate-feed.ts`; this is defence in depth, so a stale
 * app build cannot break the promise.
 */

/** §1.7: one tease listing per ten cards in stages 1–2. */
export const TEASE_PER = 10;

export interface PoolListingDTO {
  id: string;
  slug: string;
  address: string;
  priceLabel: string;
  bedBathSqft: string;
  heroUrl: string;
  videoUrl?: string;
  communityId?: string;
  /** City the listing is in — the stage-3 fallback join key. */
  city?: string;
  /** City unit this listing sits in — a tease swipe credits it (§1.7). */
  geoUnitId?: string;
  /** Set in stages 1–2: likeable, weighted 0.5×, match badge suppressed. */
  tease?: true;
  /** Set in stage 3: preview inside an already-liked community. */
  preview?: true;
}

/**
 * Which communities the buyer has liked, and where they are. Stage 3 needs both
 * because the direct `listings.community_id` join is almost entirely unpopulated
 * (3 of 260 active listings), so a strict id match would return at most one
 * preview per city and effectively freeze the funnel at Stage 3.
 */
export interface LikedCommunityRef {
  id: string;
  city?: string;
}

/**
 * Takes every eligible listing and returns only what this stage may see, tagged
 * so the client knows which badge suppression applies.
 *
 *   stage 0    → zero listings, full stop.
 *   stage 1–2  → at most ceil(limit/10) tease listings.
 *   stage 3    → previews tied to communities the buyer already liked.
 *   stage 4    → unlocked.
 *
 * **Stage 3 matches on community id first, then falls back to the liked
 * community's city.** This is a data-shape concession, not a loosening of the
 * §0.2 gate: the buyer still only sees listings connected to something they
 * explicitly liked, and stage 4 remains the only unlocked stage. Without the
 * fallback Stage 3 would show ~1 listing and the 3→4 gate (2 community likes)
 * would still open, but the stage itself would be empty of the previews §1.4
 * promises. When `listings.community_id` gets backfilled the id branch simply
 * starts winning and the fallback goes quiet.
 */
export function gateListings(
  all: PoolListingDTO[],
  stage: number,
  limit: number,
  liked: LikedCommunityRef[],
): PoolListingDTO[] {
  if (stage <= 0) return [];

  if (stage <= 2) {
    const teaseCap = Math.ceil(limit / TEASE_PER);
    return all.slice(0, teaseCap).map((l) => ({ ...l, tease: true as const }));
  }

  if (stage === 3) {
    // Previews are scoped to what the buyer liked. With nothing liked there is
    // nothing to preview — that is the correct empty result, not a reason to
    // fall back to the unfiltered pool.
    if (liked.length === 0) return [];
    const likedIds = new Set(liked.map((c) => c.id));
    const likedCities = new Set(liked.map((c) => c.city).filter((c): c is string => !!c));
    return all
      .filter(
        (l) =>
          (l.communityId && likedIds.has(l.communityId)) || (l.city && likedCities.has(l.city)),
      )
      .map((l) => ({ ...l, preview: true as const }));
  }

  return all;
}
