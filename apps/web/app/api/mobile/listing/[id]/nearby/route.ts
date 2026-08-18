/**
 * Nearby POIs for one listing — the deep map screen's data.
 *
 *   GET /api/mobile/listing/<id>/nearby
 *   → 200 { center, pois[] } | 404 | 500
 *
 * The card's map thumbnail is a cached, non-interactive picture (see
 * `scripts/maintenance/backfill_listing_maps.py`). Tapping it opens the real map, and THAT
 * is the only place we spend a request to build POI geometry — the feed itself
 * never does.
 *
 * `pois.location` is a Postgres point rendered by PostgREST as the string
 * `"(lng,lat)"` — note the order: point() is (x,y) = (longitude, latitude).
 * Reading it as lat-first silently mirrors every pin into the wrong hemisphere,
 * so it is parsed in one place here.
 */

import { createAnonClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Buyer-facing labels for the intent buckets. */
const BUCKET_LABELS: Record<string, string> = {
  outdoor: 'Parks & outdoors',
  schools: 'Schools',
  dining: 'Dining',
  shopping: 'Shopping',
  daily_errands: 'Daily errands',
  kids: 'Kids',
  walkable: 'Walkable',
  daily_drive: 'Daily drive',
  lifestyle: 'Lifestyle',
};

/** `"(lng,lat)"` → `{ lat, lng }`. Returns null on anything unparseable. */
function parsePoint(raw: unknown): { lat: number; lng: number } | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^\(?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)?$/);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: 'listing id required' }, { status: 400 });
  }

  try {
    const supabase = createAnonClient();

    // Cast the row shape: the generated Supabase types predate the `map_url`
    // column (migration 20260728100000), and without a cast every field narrows
    // to `never`. Same pattern as lib/feed/browse-cards.ts.
    const { data: listing, error: lErr } = (await supabase
      .from('listings')
      .select('id, address, city, state, lat, lng, map_url')
      .eq('id', id.trim())
      .maybeSingle()) as {
      data: {
        id: string;
        address: string;
        city: string | null;
        state: string | null;
        lat: number | null;
        lng: number | null;
        map_url: string | null;
      } | null;
      error: unknown;
    };
    if (lErr) throw lErr;
    if (!listing) {
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }
    if (listing.lat == null || listing.lng == null) {
      // An ungeocoded listing has no map to show. 200 with an empty set rather
      // than 404: the listing exists, it just has no geometry yet.
      return NextResponse.json({
        center: null,
        listing: { id: listing.id, address: listing.address },
        pois: [],
      });
    }

    const { data: links, error: linkErr } = (await supabase
      .from('listing_pois')
      .select('poi_id, intent_bucket, distance_m')
      .eq('listing_id', listing.id)
      // Only curated links reach a buyer. `candidate` is un-reviewed discovery
      // output; the RLS policy enforces this too (migration 20260728110000) but
      // stating it here keeps the intent visible at the read site.
      .eq('status', 'approved')
      .order('distance_m', { ascending: true })
      .limit(60)) as {
      data: { poi_id: string; intent_bucket: string; distance_m: number | null }[] | null;
      error: unknown;
    };
    if (linkErr) throw linkErr;

    const ids = [...new Set((links ?? []).map((l) => l.poi_id))];
    const byId = new Map<
      string,
      {
        display_name: string;
        primary_type: string | null;
        rating: number | null;
        location: unknown;
      }
    >();
    if (ids.length > 0) {
      const { data: pois, error: pErr } = (await supabase
        .from('pois')
        .select('id, display_name, primary_type, rating, location')
        .in('id', ids)) as {
        data:
          | {
              id: string;
              display_name: string;
              primary_type: string | null;
              rating: number | null;
              location: unknown;
            }[]
          | null;
        error: unknown;
      };
      if (pErr) throw pErr;
      for (const p of pois ?? []) byId.set(p.id, p);
    }

    const pois = (links ?? [])
      .map((l) => {
        const p = byId.get(l.poi_id);
        if (!p) return null;
        const at = parsePoint(p.location);
        if (!at) return null; // a pin with no coordinate can't be placed
        return {
          id: l.poi_id,
          name: p.display_name,
          type: p.primary_type,
          rating: p.rating,
          distanceM: l.distance_m,
          bucket: l.intent_bucket,
          bucketLabel: BUCKET_LABELS[l.intent_bucket] ?? l.intent_bucket,
          lat: at.lat,
          lng: at.lng,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return NextResponse.json({
      center: { lat: listing.lat, lng: listing.lng },
      listing: {
        id: listing.id,
        address: listing.address,
        city: listing.city,
        state: listing.state,
        mapUrl: listing.map_url ?? null,
      },
      pois,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
