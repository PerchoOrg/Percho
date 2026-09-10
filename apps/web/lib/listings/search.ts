/**
 * Mobile search (phase D, store launch) — the first real entity search on
 * the Search tab. Until now that tab could only filter the 109 city units
 * client-side and its "For sale" chip was a decoration that searched
 * nothing.
 *
 * One query hits two tables the buyer can actually open:
 *   listings     — address / city / state / zip / neighborhood, active only
 *   communities  — name / city, active
 *
 * Communities carry their real `boundary`, simplified for display: the map
 * draws the outline rather than one more identical circle (owner, 2026-09-09).
 * The feed's community pool must NEVER select that column — 8k dense
 * multipolygons time PostgREST out — but this query is capped, and
 * `displayRingsFromGeoJson` drops holes and thins each ring to ~30 m before it
 * goes on the wire.
 *
 * ── The cover gate is gone (2026-09-10) ─────────────────────────────────────
 * Communities used to be filtered to `cover_storage_path is not null`, the
 * same gate as the feed's pool, on the grounds that a hit should always be a
 * page that renders. That made sense when a hit was a PHOTO circle on the map.
 * It is now an outline, the photo is not drawn at all, and the gate was the
 * reason the owner saw "几个零星的社区图形" instead of a city's subdivisions:
 * it was hiding every community we have a shape for but no picture of.
 *
 * Communities therefore get their own, much higher ceiling. It is still a
 * ceiling: a city like Atlanta has 731 communities and this returns the first
 * `COMMUNITY_LIMIT` of them by name. True full coverage needs a viewport query
 * (`st_intersects` against the map's bounds, refetched on pan) rather than a
 * bigger number here — see the DEVLOG entry for phase268.
 *
 * `ilike '%q%'` on ≤ a few thousand rows is fine; the query string has
 * already been folded to `[a-z0-9 -]` by `lib/zod/mobile-search.ts` so it
 * can be interpolated into PostgREST's `.or()` DSL safely. Same projection
 * rule as `detail.ts`: absent means the key is OMITTED.
 */

import { publicCoverImageUrl } from '@/lib/communities/cover';
import { displayRingsFromGeoJson } from '@/lib/geo/simplify-ring';
import type { Database } from '@/lib/supabase/database.types';
import { createClient as createPlainClient } from '@supabase/supabase-js';

const SEARCH_LIMIT = 24;
/**
 * Communities are map SHAPES, not a result list, so they get a ceiling sized
 * for covering a city rather than for filling a sheet. ~100 simplified rings
 * is roughly 120 KB on the wire and renders without stuttering a pan; the
 * next honest step past it is a viewport query, not a bigger constant.
 */
const COMMUNITY_LIMIT = 100;

export interface SearchListingDTO {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  coverUrl?: string;
  lat?: number;
  lng?: number;
}

export interface SearchCommunityDTO {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  heroUrl?: string;
  lat?: number;
  lng?: number;
  /**
   * The community's real outline, outer rings only and simplified for display
   * (`lib/geo/simplify-ring.ts`). Absent when the row has no boundary — about
   * half of them — and the client draws its pin instead.
   */
  boundary?: [number, number][][];
}

export interface SearchResultDTO {
  q: string;
  listings: SearchListingDTO[];
  communities: SearchCommunityDTO[];
}

type ListingRow = {
  id: string;
  slug: string;
  address: string;
  city: string;
  state: string | null;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  lat: number | null;
  lng: number | null;
};

type CommunityRow = {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string | null;
  cover_storage_path: string | null;
  lat: number | null;
  lng: number | null;
  boundary: unknown;
};

function coord(lat: number | null, lng: number | null): { lat: number; lng: number } | undefined {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : undefined;
}

export function projectSearchListings(rows: ListingRow[]): SearchListingDTO[] {
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    address: r.address,
    city: r.city,
    state: r.state ?? 'GA',
    ...(r.zip ? { zip: r.zip } : {}),
    ...(r.price != null && r.price > 0 ? { price: r.price } : {}),
    ...(r.beds != null ? { beds: r.beds } : {}),
    ...(r.baths != null ? { baths: r.baths } : {}),
    ...(r.sqft != null && r.sqft > 0 ? { sqft: r.sqft } : {}),
    ...(r.cover_url ? { coverUrl: r.cover_url } : {}),
    ...(coord(r.lat, r.lng) ?? {}),
  }));
}

export function projectSearchCommunities(rows: CommunityRow[]): SearchCommunityDTO[] {
  return rows.map((r) => {
    const boundary = displayRingsFromGeoJson(r.boundary);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      city: r.city,
      state: r.state ?? 'GA',
      ...(r.cover_storage_path ? { heroUrl: publicCoverImageUrl(r.cover_storage_path) } : {}),
      ...(coord(r.lat, r.lng) ?? {}),
      ...(boundary.length > 0 ? { boundary } : {}),
    };
  });
}

function createUncachedAnonClient() {
  // Same fetch-cache opt-out as `detail.ts` — see the long note there.
  return createPlainClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );
}

/** `q` MUST already be the sanitised output of `mobileSearchQuerySchema`. */
export async function searchEntities(q: string): Promise<SearchResultDTO> {
  const supabase = createUncachedAnonClient();
  const like = `%${q}%`;

  const [listingRes, communityRes] = await Promise.all([
    supabase
      .from('listings')
      .select('id, slug, address, city, state, zip, price, beds, baths, sqft, cover_url, lat, lng')
      .eq('status', 'active')
      .or(
        `address.ilike.${like},city.ilike.${like},state.ilike.${like},zip.ilike.${like},neighborhood.ilike.${like}`,
      )
      .order('created_at', { ascending: false })
      .limit(SEARCH_LIMIT),
    supabase
      .from('communities')
      // `boundary` IS selected here, unlike the feed's community pool — see
      // the header. The row ceiling is the whole reason that is safe.
      .select('id, slug, name, city, state, cover_storage_path, lat, lng, boundary')
      .eq('status', 'active')
      .or(`name.ilike.${like},city.ilike.${like}`)
      .order('name', { ascending: true })
      .limit(COMMUNITY_LIMIT),
  ]);

  if (listingRes.error)
    throw new Error(`search: listings read failed: ${listingRes.error.message}`);
  if (communityRes.error) {
    throw new Error(`search: communities read failed: ${communityRes.error.message}`);
  }

  return {
    q,
    listings: projectSearchListings((listingRes.data ?? []) as ListingRow[]),
    communities: projectSearchCommunities((communityRes.data ?? []) as CommunityRow[]),
  };
}
