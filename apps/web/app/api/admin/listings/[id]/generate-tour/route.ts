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

  // Which surface's render to (re)build. Owner 2026-08-03: "There should be two
  // buttons for generate video, one for web one for iOS". The worker reads
  // `render_jobs.orientations`; omitting it renders BOTH (the default, and what
  // the pre-2026-08-03 single button did).
  //
  //   ios  -> square    (1:1, fills the card's HERO_RATIO=0.618 media block)
  //   web  -> landscape (16:9)
  //
  // `engine` picks the motion engine for the camera moves (owner 2026-08-09).
  // 'mixed' is the default for new jobs: it chooses per clip, Ken Burns where
  // the canvas has to crop the photo so the frame can travel and reveal it,
  // DepthFlow where it doesn't. The other two render one engine throughout and
  // exist for comparison. NULL is still read as kenburns by the worker, which
  // is what rows queued before the column existed get.
  let orientations: string[] | null = null;
  const ENGINES = ['mixed', 'kenburns', 'depthflow'] as const;
  type Engine = (typeof ENGINES)[number];
  let engine: Engine = 'mixed';
  try {
    const body = (await _req.json()) as { surface?: string; engine?: string } | null;
    if (body?.surface === 'ios') orientations = ['square'];
    else if (body?.surface === 'web') orientations = ['landscape'];
    const requested = body?.engine;
    if (requested && (ENGINES as readonly string[]).includes(requested)) {
      engine = requested as Engine;
    }
  } catch {
    /* no body = render both surfaces with the default engine */
  }

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

  const { data: existing } = await sb
    .from('listing_videos')
    .select('id, cf_video_id, cf_video_id_landscape, cf_video_id_square, sort_order')
    .eq('listing_id', id)
    .eq('kind', 'walkthrough')
    .order('sort_order', { ascending: true });

  const rows = (existing ?? []) as Array<{
    id: string;
    cf_video_id: string | null;
    cf_video_id_landscape: string | null;
    cf_video_id_square: string | null;
    sort_order: number;
  }>;

  let videoRowId: string;

  if (orientations && rows[0]) {
    // Per-surface re-render: REUSE the row and delete only the CF asset for the
    // orientation being replaced. Dropping the row (what this route used to do
    // unconditionally) would throw away the OTHER surface's render, which is
    // exactly the split the two buttons exist to preserve.
    videoRowId = rows[0].id;
    const stale = orientations.includes('square')
      ? rows[0].cf_video_id_square
      : rows[0].cf_video_id_landscape;
    if (stale) await deleteCfVideo(stale);
    await sb.from('listing_videos').update({ status: 'processing' }).eq('id', videoRowId);
  } else {
    // Full rebuild (both surfaces): prior behaviour — drop every walkthrough
    // asset and row, insert a fresh one.
    for (const row of rows) {
      for (const uid of [row.cf_video_id, row.cf_video_id_landscape, row.cf_video_id_square]) {
        if (uid) await deleteCfVideo(uid);
      }
    }
    if (rows.length > 0) {
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
    videoRowId = (videoRow as { id: string }).id;
  }

  const { data: job, error: jobErr } = await sb
    .from('render_jobs')
    .insert({
      listing_id: id,
      video_row_id: videoRowId,
      status: 'queued',
      ...(orientations ? { orientations } : {}),
      ...(engine ? { engine } : {}),
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    // Only clean up a row WE created. A reused row must survive a failed enqueue.
    if (!orientations) await sb.from('listing_videos').delete().eq('id', videoRowId);
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
