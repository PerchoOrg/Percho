/**
 * Listing-stats compatibility shim.
 *
 * Phase 50 (2026-06-22) generalized the implementation in
 * `entity-stats.ts` (listings + communities, same shape). All call
 * sites that talked to listings keep working: the old function names
 * are re-exported as listing-bound wrappers around the generic ones.
 *
 * Type alias `ListingStats = EntityStats` for the same reason — the
 * names are identical, only the underlying entity changed.
 *
 * New code should import from `entity-stats.ts` directly. Eventually
 * we'll inline-rewrite the imports and delete this shim.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { type EntityStats, getEntityStats, getRollupEntityStats } from './entity-stats';

// biome-ignore lint/suspicious/noExplicitAny: opaque rows
type AnyClient = SupabaseClient<any, any, any, any, any>;

export type { TopCardEntry } from './entity-stats';
export type ListingStats = EntityStats;

export async function getListingStats(
  supabase: AnyClient,
  listingId: string,
): Promise<ListingStats> {
  return getEntityStats(supabase, { entityType: 'listing', entityId: listingId });
}

export async function getRollupStats(
  supabase: AnyClient,
  listingIds: string[],
): Promise<ListingStats> {
  return getRollupEntityStats(supabase, {
    entityType: 'listing',
    entityIds: listingIds,
  });
}
