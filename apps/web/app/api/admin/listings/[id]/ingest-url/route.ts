/**
 * POST /api/admin/listings/[id]/ingest-url
 *   Pull every photograph on a page the admin nominated into `listing_photos`,
 *   ready for the home tour's Tag step.
 *
 * The home tour's counterpart to /api/admin/community-tour/[id]/ingest-url,
 * and deliberately the same shape: one page per request, so a slow site cannot
 * take the whole batch down with it and the panel can report each page as it
 * lands.
 *
 * Unlike the community route there is no source row to record — a listing has
 * no research step naming candidate sites, so there is no list to tick.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { ingestListingPagePhotos } from '@/lib/poi/ingest-listing-page-photos';
import { ListingPhotoIngest } from '@/lib/zod/schemas';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// One page can carry 80 images; each is a download plus an upload.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: listingId } = await params;

  const parsed = ListingPhotoIngest.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }

  const result = await ingestListingPagePhotos(listingId, parsed.data.url);
  if ('error' in result) {
    return NextResponse.json(result, { status: result.error === 'not_found' ? 404 : 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}
