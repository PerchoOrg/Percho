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
 * Aggregated in-process behind `unstable_cache`, not in SQL. The plan's
 * preferred form was a `city_geo_units` view, but that is a migration against
 * the linked remote and needs explicit owner approval (CLAUDE.md §8), so this
 * is the approved fallback: paged fetch + in-process reduce, same cache key,
 * same output contract. Swapping in the view later changes only this file.
 *
 * CRITICAL: `boundary` must NOT be selected here. The Nextdoor seeds are dense
 * multipolygons (multi-KB each) and PostgREST hits `statement_timeout` (PG
 * 57014) trying to stream ~8k of them, returning nothing at all — the same trap
 * documented in `lib/communities/list.ts`. Boundary is a per-card concern,
 * fetched lazily elsewhere.
 *
 * Every emitted number is real or absent. No estimates, no placeholders: a
 * median price is emitted only at a sample size that makes it meaningful, and
 * `stats` is `{}` when nothing real is known.
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

/**
 * Below this a "median" is one or two listings wearing a statistic's clothes.
 * 265 listings across ~500 cities means most cities legitimately have no
 * median — the card omits the row rather than showing a fabricated one.
 */
const MEDIAN_MIN_SAMPLE = 8;

/** Page size for the community scan. Keeps each PostgREST response small. */
const SCAN_PAGE = 1000;

type CommunityScanRow = {
  name: string;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  cover_storage_path: string | null;
};

type ListingScanRow = {
  city: string | null;
  state: string | null;
  price: number | null;
};

function citySlug(city: string, state: string): string {
  const slug = `${city}-${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `city:${slug}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

/**
 * Fetch every community row needed for aggregation, paged.
 * Selects the six columns the aggregate needs and nothing else.
 */
async function scanCommunities(): Promise<CommunityScanRow[]> {
  const supabase = await createAnonClient();
  const rows: CommunityScanRow[] = [];

  for (let offset = 0; ; offset += SCAN_PAGE) {
    const { data, error } = await supabase
      .from('communities')
      .select('name, city, state, lat, lng, cover_storage_path')
      .eq('status', 'active')
      .range(offset, offset + SCAN_PAGE - 1);

    if (error) throw new Error(`geo-units: community scan failed: ${error.message}`);
    const page = (data ?? []) as CommunityScanRow[];
    rows.push(...page);
    if (page.length < SCAN_PAGE) break;
  }
  return rows;
}

async function scanActiveListings(): Promise<ListingScanRow[]> {
  const supabase = await createAnonClient();
  const { data, error } = await supabase
    .from('listings')
    .select('city, state, price')
    .eq('status', 'active');

  if (error) throw new Error(`geo-units: listing scan failed: ${error.message}`);
  return (data ?? []) as ListingScanRow[];
}

interface CityAccumulator {
  city: string;
  state: string;
  latSum: number;
  lngSum: number;
  coordCount: number;
  communityCount: number;
  sampleNames: string[];
  heroPath: string | null;
}

/**
 * Pure reduce: communities + listings → city units. Exported for direct
 * testing without touching Supabase.
 */
export function aggregateCityUnits(
  communities: CommunityScanRow[],
  listings: ListingScanRow[],
): GeoUnitDTO[] {
  const byCity = new Map<string, CityAccumulator>();

  for (const c of communities) {
    // A unit needs a real name to key on. No "Unknown City" bucket.
    if (!c.city || !c.state) continue;
    const key = `${c.city}|${c.state}`;
    let acc = byCity.get(key);
    if (!acc) {
      acc = {
        city: c.city,
        state: c.state,
        latSum: 0,
        lngSum: 0,
        coordCount: 0,
        communityCount: 0,
        sampleNames: [],
        heroPath: null,
      };
      byCity.set(key, acc);
    }
    acc.communityCount += 1;
    if (c.lat != null && c.lng != null) {
      acc.latSum += c.lat;
      acc.lngSum += c.lng;
      acc.coordCount += 1;
    }
    if (acc.sampleNames.length < 3 && c.name) acc.sampleNames.push(c.name);
    if (!acc.heroPath && c.cover_storage_path) acc.heroPath = c.cover_storage_path;
  }

  // Listing prices grouped the same way, so the median is over the same unit.
  const pricesByCity = new Map<string, number[]>();
  const countByCity = new Map<string, number>();
  for (const l of listings) {
    if (!l.city || !l.state) continue;
    const key = `${l.city}|${l.state}`;
    countByCity.set(key, (countByCity.get(key) ?? 0) + 1);
    if (l.price != null && l.price > 0) {
      const arr = pricesByCity.get(key);
      if (arr) arr.push(l.price);
      else pricesByCity.set(key, [l.price]);
    }
  }

  const units: GeoUnitDTO[] = [];
  for (const [key, acc] of byCity) {
    // No coordinates → no map thumb, no distance math. Skip rather than
    // emit a unit centred on (0,0) in the Gulf of Guinea.
    if (acc.coordCount === 0) continue;

    const prices = pricesByCity.get(key) ?? [];
    const activeListings = countByCity.get(key);
    const stats: GeoStatsDTO = {};
    if (prices.length >= MEDIAN_MIN_SAMPLE) {
      stats.medianListPrice = { value: median(prices), sampleSize: prices.length };
    }
    if (activeListings != null && activeListings > 0) {
      stats.activeListings = activeListings;
    }

    units.push({
      id: citySlug(acc.city, acc.state),
      level: 'city',
      name: acc.city,
      state: acc.state,
      centroid: {
        lat: acc.latSum / acc.coordCount,
        lng: acc.lngSum / acc.coordCount,
      },
      ...(acc.heroPath ? { heroUrl: publicCoverImageUrl(acc.heroPath) } : {}),
      communityCount: acc.communityCount,
      sampleCommunityNames: acc.sampleNames,
      stats,
    });
  }

  // Densest first: a city with 468 communities is a more useful early card
  // than one with a single seeded neighbourhood. Tie-break by name so the
  // order is deterministic across requests (the client engine assumes it).
  units.sort((a, b) => b.communityCount - a.communityCount || a.name.localeCompare(b.name));
  return units;
}

/**
 * Cached city units. 1h TTL — community geography changes on a seeding
 * cadence, not a request cadence.
 */
export const fetchCityGeoUnits = unstable_cache(
  async (): Promise<GeoUnitDTO[]> => {
    const [communities, listings] = await Promise.all([scanCommunities(), scanActiveListings()]);
    return aggregateCityUnits(communities, listings);
  },
  ['geo-units:city:v1'],
  { revalidate: 3600, tags: [GEO_UNITS_TAG] },
);
