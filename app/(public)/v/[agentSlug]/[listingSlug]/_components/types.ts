/**
 * Shared types for the public listing video feed (Phase 3.3+).
 *
 * `FeedCard` is the unified shape consumed by the client feed. The page-level
 * Server Component composes listing_videos + community_videos into this list.
 * Phase 3.3: naive concat (listing then community). Phase 3.5: ARCH §5
 * interleave + overlay shaping.
 */

export type FeedAgent = {
  slug: string;
  name: string;
  // headshotUrl/brokerage land in Phase 4 once agent profile fields exist.
};

export type FeedListing = {
  slug: string;
  address: string;
  city: string;
  state: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
};

export type FeedCard = {
  id: string;
  cfVideoId: string;
  /** 'listing' = home video; 'community' = neighborhood/school/poi b-roll. */
  source: 'listing' | 'community';
  /** DB `kind` column verbatim (e.g. HOME, OUTDOOR, SCHOOL, POI, NEIGHBORHOOD). */
  kind: string;
  title: string | null;
};
