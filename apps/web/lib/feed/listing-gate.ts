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
  /** City unit this listing sits in — a tease swipe credits it (§1.7). */
  geoUnitId?: string;
  /** Set in stages 1–2: likeable, weighted 0.5×, match badge suppressed. */
  tease?: true;
  /** Set in stage 3: preview inside an already-liked community. */
  preview?: true;
}

/**
 * Takes every eligible listing and returns only what this stage may see, tagged
 * so the client knows which badge suppression applies.
 *
 *   stage 0    → zero listings, full stop.
 *   stage 1–2  → at most ceil(limit/10) tease listings.
 *   stage 3    → previews only inside communities the buyer already liked.
 *   stage 4    → unlocked.
 */
export function gateListings(
  all: PoolListingDTO[],
  stage: number,
  limit: number,
  likedCommunityIds: string[],
): PoolListingDTO[] {
  if (stage <= 0) return [];

  if (stage <= 2) {
    const teaseCap = Math.ceil(limit / TEASE_PER);
    return all.slice(0, teaseCap).map((l) => ({ ...l, tease: true as const }));
  }

  if (stage === 3) {
    // Previews are scoped to communities the buyer already liked. With no liked
    // communities there is nothing to preview — that is the correct empty
    // result, not a reason to fall back to unfiltered listings.
    if (likedCommunityIds.length === 0) return [];
    const liked = new Set(likedCommunityIds);
    return all
      .filter((l) => l.communityId && liked.has(l.communityId))
      .map((l) => ({ ...l, preview: true as const }));
  }

  return all;
}
