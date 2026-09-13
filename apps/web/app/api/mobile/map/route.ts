/**
 * Mobile map viewport endpoint (phase281 — the zoom-band map).
 *
 *   GET /api/mobile/map?minLat=…&maxLat=…&minLng=…&maxLng=…
 *   → 200 { listings, communities } | 400 { error } | 500 { error }
 *
 * The queries and projections live in `lib/listings/search.ts`
 * (`mapEntities`), shared with the text search so the two faces of the map
 * cannot disagree about what a community or a home looks like on the wire.
 */

import { mapEntities } from '@/lib/listings/search';
import { mobileMapBoundsSchema } from '@/lib/zod/mobile-map';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const parsed = mobileMapBoundsSchema.safeParse({
    minLat: p.get('minLat'),
    maxLat: p.get('maxLat'),
    minLng: p.get('minLng'),
    maxLng: p.get('maxLng'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid bounds' }, { status: 400 });
  }

  try {
    return NextResponse.json(await mapEntities(parsed.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
