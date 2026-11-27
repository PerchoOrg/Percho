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
 * Communities are map DOTS: one mark per row at its centroid. `boundary` is
 * deliberately NOT selected by any query in this file. It was shipped and
 * drawn twice — as a city-wide outline layer (2026-09-09 to 09-12) and as a
 * street-zoom layer under the dots (09-13 to 09-14) — and the owner rejected
 * both on the same grounds: the shapes are real but wildly uneven, and a
 * field of them reads as mess. The rule and its two dates live in
 * `apps/mobile/app/(tabs)/search.tsx`'s header. The true shape still renders
 * on the community's own page, where it is one figure in a frame.
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
 * ── Narrowed to communities with a video (2026-11-14) ───────────────────────
 * Owner: "for neighborhood, 只显示有视频的". The gate is now the web grid's
 * set — `fetchCommunityListCards()`, every active community with an uploaded
 * video or a film — instead of `cover_storage_path is not null`. A community
 * with a film but no cover photo (Northbrooke) is in; one with photos and no
 * video is out. Search and the map read the same set, so they still agree.
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

import { fetchCityFilms } from '@/lib/cities/detail';
import { publicCoverImageUrl } from '@/lib/communities/cover';
import { fetchCommunityListCards } from '@/lib/communities/list';
import { createUncachedAnonClient, createUncachedServiceClient } from '@/lib/supabase/server';

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
  /** FMLS listing number, FMLS listings only (IDX rule 13.7.b). */
  mlsNumber?: string;
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
}

/** A city with a film — what `/city/[slug]` opens. */
export interface SearchCityDTO {
  slug: string;
  name: string;
  state: string;
  county?: string;
  posterUrl: string;
  lat?: number;
  lng?: number;
}

/** A school (phase410); the app flies the map to it at street zoom. */
export interface SearchSchoolDTO {
  id: string;
  name: string;
  level?: string;
  city?: string;
  zip?: string;
  lat: number;
  lng: number;
}

