/**
 * GET /api/admin/listings/[id]/clips
 *   Photo→clip status for one listing's photos, per surface.
 *
 * The home tour's counterpart to /api/admin/community-tour/[id]/clips. The
 * table renders three clip columns (Seedance, DepthFlow, Ken Burns), so this
 * returns one entry per photo carrying all three.
 *
 * `surface` defaults to ios — the primary surface, and the only one the
 * generate step enqueues by default.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface ClipRow {
  listing_photo_id: string;
  engine: string;
  duration_s: number | null;
  status: string;
  storage_path: string | null;
  cost_usd: number | null;
  error: string | null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: listingId } = await params;
  const surface = new URL(req.url).searchParams.get('surface') === 'web' ? 'web' : 'ios';
  const sb = createServiceClient();

  const { data: photos } = (await sb
    .from('listing_photos')
    .select('id')
    .eq('listing_id', listingId)) as { data: Array<{ id: string }> | null };
  const photoIds = (photos ?? []).map((p) => p.id);
  if (photoIds.length === 0) return NextResponse.json({ clips: [] });

  const { data: clips } = (await sb
    .from('listing_photo_clips')
    .select('listing_photo_id, engine, duration_s, status, storage_path, cost_usd, error')
    .eq('surface', surface)
    .in('listing_photo_id', photoIds)) as { data: ClipRow[] | null };

  // Seedance renders land in the paid `ai-videos` bucket; DepthFlow and Ken
  // Burns render locally into `clip-renders`. Keeping the two money classes in
  // separate buckets is the community tour's convention and this follows it.
  const base = (bucket: string) =>
    sb.storage.from(bucket).getPublicUrl('__probe__').data.publicUrl.replace('/__probe__', '');
  const paidBase = base('ai-videos');
  const localBase = base('clip-renders');

  const byPhotoEngine = new Map<string, ClipRow>();
  for (const c of clips ?? []) byPhotoEngine.set(`${c.listing_photo_id}:${c.engine}`, c);

  const project = (c: ClipRow | undefined) =>
    c
      ? {
          engine: c.engine,
          duration_s: c.duration_s,
          status: c.status,
          video_url: c.storage_path
            ? `${c.engine === 'seedance' ? paidBase : localBase}/${c.storage_path}`
            : null,
          cost_usd: c.cost_usd,
          error: c.error,
        }
      : null;

  const rows = photoIds.map((id) => ({
    photo_id: id,
    clip: project(byPhotoEngine.get(`${id}:seedance`)),
    depthflow_clip: project(byPhotoEngine.get(`${id}:depthflow`)),
    kenburns_clip: project(byPhotoEngine.get(`${id}:kenburns`)),
  }));

  return NextResponse.json({ surface, clips: rows });
}
