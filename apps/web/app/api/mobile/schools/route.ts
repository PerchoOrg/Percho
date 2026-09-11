/**
 * School points for the Search tab's school layer.
 *
 *   GET /api/mobile/schools
 *   → 200 SchoolPinsDTO | 500 { error }
 *
 * No query parameters, for the same reason `/api/mobile/areas` has none: the
 * client holds the set for the life of the screen and decides what to draw
 * from the region it is showing. See `lib/schools/map-pins.ts`.
 */

import { fetchSchoolPins } from '@/lib/schools/map-pins';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await fetchSchoolPins());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
