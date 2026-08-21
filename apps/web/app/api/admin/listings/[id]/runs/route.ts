/**
 * GET  /api/admin/listings/[id]/runs  → home-tour runs + step_results
 * POST /api/admin/listings/[id]/runs  → create a new run
 *
 * The home tour's counterpart to /api/admin/community-tour/[id]/runs. Each run
 * persists per-step outputs in step_results jsonb; the admin page renders
 * whichever steps have data. Step execution happens in /runs/[runId]/step.
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

  return NextResponse.json({ runs: data ?? [] });
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
