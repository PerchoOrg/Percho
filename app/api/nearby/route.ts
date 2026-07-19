/**
 * GET /api/nearby?lat=&lng=&radius=
 *
 * introduced for /nearby page (listings + community
 * videos within radius).
 * rewired to return `BrowseCard[]` so /nearby renders
 * the same grid as /browse (Explore). Behaviour unchanged for the caller's
 * `center` + `radius` echo; payload shape now wraps `cards` instead of two
 * separate arrays. Public — no auth required.
 *
 * Distance algorithm: bbox prefilter via b-tree on (lat, lng), then
 * exact haversine in JS to drop bbox corners. Caps at 200 listings.
 */

import { fetchNearbyCards } from '@/lib/feed/browse-cards';
import { NextResponse } from 'next/server';

const MAX_RADIUS_MI = 100; // sanity cap
const MIN_RADIUS_MI = 1;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const latStr = url.searchParams.get('lat');
  const lngStr = url.searchParams.get('lng');
  const radiusStr = url.searchParams.get('radius') ?? '10';

  const lat = Number(latStr);
  const lng = Number(lngStr);
  const radius = Number(radiusStr);

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

  const cards = await fetchNearbyCards({ lat, lng, radius });

  return NextResponse.json({
    cards,
    center: { lat, lng },
    radius,
  });
}
