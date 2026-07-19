/**
 * Auto-associate a listing to a seeded community by point-in-polygon.
 *
 * . Given a listing lat/lng, scan every community
 * that has a `boundary` and return the id of the polygon that contains
 * the point. Returns null if no polygon matches (e.g. listing outside
 * Atlanta, or new city where we don't have seeds yet — agent can pick
 * manually or leave community_id null).
 *
 * Query is small: `boundary` payloads are ~5-30KB each, 731 rows = ~10MB
 * per full scan. We cache-tag the fetch so repeated calls within a 5-min
 * window share one round-trip. The bbox prefilter cuts the geometry work
 * to typically 1-3 real ray-cast tests per lookup.
 *
 * Ownership auto-claim (created_by := agent) is intentionally NOT done
 * here — communities are shared, edit rights come from having an active
 * listing in the community (see migration 20260715120000).
 */

import { createClient } from '@/lib/supabase/server';
import { unstable_cache } from 'next/cache';
import { type GeoJsonPolygonLike, bboxOf, pointInBbox, pointInPolygon } from './point-in-polygon';

type CommunityBoundary = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string;
  boundary: GeoJsonPolygonLike;
  bbox: [number, number, number, number];
};

/**
 * Load all communities with boundaries. Cached 5 min under the shared
 * `community-boundaries` tag. Bust from an admin path if seeds change.
 */
const loadBoundaries = unstable_cache(
  async (): Promise<CommunityBoundary[]> => {
    const supabase = await createClient();
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data, error } = (await (supabase as any)
      .from('communities')
      .select('id, slug, name, city, state, boundary')
      .not('boundary', 'is', null)) as {
      data: Array<{
        id: string;
        slug: string;
        name: string;
        city: string | null;
        state: string;
        boundary: GeoJsonPolygonLike;
      }> | null;
      error: unknown;
    };
    if (error || !data) return [];
    const out: CommunityBoundary[] = [];
    for (const row of data) {
      const bbox = bboxOf(row.boundary);
      if (!bbox) continue;
      out.push({ ...row, bbox });
    }
    return out;
  },
  ['community-boundaries-v1'],
  { revalidate: 300, tags: ['community-boundaries'] },
);

export type CommunityMatch = Pick<CommunityBoundary, 'id' | 'slug' | 'name' | 'city' | 'state'>;

/**
 * Return the community whose polygon contains (lng, lat), or null.
 *
 * If multiple polygons contain the point (nested / overlapping seeds), we
 * return the one with the smallest bbox area — a subdivision inside a
 * neighborhood wins over the neighborhood itself. Percho's community
 * anchor convention is subdivision-level (see memory §25), so this
 * matches the existing product model.
 */
export async function findCommunityForPoint(
  lat: number,
  lng: number,
): Promise<CommunityMatch | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rows = await loadBoundaries();

  let best: CommunityBoundary | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const c of rows) {
    if (!pointInBbox(lng, lat, c.bbox)) continue;
    if (!pointInPolygon(lng, lat, c.boundary)) continue;
    const area = (c.bbox[2] - c.bbox[0]) * (c.bbox[3] - c.bbox[1]);
    if (area < bestArea) {
      bestArea = area;
      best = c;
    }
  }
  if (!best) return null;
  const { id, slug, name, city, state } = best;
  return { id, slug, name, city, state };
}
