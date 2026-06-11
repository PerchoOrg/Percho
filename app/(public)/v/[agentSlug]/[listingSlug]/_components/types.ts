/**
 * Shared types for the public listing video feed.
 *
 * 2026-06-11: trimmed to just FeedAgent + FeedListing after the page
 * switched to BrowseFeed/BrowseCard. The old FeedCard/FeedOverlay shapes
 * (and the composeFeed pipeline) were retired in the parity hotfix.
 */

export type FeedAgent = {
  slug: string;
  name: string;
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
