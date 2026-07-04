/**
 * POST /api/listings/[id]/generate-tour
 *   Enqueue a render job that turns the listing's photos into a
 *   Ken Burns home tour MP4. An out-of-process EC2 worker
 *   (scripts/render-worker/worker.py) picks up the job, renders,
 *   uploads to Cloudflare Stream, and updates the listing_videos row.
 *
 * GET /api/listings/[id]/generate-tour?jobId=X
 *   Poll status of a queued/running job. Returns
 *   { status, videoRowId, cf_video_id?, error? }.
 *
 * Phase 71 (2026-07-05): replaces the Phase 12 501 stub.
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

async function deleteCfVideo(cfVideoId: string): Promise<void> {
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return; // best-effort; worker will orphan quietly
  await fetch(`${CF_API_BASE}/accounts/${account}/stream/${cfVideoId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {
    /* swallow — CF cleanup is best-effort on re-render */
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types don't cover new tables
  const sb = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Ownership check via listing → agent chain.
  const { data: listing } = await sb
    .from('listings')
    .select('id, agent_id, agents!inner(user_id)')
    .eq('id', id)
    .eq('agents.user_id', user.id)
    .maybeSingle();

  if (!listing) {
    return NextResponse.json({ error: 'listing_not_found' }, { status: 404 });
  }

  // Photo count guard.
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

  // If a walkthrough row already exists, delete it (allow re-render).
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

  // Compute next sort_order.
  const { data: maxRow } = await sb
    .from('listing_videos')
    .select('sort_order')
    .eq('listing_id', id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  // Insert placeholder listing_videos row (external_url set to a sentinel
  // so the source-present check passes; worker will null it and set
  // cf_video_id when the render completes).
  const { data: videoRow, error: videoErr } = await sb
    .from('listing_videos')
    .insert({
      listing_id: id,
      cf_video_id: null,
      external_url: 'pending://render',
      kind: 'walkthrough',
      status: 'processing',
      sort_order: nextSort,
      title: 'Home tour (auto-generated)',
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

  // Insert render job.
  const { data: job, error: jobErr } = await sb
    .from('render_jobs')
    .insert({ listing_id: id, video_row_id: videoRowId, status: 'queued' })
    .select('id')
    .single();

  if (jobErr || !job) {
    // Roll back the placeholder video row.
    await sb.from('listing_videos').delete().eq('id', videoRowId);
    return NextResponse.json(
      { error: 'job_insert_failed', message: jobErr?.message ?? 'insert failed' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { jobId: (job as { id: string }).id, videoRowId },
    { status: 202 },
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'missing_jobId' }, { status: 400 });
  }

  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types don't cover new tables
  const sb = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: job } = await sb
    .from('render_jobs')
    .select('id, status, error, video_row_id, listing_id')
    .eq('id', jobId)
    .eq('listing_id', id)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: 'job_not_found' }, { status: 404 });
  }

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
