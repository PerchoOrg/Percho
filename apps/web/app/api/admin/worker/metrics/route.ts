/**
 * GET /api/admin/worker/metrics — every queue, recent transitions, paid spend.
 *
 * Reads Supabase only, so unlike the host endpoint it works from anywhere.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { loadActivity, loadSpend } from '@/lib/worker-hub/activity';
import { loadQueues } from '@/lib/worker-hub/queues';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const [queues, activity, spend] = await Promise.all([
      loadQueues(),
      loadActivity(),
      loadSpend(),
    ]);
    return NextResponse.json({ queues, activity, spend, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'metrics read failed' },
      { status: 500 },
    );
  }
}
