/**
 * Current mortgage rates for the mobile cost block.
 *
 *   GET /api/mobile/rates
 *   → 200 { rate30, rate15?, asOf, source } | 503 { error }
 *
 * Upstream is Freddie Mac's weekly PMMS CSV (`lib/rates/pmms.ts`), cached by
 * the fetch layer for six hours. The client keeps its own hardcoded fallback
 * and prints the `asOf` date, so a 503 here degrades to a labelled stale
 * figure rather than a blank.
 */

import { fetchMortgageRates } from '@/lib/rates/pmms';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rates = await fetchMortgageRates();
    if (!rates) {
      return NextResponse.json({ error: 'rate feed unparseable' }, { status: 503 });
    }
    return NextResponse.json(rates, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
