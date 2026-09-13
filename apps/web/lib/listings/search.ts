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
 * Communities are map DOTS: one mark per row at its centroid. Their real
 * `boundary` was shipped and drawn as an outline from 2026-09-09 to
 * 2026-09-12, when the owner called the result inconsistent — subdivisions
 * differ wildly in shape and half the rows have no polygon at all. `boundary`
 * is deliberately NOT selected here (it never was in the feed's community
 * pool, where 8k dense multipolygons time PostgREST out); the true shape
 * still renders on the community's own page.
 *
 * ── The cover gate is BACK, as a content gate (2026-09-12) ──────────────────
 * Removed 2026-09-10 while hits were map outlines (a shape needs no photo);
 * re-added when the owner saw what that let through: "No need to show
 * communities just with a name." A full scan of the 22,730 active rows found
 * 14,052 that are a name and a location and NOTHING else — no photo, no
 * video, no demographics, no resident content. And the 8,678 rows with a
 * cover are EXACTLY the rows with any of those (every community with stats
 * or a video also has a cover), so `cover_storage_path is not null` is not a
 * photo preference, it is the precise "this page has something on it" test
 * the data offers. Scan: DEVLOG 2026-09-12 phase277.5.
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
 * Communities are map DOTS, not a result list, so they get a ceiling sized
 * for covering a city rather than for filling a sheet. A hundred name+centroid
 * rows is a few KB on the wire; the next honest step past this ceiling is a
 * viewport query, not a bigger constant.
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
   * Outer rings, `[lng, lat]`, simplified for display — present ONLY on a
   * street-zoom viewport read (`mapEntities`, small bbox), where the map
   * draws the community's real covered area under its dot (owner,
   * 2026-09-13: "Community dot doesn't tell the covered area"). Text
   * search and wide reads never carry it.
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
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    state: r.state ?? 'GA',
    ...(r.cover_storage_path ? { heroUrl: publicCoverImageUrl(r.cover_storage_path) } : {}),
    ...(coord(r.lat, r.lng) ?? {}),
  }));
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
      .select('id, slug, name, city, state, cover_storage_path, lat, lng')
      .eq('status', 'active')
      // The content gate — see the header. A row this drops has a name and
      // a point and nothing else to open.
      .not('cover_storage_path', 'is', null)
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

/** What one viewport read may carry. Communities reuse `COMMUNITY_LIMIT`;
 *  homes get their own ceiling because `SEARCH_LIMIT` (24) sizes a result
 *  LIST and a viewport is not a list — there are ~260 active listings in
 *  total, so in practice this is "all of them in frame". */
const MAP_LISTING_LIMIT = 100;

/**
 * A viewport read narrower than this (in degrees of latitude) is a
 * street-zoom read, and gets each community's `boundary` rings so the map
 * can draw the covered area. The client's street band is 0.06 padded 20%
 * (≈0.072); a homes-band read (0.12 padded ≈0.144) stays boundary-free.
 * At this span a frame holds a handful of communities, so the rings cost
 * KBs, not the ~120 KB a 100-row read would.
 */
const BOUNDARY_SPAN_DEG = 0.1;

/**
 * The zoom-band map's viewport read (phase281): every contentful community
 * and active home whose POINT lies in the given bounds. No text, no drill —
 * the phone re-asks this on every settled pan/zoom past the city band.
 *
 * Same projections and the same content gate as `searchEntities`, so a
 * community looks identical whether it arrived by viewport or by typing.
 * Plain lat/lng range filters, deliberately: the marks draw at centroids,
 * so PostGIS adds nothing here that two btree comparisons don't.
 */
export async function mapEntities(bounds: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): Promise<Omit<SearchResultDTO, 'q'>> {
  const supabase = createUncachedAnonClient();
  const wantBoundary = bounds.maxLat - bounds.minLat <= BOUNDARY_SPAN_DEG;

  const [listingRes, communityRes] = await Promise.all([
    supabase
      .from('listings')
      .select('id, slug, address, city, state, zip, price, beds, baths, sqft, cover_url, lat, lng')
      .eq('status', 'active')
      .gte('lat', bounds.minLat)
      .lte('lat', bounds.maxLat)
      .gte('lng', bounds.minLng)
      .lte('lng', bounds.maxLng)
      .order('created_at', { ascending: false })
      .limit(MAP_LISTING_LIMIT),
    supabase
      .from('communities')
      // `boundary` only on a street-zoom read — see BOUNDARY_SPAN_DEG. The
      // feed pool's "never select boundary" rule is about 8k dense rows;
      // a bounded handful of display-simplified rings is the safe case.
      .select(
        wantBoundary
          ? 'id, slug, name, city, state, cover_storage_path, lat, lng, boundary'
          : 'id, slug, name, city, state, cover_storage_path, lat, lng',
      )
      .eq('status', 'active')
      // The content gate — see the header.
      .not('cover_storage_path', 'is', null)
      .gte('lat', bounds.minLat)
      .lte('lat', bounds.maxLat)
      .gte('lng', bounds.minLng)
      .lte('lng', bounds.maxLng)
      .order('name', { ascending: true })
      .limit(COMMUNITY_LIMIT),
  ]);

  if (listingRes.error) throw new Error(`map: listings read failed: ${listingRes.error.message}`);
  if (communityRes.error) {
    throw new Error(`map: communities read failed: ${communityRes.error.message}`);
  }

  // Through `unknown`: the conditional select string defeats PostgREST's
  // literal-type parser, so the row type cannot be inferred here.
  const communityRows = (communityRes.data ?? []) as unknown as (CommunityRow & {
    boundary?: unknown;
  })[];
  const communities = projectSearchCommunities(communityRows).map((c, i) => {
    if (!wantBoundary) return c;
    const rings = displayRingsFromGeoJson(communityRows[i]?.boundary);
    return rings.length > 0 ? { ...c, boundary: rings } : c;
  });

  return {
    listings: projectSearchListings((listingRes.data ?? []) as ListingRow[]),
    communities,
  };
}
