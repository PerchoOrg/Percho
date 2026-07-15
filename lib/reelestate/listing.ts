/**
 * fetchMobileListing — RSC data loader for the ReelEstate mobile property
 * detail screen (`/listings/[id]`).
 *
 * ref: docs/design/reelestate-teardown/README.md §2.3
 *
 * D2.1 scope: real Supabase read of one active listing by id, joined with
 * agent + ordered photos. Wrapped in `unstable_cache` per the
 * `supabase-rsc-perf-playbook` skill:
 *   - `createAnonClient()` (cookie-less) because `unstable_cache` forbids
 *     dynamic APIs inside the cached fn.
 *   - RLS on `listings` allows anon SELECT where `status = 'active'` (see
 *     migration 0030_simplify_status), so an anon read returns the same
 *     row a cookie-bound client would for buyer-visible listings.
 *   - Tag `mobile-listing` + per-id cache key so future mutations
 *     (edit / archive) can `revalidateTag`.
 *
 * Later D2.x tasks hydrate more (commute, community, description
 * accordion). This file only returns the shape the detail page needs to
 * render its header + gallery + specs block. No mock/seed fallback: a
 * miss returns `null` and the page 404s.
 */
import { unstable_cache } from 'next/cache';
import { createAnonClient } from '@/lib/supabase/server';
import { photoPublicUrl } from '@/lib/supabase/storage';

export const MOBILE_LISTING_TAG = 'mobile-listing';

export interface MobileListingAgent {
  id: string;
  slug: string;
  name: string;
  headshot_url: string | null;
  brokerage: string | null;
  phone: string | null;
  email: string | null;
}

export interface MobileListingPhoto {
  id: string;
  url: string;
  alt: string | null;
}

export interface MobileListing {
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
  year_built: number | null;
  description: string[];
  cover_url: string | null;
  status: string;
  agent: MobileListingAgent | null;
  photos: MobileListingPhoto[];
}

interface RawListingRow {
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
  year_built: number | null;
  description: string[] | null;
  cover_url: string | null;
  status: string;
  agents: MobileListingAgent | MobileListingAgent[] | null;
}

interface RawPhotoRow {
  id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
}

async function fetchMobileListingImpl(id: string): Promise<MobileListing | null> {
  const supabase = createAnonClient();

  // biome-ignore lint/suspicious/noExplicitAny: generated types are a stub
  const { data: row, error } = (await (supabase as any)
    .from('listings')
    .select(
      'id, slug, address, city, state, zip, price, beds, baths, sqft, year_built, description, cover_url, status, agents ( id, slug, name, headshot_url, brokerage, phone, email )',
    )
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle()) as { data: RawListingRow | null; error: unknown };

  if (error || !row) return null;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: photoRows } = (await (supabase as any)
    .from('listing_photos')
    .select('id, storage_path, alt_text, sort_order')
    .eq('listing_id', id)
    .eq('status', 'ready')
    .order('sort_order', { ascending: true })) as { data: RawPhotoRow[] | null };

  const photos: MobileListingPhoto[] = (photoRows ?? []).map((p) => ({
    id: p.id,
    url: photoPublicUrl(p.storage_path),
    alt: p.alt_text,
  }));

  const agent = Array.isArray(row.agents) ? row.agents[0] ?? null : row.agents;

  return {
    id: row.id,
    slug: row.slug,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    price: row.price,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    year_built: row.year_built,
    description: row.description ?? [],
    cover_url: row.cover_url,
    status: row.status,
    agent,
    photos,
  };
}

/**
 * Cached wrapper. Key includes the listing id so distinct listings don't
 * collide. 60s TTL matches the community-list cache — buyer-facing listing
 * data changes rarely, and any agent-driven mutation should call
 * `revalidateTag(MOBILE_LISTING_TAG)`.
 */
export function fetchMobileListing(id: string): Promise<MobileListing | null> {
  return unstable_cache(
    () => fetchMobileListingImpl(id),
    ['mobile-listing', id],
    { revalidate: 60, tags: [MOBILE_LISTING_TAG] },
  )();
}
