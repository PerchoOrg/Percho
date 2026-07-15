/**
 * fetchMobileListings — RSC data loader for the ReelEstate mobile
 * Properties list route (`/listings`).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.2
 *
 * L3.1 scope: real Supabase read of active listings for the 2-col grid.
 * Follows the supabase-rsc-perf-playbook skill:
 *   - `createAnonClient()` (cookie-less) because the fetch runs inside
 *     `unstable_cache` and dynamic APIs are forbidden there.
 *   - Anon RLS on `listings` allows `status = 'active'` SELECT (see
 *     migration 0030_simplify_status), so buyer-visible rows are returned.
 *   - Tag `mobile-listing-index` so future edit/archive mutations can
 *     `revalidateTag` this list separately from single-listing detail.
 *
 * No mock/seed fallback: on error or empty result, returns `[]` and the
 * page renders its own empty state.
 */
import { unstable_cache } from 'next/cache';
import { createAnonClient } from '@/lib/supabase/server';

export const MOBILE_LISTING_INDEX_TAG = 'mobile-listing-index';

export interface MobileListingCard {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
}

interface RawRow {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
}

const LISTING_INDEX_LIMIT = 30;

async function fetchMobileListingsImpl(): Promise<MobileListingCard[]> {
  const supabase = createAnonClient();

  // biome-ignore lint/suspicious/noExplicitAny: generated types are a stub in this repo
  const { data, error } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, address, city, state, zip, price, beds, baths, sqft, cover_url',
    )
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(LISTING_INDEX_LIMIT)) as { data: RawRow[] | null; error: unknown };

  if (error || !data) return [];
  return data.map((r) => ({ ...r }));
}

export function fetchMobileListings(): Promise<MobileListingCard[]> {
  return unstable_cache(
    () => fetchMobileListingsImpl(),
    ['mobile-listing-index', 'v1'],
    { revalidate: 60, tags: [MOBILE_LISTING_INDEX_TAG] },
  )();
}
