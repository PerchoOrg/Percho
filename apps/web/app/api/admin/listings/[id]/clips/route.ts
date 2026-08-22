/**
 * GET /api/admin/listings/[id]/clips
 *   Photo→clip status for one listing's photos, per surface.
 *
 * The home tour's counterpart to /api/admin/community-tour/[id]/clips. The
 * table renders three clip columns (Seedance, DepthFlow, Ken Burns), so this
 * returns one entry per photo carrying all three.
 *
 * Both surfaces come back in one payload, keyed by surface inside each engine
 * slot. The table shows them in the SAME ROW rather than in six columns (owner
 * 2026-08-21: "can you put it in the same row with ios? it is taking a lot of
 * space") — three engine columns, two lines each.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface ClipRow {
  listing_photo_id: string;
  engine: string;
  surface: string;
  duration_s: number | null;
  status: string;
  storage_path: string | null;
  cost_usd: number | null;
  error: string | null;
  updated_at: string;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: listingId } = await params;
  const sb = createServiceClient();

  const { data: photos } = (await sb
    .from('listing_photos')
    .select('id')
    .eq('listing_id', listingId)) as { data: Array<{ id: string }> | null };
  const photoIds = (photos ?? []).map((p) => p.id);
  if (photoIds.length === 0) return NextResponse.json({ clips: [] });

  const { data: clips } = (await sb
    .from('listing_photo_clips')
    .select(
      'listing_photo_id, engine, surface, duration_s, status, storage_path, cost_usd, error, updated_at',
    )
    .in('listing_photo_id', photoIds)) as { data: ClipRow[] | null };

  // Seedance renders land in the paid `ai-videos` bucket; DepthFlow and Ken
  // Burns render locally into `clip-renders`. Keeping the two money classes in
  // separate buckets is the community tour's convention and this follows it.
  const base = (bucket: string) =>
    sb.storage.from(bucket).getPublicUrl('__probe__').data.publicUrl.replace('/__probe__', '');
  const paidBase = base('ai-videos');
  const localBase = base('clip-renders');

  const byKey = new Map<string, ClipRow>();
  for (const c of clips ?? []) byKey.set(`${c.listing_photo_id}:${c.engine}:${c.surface}`, c);

  const project = (c: ClipRow | undefined) =>
    c
      ? {
          engine: c.engine,
          surface: c.surface,
          duration_s: c.duration_s,
          status: c.status,
          // ?v= busts the browser/CDN cache: a regenerated clip OVERWRITES the
          // same storage path (upsert), so without a version the old bytes
          // keep playing under a row that says the new clip is ready (owner
          // hit this on 3525 Berkeley Park's hero, 2026-08-22).
          video_url: c.storage_path
            ? `${c.engine === 'seedance' ? paidBase : localBase}/${c.storage_path}?v=${Date.parse(c.updated_at) || 0}`
            : null,
          cost_usd: c.cost_usd,
          error: c.error,
        }
      : null;

  /** One engine slot, both canvases — what the table renders as two lines. */
  const bySurface = (id: string, engine: string) => ({
    ios: project(byKey.get(`${id}:${engine}:ios`)),
    web: project(byKey.get(`${id}:${engine}:web`)),
  });

  const rows = photoIds.map((id) => ({
    photo_id: id,
    clip: bySurface(id, 'seedance'),
    depthflow_clip: bySurface(id, 'depthflow'),
    kenburns_clip: bySurface(id, 'kenburns'),
  }));

  return NextResponse.json({ clips: rows });
}
