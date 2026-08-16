/**
 * GET /api/admin/community-tour/[id]/clips
 *   Photo→clip status for a community's photos, including cache hits
 *   (photo_clips rows created by another community are reused).
 *
 * Returns every poi_photos row linked to this community's POIs, joined with
 * its photo_clips status + public video URL.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId } = await params;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb: any = createServiceClient();

  // community_pois → pois → poi_photos
  const { data: links } = await sb
    .from('community_pois')
    .select('poi_id')
    .eq('community_id', communityId);
  const poiIds = [...new Set((links ?? []).map((l: { poi_id: string }) => l.poi_id))];
  if (poiIds.length === 0) return NextResponse.json({ clips: [] });

  // google_place_id per POI — used to mark agent-recommended photos
  const { data: pois } = await sb.from('pois').select('id, google_place_id').in('id', poiIds);

  // The latest run's resolve step: which place_ids survived the firewall.
  const { data: runs } = await sb
    .from('community_tour_runs')
    .select('step_results')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(1);
  const resolve = (
    runs?.[0]?.step_results as { resolve?: { resolved?: Array<{ place_id: string }> } } | undefined
  )?.resolve;
  const recommendedIds = new Set(
    (resolve?.resolved ?? []).map((r: { place_id: string }) => r.place_id),
  );

  const { data: photos } = await sb
    .from('poi_photos')
    .select('id, poi_id, storage_path, enhanced_path, enhanced_status, ai_tags')
    .in('poi_id', poiIds);

  const { data: clips } = await sb
    .from('photo_clips')
    .select('photo_id, engine, duration_s, status, storage_path, cost_usd, error')
    .in(
      'photo_id',
      (photos ?? []).map((p: { id: string }) => p.id),
    );

  const clipByPhoto = new Map<
    string,
    {
      photo_id: string;
      engine: string;
      duration_s: number | null;
      status: string;
      storage_path: string | null;
      cost_usd: number | null;
      error: string | null;
    }
  >(
    (clips ?? []).map(
      (c: {
        photo_id: string;
        engine: string;
        duration_s: number | null;
        status: string;
        storage_path: string | null;
        cost_usd: number | null;
        error: string | null;
      }) => [c.photo_id, c],
    ),
  );
  // Seedance vs depthflow/kenburns clips are separate rows (same photo can
  // have both). The UI shows two columns; key by photo_id + engine.
  const clipsByPhotoEngine = new Map<string, typeof clipByPhoto extends Map<string, infer V> ? V : never>();
  for (const c of clips ?? []) {
    clipsByPhotoEngine.set(`${c.photo_id}:${c.engine}`, c);
  }
  const publicBase = sb.storage
    .from('ai-videos')
    .getPublicUrl('__probe__')
    .data.publicUrl.replace('/__probe__', '');
  // Local render clips (depthflow/kenburns) live in clip-renders, not the
  // paid ai-videos bucket — keep the two money classes separate.
  const renderBase = sb.storage
    .from('clip-renders')
    .getPublicUrl('__probe__')
    .data.publicUrl.replace('/__probe__', '');

  const poiPlaceId = new Map<string, string>(
    (pois ?? []).map((poi: { id: string; google_place_id: string }) => [
      poi.id,
      poi.google_place_id,
    ]),
  );

  const rows = (photos ?? []).map(
    (p: {
      id: string;
      poi_id: string;
      storage_path: string;
      enhanced_path: string | null;
      enhanced_status: string;
      ai_tags: unknown;
    }) => {
      const clip = clipByPhoto.get(p.id);
      const dakbClip = clipsByPhotoEngine.get(`${p.id}:depthflow`) ?? clipsByPhotoEngine.get(`${p.id}:kenburns`);
      const path =
        p.enhanced_status === 'approved' && p.enhanced_path ? p.enhanced_path : p.storage_path;
      const clipOut = (c: (typeof clipByPhoto extends Map<string, infer V> ? V : never) | undefined, isDakb: boolean) =>
        c
          ? {
              engine: c.engine,
              duration_s: c.duration_s,
              status: c.status,
              video_url: c.storage_path
                ? `${isDakb ? renderBase : publicBase}/${c.storage_path}`
                : null,
              cost_usd: c.cost_usd,
              error: c.error,
            }
          : null;
      return {
        photo_id: p.id,
        poi_id: p.poi_id,
        photo_url: `${sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl}`,
        ai_tags: p.ai_tags ?? null,
        recommended:
          recommendedIds.has(poiPlaceId.get(p.poi_id) ?? '') ||
          (clip?.status === 'ready' ? true : false),
        clip: clipOut(clip, false),
        dakb_clip: clipOut(dakbClip, true),
      };
    },
  );

  return NextResponse.json({ clips: rows });
}
