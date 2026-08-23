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
import { createServiceClient } from '@/lib/supabase/server';
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

  // Record the page as a source, already read.
  //
  // Pasting a URL here IS the manual selection the owner's rule talks about
  // ("other webpages are optional unless I manually selected them"), so the
  // page belongs in the list the panel shows and the ingest step reads. It is
  // stamped `last_ingested_at` because it has just been read — without that,
  // the next Fetch Sites would download all 80 images again.
  //
  // Best-effort: the photos are already in the table, and failing the request
  // over a bookkeeping row would tell the admin his ingest did not work when
  // it did.
  const sb = createServiceClient();
  const { error: srcErr } = await sb.from('community_photo_sources').upsert(
    {
      community_id: communityId,
      url: parsed.data.url,
      label: parsed.data.label,
      origin: 'manual',
      enabled: true,
      last_ingested_at: new Date().toISOString(),
      last_result: { found: result.found, added: result.added, skipped: result.skipped.length },
    },
    { onConflict: 'community_id,url' },
  );
  if (srcErr) console.error('[community-tour] recording photo source failed:', srcErr);

  return NextResponse.json({ ok: true, ...result });
}
