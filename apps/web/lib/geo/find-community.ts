/**
 * Associate a listing to a community from its lat/lng.
 *
 * One RPC, `match_community(lat, lng)` (migration 20260907200000), does the
 * work in Postgres with PostGIS: the containing polygon if there is one
 * (subdivision beats neighbourhood, then the smaller polygon), otherwise the
 * nearest active community with the distance in metres. It always returns a
 * community, so the caller must look at `match` before presenting a
 * `nearest` result as "this home is in X".
 *
 * This used to load every boundary into the function and ray-cast in JS.
 * supabase-js caps an unpaged select at 1,000 rows, so past the first 1,000
 * seeds the matcher was blind — see the migration header.
 *
 * Ownership auto-claim (created_by := agent) is intentionally NOT done
 * here — communities are shared, edit rights come from having an active
 * listing in the community (see migration 20260715120000).
 */

import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

export type CommunityMatch = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string;
  kind: string;
  match: 'boundary' | 'nearest';
  distanceM: number;
};

type MatchRow = Database['public']['Functions']['match_community']['Returns'][number];

export async function findCommunityForPoint(
  lat: number,
  lng: number,
): Promise<CommunityMatch | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data, error } = (await (supabase as any).rpc('match_community', {
    p_lat: lat,
    p_lng: lng,
  })) as { data: MatchRow[] | null; error: { message: string } | null };
  if (error) throw new Error(`match_community failed: ${error.message}`);
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.community_id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    state: row.state,
    kind: row.kind,
    match: row.match === 'boundary' ? 'boundary' : 'nearest',
    distanceM: row.distance_m,
  };
}
