/**
 * GET  /api/admin/community-tour/[id]/runs  → all pipeline runs + step_results
 * POST /api/admin/community-tour/[id]/runs  → create a new run
 *
 * Each run persists per-step outputs in step_results jsonb; the admin page
 * renders whichever steps have data. Step execution happens in
 * /runs/[runId]/step (this route only creates rows).
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface RunRow {
  id: string;
  community_id: string;
  status: string;
  step_results: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId } = await params;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb: any = createServiceClient();

  const { data } = (await sb
    .from('community_tour_runs')
    .select('id, community_id, status, step_results, created_at, updated_at')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(50)) as { data: RunRow[] | null };

  return NextResponse.json({ runs: data ?? [] });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id: communityId } = await params;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb: any = createServiceClient();

  const { data: community } = await sb
    .from('communities')
    .select('id')
    .eq('id', communityId)
    .maybeSingle();
  if (!community) return NextResponse.json({ error: 'community_not_found' }, { status: 404 });

  const { data: run, error } = await sb
    .from('community_tour_runs')
    .insert({ community_id: communityId, status: 'researching' })
    .select('id, community_id, status, step_results, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'create_failed', message: (error as { message: string }).message },
      { status: 500 },
    );
  }

  return NextResponse.json({ run }, { status: 201 });
}
