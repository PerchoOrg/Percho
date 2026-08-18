/**
 * Mobile listing detail endpoint (spec-v3 `02-listing.md`, task-2).
 *
 *   GET /api/mobile/listing/<id-or-slug>
 *   → 200 ListingDetailDTO | 404 { error } | 500 { error }
 *
 * Accepts an id or a slug: the feed carries ids, shared links carry slugs.
 *
 * Every projection rule — which fields are real, why there is no
 * days-on-market, why the comps cohort is a city — lives in
 * `lib/listings/detail.ts`. Read that file's header before changing this one.
 */

import { fetchListingDetail } from '@/lib/listings/detail';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: 'listing id or slug required' }, { status: 400 });
  }

  try {
    const detail = await fetchListingDetail(id.trim());
    if (!detail) {
      // Also covers a listing that exists but is no longer active: from the
      // buyer's side an off-market home is gone, and a shell page with a
      // "status" badge is not something this screen offers.
      return NextResponse.json({ error: 'listing not found' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
