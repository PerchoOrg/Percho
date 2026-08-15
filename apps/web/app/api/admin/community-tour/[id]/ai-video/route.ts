/**
 * POST /api/admin/community-tour/[id]/ai-video
 *   Enqueue ONE AI clip per selected-photo batch (owner 2026-08-15: pick
 *   photos on the Community Tour page, generate ONE AI video from all of
 *   them). Body: { photoIds: uuid[], prompt: string, durationS: 4..15 }
 *
 * GET /api/admin/community-tour/[id]/ai-video
 *   Advance the queue by one bounded step, then return every row for this
 *   community (newest first).
 *
 * WHY THE GET DOES WORK: generation takes minutes, which is longer than a
 * route handler may run, and this repo's only background worker is the EC2
 * render worker (ffmpeg/Cloudflare — a different pipeline we are told not to
 * touch). So the queue is pumped by the admin's own status polling: each GET
 * claims a little work (submit a pending row, finalize a completed one),
 * bounded by MAX_WORK_PER_PUMP so the request stays fast. Nothing is lost if
 * the admin closes the tab — the rows keep their state and the next GET (from
 * any admin) picks up where this one stopped.
 *
 * Concurrency: the pending → submitting claim is an UPDATE ... WHERE
 * status = 'pending' RETURNING id, so two tabs polling at once cannot submit
 * the same row twice.
 */

import {
  SEEDANCE_MODEL,
  downloadVideo,
  pollVideo,
  submitVideo,
  uploadFrameImage,
} from '@/lib/ai/openrouter-video';
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
export const maxDuration = 300;

/** Source bucket for POI photos (same one PhotoTable renders thumbnails from). */
const PHOTO_BUCKET = 'listing-photos';

/** Expensive steps (a submit or a download+upload) per GET. */
const MAX_WORK_PER_PUMP = 3;

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
  error: string | null;
  created_at: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: 'not_configured', message: 'OPENROUTER_API_KEY is not set on this deployment.' },
      { status: 501 },
    );
  }

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
    model: SEEDANCE_MODEL,
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

  if (process.env.OPENROUTER_API_KEY) await pump(sb, communityId);

  const { data } = (await sb
    .from('ai_tour_videos')
    .select(
      'id, community_id, input_photo_ids, prompt, duration_s, aspect_ratio, status, polling_url, storage_path, error, created_at',
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
    error: r.error,
    created_at: r.created_at,
  }));

  return NextResponse.json({ videos, configured: !!process.env.OPENROUTER_API_KEY });
}

// ─── queue pump ────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: stub generated types
async function pump(sb: any, communityId: string): Promise<void> {
  const { data } = (await sb
    .from('ai_tour_videos')
    .select(
      'id, community_id, input_photo_ids, prompt, duration_s, aspect_ratio, status, polling_url, storage_path, error, created_at',
    )
    .eq('community_id', communityId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(50)) as { data: JobRow[] | null };

  let budget = MAX_WORK_PER_PUMP;
  for (const row of data ?? []) {
    if (budget <= 0) return;
    try {
      if (row.status === 'pending') {
        if (await claim(sb, row.id)) {
          await submitClip(sb, row);
          budget -= 1;
        }
      } else if (await finalizeClip(sb, row)) {
        // Only a finished clip costs a download + upload; a poll that says
        // "still rendering" is cheap and doesn't eat the budget.
        budget -= 1;
      }
    } catch (err) {
      await fail(sb, row.id, err);
    }
  }
}

/** Atomic pending → submitting. False means another pump got there first. */
// biome-ignore lint/suspicious/noExplicitAny: stub generated types
async function claim(sb: any, id: string): Promise<boolean> {
  const { data } = (await sb
    .from('ai_tour_videos')
    .update({ status: 'submitting', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')) as { data: Array<{ id: string }> | null };
  return (data ?? []).length > 0;
}

// biome-ignore lint/suspicious/noExplicitAny: stub generated types
async function submitClip(sb: any, row: JobRow): Promise<void> {
  const { data: photos } = (await sb
    .from('poi_photos')
    .select('id, storage_path, enhanced_path, enhanced_status')
    .in('id', row.input_photo_ids ?? [])) as {
    data: Array<{
      id: string;
      storage_path: string;
      enhanced_path: string | null;
      enhanced_status: string;
    }> | null;
  };
  const photoMap = new Map((photos ?? []).map((p) => [p.id, p]));
  const missing = (row.input_photo_ids ?? []).filter((id) => !photoMap.has(id));
  if (missing.length > 0) throw new Error(`source photo(s) no longer exist: ${missing.join(', ')}`);

  // Same rule as the render worker: the enhanced file is only used once an
  // admin has approved it.
  const frameUrls: string[] = [];
  for (const id of row.input_photo_ids ?? []) {
    const photo = photoMap.get(id)!;
    const path =
      photo.enhanced_status === 'approved' && photo.enhanced_path
        ? photo.enhanced_path
        : photo.storage_path;

    const { data: blob, error: dlErr } = await sb.storage.from(PHOTO_BUCKET).download(path);
    if (dlErr || !blob) {
      throw new Error(
        `storage download failed: ${(dlErr as { message?: string })?.message ?? path}`,
      );
    }
    const file = blob as Blob;
    frameUrls.push(
      await uploadFrameImage(
        await file.arrayBuffer(),
        path.split('/').pop() || 'frame.jpg',
        file.type || 'image/jpeg',
      ),
    );
  }

  const job = await submitVideo({
    prompt: row.prompt,
    frameImageUrls: frameUrls,
    durationS: row.duration_s,
    aspectRatio: row.aspect_ratio,
  });

  await sb
    .from('ai_tour_videos')
    .update({
      status: 'processing',
      provider_job_id: job.id,
      polling_url: job.pollingUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
}

/** @returns true if the clip finished (and we spent a download + upload). */
// biome-ignore lint/suspicious/noExplicitAny: stub generated types
async function finalizeClip(sb: any, row: JobRow): Promise<boolean> {
  if (!row.polling_url) throw new Error('processing row has no polling_url');

  const state = await pollVideo(row.polling_url);
  if (state.status === 'processing') return false;
  if (state.status === 'failed') {
    await fail(sb, row.id, state.error);
    return false;
  }

  const mp4 = await downloadVideo(state.videoUrl);
  const storagePath = `${row.community_id}/${row.id}.mp4`;
  const { error: upErr } = await sb.storage
    .from(AI_VIDEO_BUCKET)
    .upload(storagePath, mp4, { contentType: 'video/mp4', upsert: true });
  if (upErr) throw new Error(`storage upload failed: ${(upErr as { message: string }).message}`);

  await sb
    .from('ai_tour_videos')
    .update({
      status: 'ready',
      storage_path: storagePath,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  return true;
}

// biome-ignore lint/suspicious/noExplicitAny: stub generated types
async function fail(sb: any, id: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await sb
    .from('ai_tour_videos')
    .update({
      status: 'failed',
      error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

// biome-ignore lint/suspicious/noExplicitAny: stub generated types
function publicUrl(sb: any, path: string): string {
  const { data } = sb.storage.from(AI_VIDEO_BUCKET).getPublicUrl(path);
  return (data as { publicUrl: string }).publicUrl;
}
