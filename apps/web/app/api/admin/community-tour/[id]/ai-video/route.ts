/**
 * POST /api/admin/community-tour/[id]/ai-video
 *   Enqueue ONE AI clip per selected-photo batch (owner 2026-08-15: pick
 *   photos on the Community Tour page, generate ONE AI video from all of
 *   them). Body: { photoIds: uuid[], prompt: string, durationS: 4..15 }
 *
 * GET /api/admin/community-tour/[id]/ai-video
 *   Return every row for this community (newest first).
 *
 * Generation runs in the LOCAL seedance worker
 * (scripts/seedance-worker/worker.ts — render-worker pattern, owns
 * OPENROUTER_API_KEY). This route only writes the queue row and reads
 * status; it never calls OpenRouter. The web app works from Vercel without
 * the key; the worker on the Mac has it.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import {
  AI_VIDEO_ASPECT,
  AI_VIDEO_BUCKET,
  type AiTourVideoRow,
  clipPrompt,
} from '@/lib/poi/ai-tour-video';
import { createServiceClient } from '@/lib/supabase/server';
import { GenerateAiTourVideos } from '@/lib/zod/ai-tour-video';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface JobRow {
  id: string;
  community_id: string;
  input_photo_ids: string[];
  prompt: string;
  duration_s: number;
  aspect_ratio: string;
  status: string;
  polling_url: string | null;
  storage_path: string | null;
  cost_usd: number | null;
  error: string | null;
  created_at: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId } = await params;

  const parsed = GenerateAiTourVideos.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', message: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 },
    );
  }
  const { photoIds, prompt, durationS } = parsed.data;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb = createServiceClient() as any;

  const { data: community } = await sb
    .from('communities')
    .select('id')
    .eq('id', communityId)
    .maybeSingle();
  if (!community) return NextResponse.json({ error: 'community_not_found' }, { status: 404 });

  // Scope check: only photos hanging off a POI linked to THIS community.
  const { data: links } = (await sb
    .from('community_pois')
    .select('poi_id')
    .eq('community_id', communityId)) as { data: Array<{ poi_id: string }> | null };
  const linkedPois = new Set((links ?? []).map((l) => l.poi_id));

  const { data: photos } = (await sb
    .from('poi_photos')
    .select('id, poi_id, pois!inner(display_name)')
    .in('id', photoIds)) as {
    data: Array<{ id: string; poi_id: string; pois: { display_name: string } | null }> | null;
  };

  const rows = photos ?? [];
  if (rows.length !== photoIds.length || rows.some((p) => !linkedPois.has(p.poi_id))) {
    return NextResponse.json(
      {
        error: 'photo_not_in_community',
        message: 'One or more selected photos do not belong to this community.',
      },
      { status: 400 },
    );
  }

  // One row per batch: the model weaves all selected photos into ONE video.
  const { error: insErr } = await sb.from('ai_tour_videos').insert({
    community_id: communityId,
    input_photo_ids: rows.map((p) => p.id),
    prompt: clipPrompt(prompt, rows[0]?.pois?.display_name),
    model: 'bytedance/seedance-2.0-mini',
    duration_s: durationS,
    aspect_ratio: AI_VIDEO_ASPECT,
    status: 'pending',
  });

  if (insErr) {
    return NextResponse.json(
      { error: 'enqueue_failed', message: (insErr as { message: string }).message },
      { status: 500 },
    );
  }

  return NextResponse.json({ queued: rows.length }, { status: 202 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId } = await params;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb = createServiceClient() as any;

  const { data } = (await sb
    .from('ai_tour_videos')
    .select(
      'id, community_id, input_photo_ids, prompt, duration_s, aspect_ratio, status, polling_url, storage_path, cost_usd, error, created_at',
    )
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(200)) as { data: JobRow[] | null };

  const videos: AiTourVideoRow[] = (data ?? []).map((r) => ({
    id: r.id,
    photo_ids: r.input_photo_ids ?? [],
    status: r.status as AiTourVideoRow['status'],
    video_url: r.storage_path ? publicUrl(sb, r.storage_path) : null,
    duration_s: r.duration_s,
    prompt: r.prompt,
    cost_usd: r.cost_usd,
    error: r.error,
    created_at: r.created_at,
  }));

  return NextResponse.json({ videos });
}

// biome-ignore lint/suspicious/noExplicitAny: stub generated types
function publicUrl(sb: any, path: string): string {
  const { data } = sb.storage.from(AI_VIDEO_BUCKET).getPublicUrl(path);
  return (data as { publicUrl: string }).publicUrl;
}
