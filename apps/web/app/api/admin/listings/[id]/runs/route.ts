/**
 * GET  /api/admin/listings/[id]/runs  → home-tour runs + step_results + jobs
 * POST /api/admin/listings/[id]/runs  → create a new run
 *
 * The home tour's counterpart to /api/admin/community-tour/[id]/runs. Each run
 * persists per-step outputs in step_results jsonb; the admin page renders
 * whichever steps have data. Step execution happens in /runs/[runId]/step.
 *
 * `jobs` is returned alongside because `step_results` cannot answer "is this
 * still running". Tag and plan are done by the render worker, and the only
 * thing `step_results` records at enqueue time is that we ASKED. If the worker
 * fails the job — or was never running — nothing comes back to correct the
 * run, and the step sits amber forever (owner 2026-08-21). `render_jobs` is
 * the row that knows.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: listingId } = await params;
  const sb = createServiceClient();

  const { data } = await sb
    .from('listing_tour_runs')
    .select('id, listing_id, status, step_results, created_at, updated_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(50);

  const runs = data ?? [];
  const runIds = runs.map((r) => r.id);

  // Newest first, so the client can take the first row per (run, step) and get
  // the current attempt rather than the first one ever made.
  const { data: jobs } = runIds.length
    ? await sb
        .from('render_jobs')
        .select('id, run_id, step, status, error, created_at, updated_at')
        .in('run_id', runIds)
        .neq('step', 'render')
        .order('created_at', { ascending: false })
    : { data: [] };

  return NextResponse.json({ runs, jobs: jobs ?? [] });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: listingId } = await params;
  const sb = createServiceClient();

  const { data: listing } = await sb
    .from('listings')
    .select('id')
    .eq('id', listingId)
    .maybeSingle();
  if (!listing) return NextResponse.json({ error: 'listing_not_found' }, { status: 404 });

  const { data: run, error } = await sb
    .from('listing_tour_runs')
    .insert({ listing_id: listingId, status: 'tagging' })
    .select('id, listing_id, status, step_results, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'create_failed', message: (error as { message: string }).message },
      { status: 500 },
    );
  }

  return NextResponse.json({ run }, { status: 201 });
}