export interface SearchResultDTO {
  q: string;
  /** Added 2026-11-27 (phase409): "search里搜不到city". */
  cities: SearchCityDTO[];
  /** Added 2026-11-27 (phase410), by name or by ZIP. */
  schools: SearchSchoolDTO[];
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
  mls_number?: string | null;
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
    ...(r.mls_number?.trim() ? { mlsNumber: r.mls_number.trim() } : {}),
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

/**
 * Cities whose name contains `q`: only cities with a film, the same set the
 * feed shows, so a hit always opens a page. Until phase409 the app matched
 * cities itself against the feed pool's `geoUnits`, which the pool stopped
 * sending — so no city could be found by name. Eight rows; filtered here.
 *
 * The service client is the films' own (`fetchCityFilms`, as the feed route
 * uses it): assemblies are not readable with the anon key. It reads only
 * published films' ids and names — nothing a buyer cannot already see.
 */
export async function searchCities(q: string): Promise<SearchCityDTO[]> {
  const films = await fetchCityFilms(createUncachedServiceClient());
  return [...films.values()]
    .filter((f) => f.place.name.toLowerCase().includes(q))
    .sort((a, b) => a.place.name.localeCompare(b.place.name))
    .map((f) => ({
      slug: f.slug,
      name: f.place.name,
      state: f.place.state ?? 'GA',
      ...(f.place.county ? { county: f.place.county } : {}),
      posterUrl: f.posterUrl,
      ...(coord(f.place.lat, f.place.lng) ?? {}),
    }));
}

/** A five-digit query is a ZIP (phase410): it matches `zip` exactly, not names. */
export function isZipQuery(q: string): boolean {
  return /^\d{5}$/.test(q);
}

/** A school list is short when it answers a name, longer for a whole ZIP. */
const SCHOOL_LIMIT = { name: 10, zip: 40 } as const;

type SchoolRow = {
  id: string;
  name: string;
  level: string | null;
  city: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
};

export function projectSearchSchools(rows: SchoolRow[]): SearchSchoolDTO[] {
  return rows.flatMap((r) => {
    const at = coord(r.lat, r.lng);
    if (!at) return [];
    return [
      {
        id: r.id,
        name: r.name,
        ...(r.level ? { level: r.level } : {}),
        ...(r.city ? { city: r.city } : {}),
        ...(r.zip ? { zip: r.zip } : {}),
        ...at,
      },
    ];
  });
}

function schoolSearch(supabase: ReturnType<typeof createUncachedAnonClient>, q: string) {
  const read = supabase.from('k12_schools').select('id, name, level, city, zip, lat, lng');
  return (isZipQuery(q) ? read.eq('zip', q) : read.ilike('name', `%${q}%`))
    .not('lat', 'is', null)
    .order('name', { ascending: true })
    .limit(isZipQuery(q) ? SCHOOL_LIMIT.zip : SCHOOL_LIMIT.name);
}

/** Ids of the communities a buyer may see: those with a video — see the header. */
async function videoCommunityIds(): Promise<string[]> {
  return (await fetchCommunityListCards()).map((c) => c.id);
}

/** An empty listing read, for the communities-only app (phase308). */
const NO_LISTINGS = Promise.resolve({ data: [] as ListingRow[], error: null });

function listingSearch(supabase: ReturnType<typeof createUncachedAnonClient>, like: string) {
  return supabase
    .from('listings')
    .select(
      'id, slug, address, city, state, zip, price, beds, baths, sqft, cover_url, lat, lng, mls_number',
    )
    .eq('status', 'active')
    .or(
      `address.ilike.${like},city.ilike.${like},state.ilike.${like},zip.ilike.${like},neighborhood.ilike.${like}`,
    )
    .order('created_at', { ascending: false })
    .limit(SEARCH_LIMIT);
}

function listingsInBounds(
  supabase: ReturnType<typeof createUncachedAnonClient>,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
) {
  return supabase
    .from('listings')
    .select(
      'id, slug, address, city, state, zip, price, beds, baths, sqft, cover_url, lat, lng, mls_number',
    )
    .eq('status', 'active')
    .gte('lat', bounds.minLat)
    .lte('lat', bounds.maxLat)
    .gte('lng', bounds.minLng)
    .lte('lng', bounds.maxLng)
    .order('created_at', { ascending: false })
    .limit(MAP_LISTING_LIMIT);
}

/**
 * `q` MUST already be the sanitised output of `mobileSearchQuerySchema`.
 * `listings: false` (the communities-only app, phase308) skips the listing
 * read entirely rather than filtering its result.
 */
export async function searchEntities(
  q: string,
  opts: { listings: boolean } = { listings: true },
): Promise<SearchResultDTO> {
  const supabase = createUncachedAnonClient();
  const like = `%${q}%`;
  const videoIds = await videoCommunityIds();

  const zip = isZipQuery(q);
  const communityRead = supabase
    .from('communities')
    .select('id, slug, name, city, state, cover_storage_path, lat, lng')
    .eq('status', 'active')
    // The content gate — see the header. Only communities with a video.
    .in('id', videoIds);
  const [cities, listingRes, communityRes, schoolRes] = await Promise.all([
    zip ? Promise.resolve([] as SearchCityDTO[]) : searchCities(q),
    opts.listings ? listingSearch(supabase, like) : NO_LISTINGS,
    // A ZIP is the community's own (`backfill-community-zip.ts`, from the
    // Census's ZIP areas), so 30024 finds Suwanee's communities exactly.
    (zip ? communityRead.eq('zip', q) : communityRead.or(`name.ilike.${like},city.ilike.${like}`))
      .order('name', { ascending: true })
      .limit(COMMUNITY_LIMIT),
    schoolSearch(supabase, q),
  ]);

  if (listingRes.error)
    throw new Error(`search: listings read failed: ${listingRes.error.message}`);
  if (communityRes.error) {
    throw new Error(`search: communities read failed: ${communityRes.error.message}`);
  }
  if (schoolRes.error) throw new Error(`search: schools read failed: ${schoolRes.error.message}`);

  return {
    q,
    cities,
    schools: projectSearchSchools((schoolRes.data ?? []) as SchoolRow[]),
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
 * The zoom-band map's viewport read (phase281): every contentful community
 * and active home whose POINT lies in the given bounds. No text, no drill —
 * the phone re-asks this on every settled pan/zoom past the city band.
 *
 * Same projections and the same content gate as `searchEntities`, so a
 * community looks identical whether it arrived by viewport or by typing.
 * Plain lat/lng range filters, deliberately: the marks draw at centroids,
 * so PostGIS adds nothing here that two btree comparisons don't.
 */
export async function mapEntities(
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  },
  opts: { listings: boolean } = { listings: true },
): Promise<Omit<SearchResultDTO, 'q' | 'cities' | 'schools'>> {
  const supabase = createUncachedAnonClient();
  const videoIds = await videoCommunityIds();

  const [listingRes, communityRes] = await Promise.all([
    opts.listings ? listingsInBounds(supabase, bounds) : NO_LISTINGS,
    supabase
      .from('communities')
      // No `boundary`: the map does not draw community shapes at any zoom —
      // see the rule in `apps/mobile/app/(tabs)/search.tsx`'s header.
      .select('id, slug, name, city, state, cover_storage_path, lat, lng')
      .eq('status', 'active')
      // The content gate — see the header.
      .in('id', videoIds)
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

  return {
    listings: projectSearchListings((listingRes.data ?? []) as ListingRow[]),
    communities: projectSearchCommunities((communityRes.data ?? []) as CommunityRow[]),
  };
}
