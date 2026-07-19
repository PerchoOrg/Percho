/**
 * POST /api/admin/listings/[id]/generate-tour
 *   Admin-scoped variant of /api/listings/[id]/generate-tour that
 *   bypasses the agent-ownership check — an admin can (re)render a
 *   walkthrough for any listing.
 *
 * GET  /api/admin/listings/[id]/generate-tour?jobId=X
 *   Poll status of an admin-triggered job.
 *
 * .
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

async function deleteCfVideo(cfVideoId: string): Promise<void> {
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return;
  await fetch(`${CF_API_BASE}/accounts/${account}/stream/${cfVideoId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {
    /* best-effort */
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb = createServiceClient() as any;

  const { data: listing } = await sb.from('listings').select('id').eq('id', id).maybeSingle();
  if (!listing) {
    return NextResponse.json({ error: 'listing_not_found' }, { status: 404 });
  }

  const { count: photoCount } = await sb
    .from('listing_photos')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', id);

  if (!photoCount || photoCount < 3) {
    return NextResponse.json(
      { error: 'not_enough_photos', message: 'Need at least 3 photos to generate a tour.' },
      { status: 400 },
    );
  }

  // Remove any prior walkthrough(s) before re-rendering.
  const { data: existing } = await sb
    .from('listing_videos')
    .select('id, cf_video_id')
    .eq('listing_id', id)
    .eq('kind', 'walkthrough');

  if (existing && existing.length > 0) {
    for (const row of existing as Array<{ id: string; cf_video_id: string | null }>) {
      if (row.cf_video_id) await deleteCfVideo(row.cf_video_id);
    }
    await sb.from('listing_videos').delete().eq('listing_id', id).eq('kind', 'walkthrough');
  }

  const { data: maxRow } = await sb
    .from('listing_videos')
    .select('sort_order')
    .eq('listing_id', id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data: videoRow, error: videoErr } = await sb
    .from('listing_videos')
    .insert({
      listing_id: id,
      cf_video_id: null,
      external_url: 'pending://render',
      kind: 'walkthrough',
      status: 'processing',
      sort_order: nextSort,
      title: 'Home tour (admin-generated)',
    })
    .select('id')
    .single();

  if (videoErr || !videoRow) {
    return NextResponse.json(
      { error: 'video_insert_failed', message: videoErr?.message ?? 'insert failed' },
      { status: 500 },
    );
  }

  const videoRowId = (videoRow as { id: string }).id;

  const { data: job, error: jobErr } = await sb
    .from('render_jobs')
    .insert({ listing_id: id, video_row_id: videoRowId, status: 'queued' })
    .select('id')
    .single();

  if (jobErr || !job) {
    await sb.from('listing_videos').delete().eq('id', videoRowId);
    return NextResponse.json(
      { error: 'job_insert_failed', message: jobErr?.message ?? 'insert failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({ jobId: (job as { id: string }).id, videoRowId }, { status: 202 });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'missing_jobId' }, { status: 400 });
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb = createServiceClient() as any;

  const { data: job } = await sb
    .from('render_jobs')
    .select('id, status, error, video_row_id, listing_id')
    .eq('id', jobId)
    .eq('listing_id', id)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: 'job_not_found' }, { status: 404 });

  const j = job as {
    id: string;
    status: string;
    error: string | null;
    video_row_id: string;
  };

  const { data: video } = await sb
    .from('listing_videos')
    .select('id, cf_video_id, status')
    .eq('id', j.video_row_id)
    .maybeSingle();

  const v = video as { cf_video_id: string | null; status: string } | null;

  return NextResponse.json({
    jobId: j.id,
    status: j.status,
    error: j.error,
    videoRowId: j.video_row_id,
    cf_video_id: v?.cf_video_id ?? null,
    videoStatus: v?.status ?? null,
  });
}
