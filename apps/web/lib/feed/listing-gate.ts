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

import type { DimKey } from '@percho/shared/types';
import type { NeighborhoodScores } from './neighborhood-score';

/** §1.7: one tease listing per ten cards in stages 1–2. */
export const TEASE_PER = 10;

export interface PoolListingDTO {
  id: string;
  slug: string;
  address: string;
  priceLabel: string;
  /**
   * The raw price, when the row has one. Carried in ADDITION to `priceLabel`
   * because §1.6's challenge card ("guess the price") needs the real number:
   * reconstructing it from "$685K" would round the answer to the nearest
   * thousand and the card would teach a figure no listing actually has.
   */
  price?: number;
  bedBathSqft: string;
  heroUrl: string;
  videoUrl?: string;
  /** Coordinates for the card's locality map thumbnail (2026-07-28 card structure). */
  lat?: number;
  lng?: number;
  /** Pre-rendered map tile (public Storage URL). See scripts/maintenance/backfill_listing_maps.py. */
  mapUrl?: string;
  communityId?: string;
  /** City the listing is in — the stage-3 fallback join key. */
  city?: string;
  /** State, for the card's "City, ST" sub-line. */
  state?: string;
  /**
   * The listing's own prose, already split into paragraphs by
   * `browse-cards.ts` (`listings.description text[]`).
   *
   * Carried to the card because the 2026-07-29 light-card redesign gives the
   * leftover height under the 1:1 media block to REAL body copy: the owner's
   * two complaints were "左下角信息太单薄" and "下面有很多空的位置不够匀称", and
   * the only thing that can absorb an arbitrary amount of card height without
   * inventing content is the description the agent already wrote.
   */
  description?: string[];
  /**
   * Four-dimension neighborhood scores (Safety / Schools / Convenience /
   * Potential) for the card's score panel.
   *
   * Absent when the listing has no POI rows at all. Within it, a dimension's
   * `score` is `null` when we hold no source for it — Safety and Potential are
   * both null today, and the card renders them as an em dash. See
   * `lib/feed/neighborhood-score.ts` for why that is not a zero.
   */
  scores?: NeighborhoodScores;
  /**
   * Up to three highlight dims for the redline's chip row above the CTA
   * ("Top Schools · Private Backyard · Walkable Park").
   *
   * Extracted from the listing's own prose — see `lib/feed/listing-highlights.ts`
   * for why that is the only source with real coverage, and why a listing whose
   * copy claims nothing gets the field omitted rather than an empty array.
   */
  dims?: DimKey[];
  /**
   * Photo count for the redline's "⊕ N Photos" hero pill.
   *
   * Only sent when the listing has MORE THAN ONE photo: a pill reading
   * "1 Photos" on a single-photo listing is worse than no pill, and the pill's
   * whole promise is that there is a gallery behind the hero.
   */
  photoCount?: number;
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
