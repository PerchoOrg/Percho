/**
 * Batch listing summaries (phase118 explore page).
 *
 *   GET /api/mobile/listings?ids=<uuid>,<uuid>,…
 *   → 200 { listings: ListingSummaryDTO[] } | 400 { error } | 500 { error }
 *
 * Serves the explore page's CompareRail and the FitCard's local derivation —
 * see `lib/listings/summaries.ts` for why one endpoint serves both. Unknown or
 * inactive ids are silently dropped; the client renders what remains.
 */

import { fetchListingSummaries, parseSummaryIds } from '@/lib/listings/summaries';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ids = parseSummaryIds(new URL(req.url).searchParams.get('ids'));
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids required (comma-separated uuids)' }, { status: 400 });
  }

  try {
    const listings = await fetchListingSummaries(ids);
    return NextResponse.json({ listings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
