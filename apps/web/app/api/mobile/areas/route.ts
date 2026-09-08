/**
 * Areas for the Search tab's lens map.
 *
 *   GET /api/mobile/areas
 *   → 200 AreasDTO | 500 { error }
 *
 * Shapes and metrics both live in `lib/areas/areas.ts`; see its header for why
 * the geometry ships with the app and the numbers do not.
 *
 * No query parameters. The lens map computes its class breaks over the whole
 * metro at once — a filtered or paged response would give the same county a
 * different colour depending on what else was in the payload.
 */

import { fetchAreas } from '@/lib/areas/areas';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await fetchAreas());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
