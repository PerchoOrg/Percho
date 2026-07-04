/**
 * GET /api/demo/autofill?q=<partial-address>
 *
 * Mock endpoint for the KW Atlanta pitch demo. Returns matching pre-seeded
 * Atlanta listings from `lib/mls/mock-data.ts`. No real MLS calls. Not
 * gated by credentials — safe to call from the /demo/autofill client.
 */

import { NextResponse } from 'next/server';
import { searchMockListings } from '@/lib/mls/mock-data';

export const runtime = 'nodejs';

export function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const results = searchMockListings(q);
  return NextResponse.json({
    query: q,
    count: results.length,
    results,
  });
}
