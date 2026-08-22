/**
 * POST /api/admin/community-tour/[id]/ingest-url
 *   Pull every image on a page the admin nominated into `poi_photos` as
 *   pending, for review in the photo table on the same screen.
 *
 * Exists because Google Places has no photos of an HOA pool or clubhouse —
 * they are not listed businesses — so a subdivision's real imagery only lives
 * on the community's own site. Nothing here approves a photo; that stays a
 * human decision in the table.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { ingestPagePhotos } from '@/lib/poi/ingest-page-photos';
import { CommunityPhotoIngest } from '@/lib/zod/schemas';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// One page can carry 80 images; each is a download plus an upload.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId } = await params;

  const parsed = CommunityPhotoIngest.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }

  const result = await ingestPagePhotos(communityId, parsed.data.url, parsed.data.label);
  if ('error' in result) {
    return NextResponse.json(result, { status: result.error === 'not_found' ? 404 : 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}
