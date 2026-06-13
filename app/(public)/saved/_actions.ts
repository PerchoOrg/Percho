'use server';

/**
 * Phase 21 (2026-06-13): server-action wrapper that fetches saved
 * listings as `BrowseCard[]` for the /saved page. Sequences:
 *   1. listSavedListingIds(device) → ordered listing_ids
 *   2. fetchBrowseCardsByIds(ids)   → BrowseCard rows
 *
 * Splitting the join across two queries instead of expanding the SQL
 * join in `app/_actions/saved-listings.ts` reuses `assembleCards`'s
 * logic (cover photo / video pick, schools, POIs, communities, agent),
 * keeping a single source of truth for what a card looks like.
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { listSavedListingIds } from '@/app/_actions/saved-listings';
import { fetchBrowseCardsByIds } from '@/lib/feed/browse-cards';

export async function fetchSavedCardsAction(input: {
  deviceId: string;
}): Promise<BrowseCard[]> {
  const ids = await listSavedListingIds(input);
  if (ids.length === 0) return [];
  return fetchBrowseCardsByIds(ids);
}
