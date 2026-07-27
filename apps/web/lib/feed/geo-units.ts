/**
 * City-level geo-unit aggregation for the v3 discovery feed (task-1 §3/§4).
 *
 * The feed's Stage 1–2 cards are geographic units (area / city / zip), but
 * there is no geo-unit table: the only real inventory is 8680 `communities`
 * rows. So a unit is derived by grouping communities. `communities.zip` is
 * 100% NULL today, so the finest level this can emit is **city**; the client's
 * `finestAvailableLevel()` reads whatever depth arrives, so a later zip
 * backfill deepens the funnel with no engine change.
 *
 * Aggregated in SQL by the `public.city_geo_units` view (migration
 * 20260727010000, owner-approved), not in this process. The view is
 * `security_invoker = true`, so the existing public-read RLS on `communities`
 * and `listings` still governs every row that aggregates. Reading it is one
 * request; the in-process form this replaced took 9 paged scans of 1000 rows
 * each per cache miss to produce the same ~109 rows.
 *
 * The in-process reduce this replaced (`aggregateCityUnits` + its two paged
 * scans) is gone rather than kept as a fallback: two implementations of "which
 * numbers are real" drift, and the migration's `having` clause and 8-listing
 * median floor are now the single source of that truth. Verified against the
 * remote on 2026-07-27 — the view reproduces the in-process output exactly
 * (109 units, Atlanta 731 communities, Alpharetta median $594,450 at n=52) and
 * all 5 medians match a hand `percentile_cont` over raw `listings`.
 *
 * CRITICAL: `boundary` must NOT be selected here or added to the view. The
 * Nextdoor seeds are dense multipolygons (multi-KB each) and PostgREST hits
 * `statement_timeout` (PG 57014) trying to stream ~8k of them, returning nothing
 * at all — the same trap documented in `lib/communities/list.ts`. Boundary is a
 * per-card concern, fetched lazily elsewhere.
 *
 * Every emitted number is real or absent. No estimates, no placeholders: a
 * median price is emitted only at a sample size that makes it meaningful (the
 * floor is enforced in the view as well, so a low-n median cannot be read even
 * by accident), and `stats` is `{}` when nothing real is known.
 */

import { publicCoverImageUrl } from '@/lib/communities/cover';
import { createAnonClient } from '@/lib/supabase/server';
import { unstable_cache } from 'next/cache';

export const GEO_UNITS_TAG = 'geo-units';

/** Mirrors `apps/mobile/lib/feed/geo-unit.ts` — keep the two in sync. */
export type GeoLevel = 'area' | 'city' | 'zip';

export interface GeoStatsDTO {
  medianListPrice?: { value: number; sampleSize: number };
  activeListings?: number;
}

export interface GeoUnitDTO {
  id: string;
  level: GeoLevel;
  name: string;
  state: string;
  centroid: { lat: number; lng: number };
  heroUrl?: string;
  communityCount: number;
  sampleCommunityNames: string[];
  stats: GeoStatsDTO;
}

/** One row of `public.city_geo_units`. Hand-typed: `database.types.ts` is a stub. */
export type CityGeoUnitRow = {
  id: string;
  name: string;
  state: string;
  centroid_lat: number | null;
  centroid_lng: number | null;
  hero_storage_path: string | null;
  community_count: number;
  sample_community_names: string[] | null;
  median_list_price: number | null;
  median_sample_size: number | null;
  active_listings: number | null;
};

/**
 * Row → DTO. The view already applied the median sample floor and dropped
 * coordinate-less cities, so this only reshapes: absent stays absent, and a
 * `stats` key is written only when its value is really there.
 */
export function projectUnit(row: CityGeoUnitRow): GeoUnitDTO | null {
  // The view's `having` clause guarantees a centroid, but the DTO's contract is
  // that a unit HAS one — so an unexpected null is dropped, not defaulted to 0.
  if (row.centroid_lat == null || row.centroid_lng == null) return null;

  const stats: GeoStatsDTO = {};
  if (row.median_list_price != null && row.median_sample_size != null) {
    stats.medianListPrice = {
      value: row.median_list_price,
      sampleSize: row.median_sample_size,
    };
  }
  if (row.active_listings != null && row.active_listings > 0) {
    stats.activeListings = row.active_listings;
  }

  return {
    id: row.id,
    level: 'city',
    name: row.name,
    state: row.state,
    centroid: { lat: row.centroid_lat, lng: row.centroid_lng },
    ...(row.hero_storage_path ? { heroUrl: publicCoverImageUrl(row.hero_storage_path) } : {}),
    communityCount: row.community_count,
    sampleCommunityNames: row.sample_community_names ?? [],
    stats,
  };
}

/**
 * Cached city units. 1h TTL — community geography changes on a seeding
 * cadence, not a request cadence. Cache key unchanged from the in-process form:
 * the output contract is identical, so a deployed cache entry stays valid.
 */
export const fetchCityGeoUnits = unstable_cache(
  async (): Promise<GeoUnitDTO[]> => {
    const supabase = await createAnonClient();
    const { data, error } = await supabase
      .from('city_geo_units')
      .select(
        'id, name, state, centroid_lat, centroid_lng, hero_storage_path, community_count, sample_community_names, median_list_price, median_sample_size, active_listings',
      )
      // Densest first: a city with 731 communities is a more useful early card
      // than one with a single seeded neighbourhood. Name breaks ties so the
      // order is deterministic across requests (the client engine assumes it).
      .order('community_count', { ascending: false })
      .order('name', { ascending: true });

    if (error) throw new Error(`geo-units: city_geo_units read failed: ${error.message}`);
    return ((data ?? []) as CityGeoUnitRow[])
      .map(projectUnit)
      .filter((u): u is GeoUnitDTO => u !== null);
  },
  ['geo-units:city:v1'],
  { revalidate: 3600, tags: [GEO_UNITS_TAG] },
);
