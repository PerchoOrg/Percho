/**
 * GET /api/communities/nearby?lat=&lng=&radius=
 *
 * Phase 45 (2026-06-20). Owner spec: "community 没有坐标 但是里面的 video
 * 有坐标,nearby 给 videos 所在的 community". So this endpoint:
 *
 *   1. bbox-prefilters `community_videos` by (lat, lng) within `radius` mi
 *   2. exact-haversine-filters the bbox corners
 *   3. groups by `community_id` (the video's primary community link)
 *   4. fetches the matching `CommunityListCard[]` so the grid can render
 *
 * Returned cards include a `nearestVideoMi` field — the closest video's
 * distance to the viewer, so the grid can show "0.4 mi away" badges.
 *
 * Mirrors `/api/nearby` (the listings flavour) for shape: same lat/lng
 * range checks, same radius cap, same JSON envelope. No auth required.
 */

import { fetchCommunityListCards } from '@/lib/communities/list';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const MAX_RADIUS_MI = 100;
const MIN_RADIUS_MI = 1;

const EARTH_RADIUS_MI = 3958.7613;

function haversineMi(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(x));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const radius = Number(url.searchParams.get('radius') ?? '10');

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(radius) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    radius < MIN_RADIUS_MI ||
    radius > MAX_RADIUS_MI
  ) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }

  // Rough bbox: 1° lat ≈ 69 mi; 1° lng ≈ 69·cos(lat) mi. Pad to be safe;
  // we exact-filter via haversine after the DB read.
  const latPad = radius / 69;
  const lngPad = radius / (69 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));

  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: videoRows } = (await (supabase as any)
    .from('community_videos')
    .select('id, community_id, lat, lng')
    .eq('status', 'ready')
    .eq('visibility', 'public')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .gte('lat', lat - latPad)
    .lte('lat', lat + latPad)
    .gte('lng', lng - lngPad)
    .lte('lng', lng + lngPad)
    .limit(500)) as {
    data: Array<{ id: string; community_id: string; lat: number; lng: number }> | null;
  };

  // Exact filter + closest-distance per community.
  const closestByCommunity = new Map<string, number>();
  for (const v of videoRows ?? []) {
    const d = haversineMi({ lat, lng }, { lat: v.lat, lng: v.lng });
    if (d > radius) continue;
    const prev = closestByCommunity.get(v.community_id);
    if (prev === undefined || d < prev) closestByCommunity.set(v.community_id, d);
  }

  // Reuse the standard community grid loader, then filter to only those
  // communities that had a nearby video. This double-loads (the loader
  // re-queries community_videos for cover/membership) but keeps card shape
  // identical to /communities so the grid renders the same.
  const allCards = await fetchCommunityListCards();
  const cards = allCards
    .filter((c) => closestByCommunity.has(c.id))
    .map((c) => ({
      ...c,
      nearestVideoMi: closestByCommunity.get(c.id) ?? null,
    }))
    .sort((a, b) => (a.nearestVideoMi ?? Infinity) - (b.nearestVideoMi ?? Infinity));

  return NextResponse.json({
    cards,
    center: { lat, lng },
    radius,
  });
}
