/**
 * GET  /api/admin/cleanup/runs — home-tour runs that stopped mid-pipeline.
 * POST /api/admin/cleanup/runs — mark the listed ones 'abandoned'.
 *
 * Marked, not deleted, by owner decision 2026-08-23: `step_results` holds the
 * plan the run produced, and deleting the row would mean re-running plan to
 * get it back. Marking is enough — the index stops offering the run as a live
 * "rerun in Plan" note once it is abandoned.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { loadStalledRuns } from '@/lib/cleanup/refs';
import { createServiceClient } from '@/lib/supabase/server';
import { RunCleanupBody } from '@/lib/zod/cleanup';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const runs = await loadStalledRuns(createServiceClient());
    return NextResponse.json({ runs, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'stalled run read failed' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = RunCleanupBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'bad request' },
      { status: 400 },
    );
  }

  const sb = createServiceClient();
  // Re-checked server-side: only a run that is STILL stalled may be closed, so
  // a worker that picked one up between the page render and the click keeps it.
  const stalled = new Set((await loadStalledRuns(sb)).map((r) => r.id));
  const ids = parsed.data.ids.filter((id) => stalled.has(id));
  if (ids.length === 0) return NextResponse.json({ abandoned: 0, at: new Date().toISOString() });

  const { error } = await sb
    .from('listing_tour_runs')
    .update({ status: 'abandoned', updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) {
    return NextResponse.json({ error: `abandon failed: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ abandoned: ids.length, at: new Date().toISOString() });
}
