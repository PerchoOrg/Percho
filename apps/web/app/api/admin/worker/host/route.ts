/**
 * GET /api/admin/worker/host — launchd agents + machine health.
 *
 * Returns `{ available: false }` off the worker box instead of failing: the
 * hub is served from Vercel too, where there is no launchd and no log file,
 * and the queue panels still have something to say there.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { isWorkerHost, loadProcesses, loadSystem } from '@/lib/worker-hub/host';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (!isWorkerHost()) {
    return NextResponse.json({
      available: false,
      reason: 'Not the worker host — the workers are launchd agents on the Mac mini.',
    });
  }

  try {
    const [processes, system] = await Promise.all([loadProcesses(), loadSystem()]);
    return NextResponse.json({ available: true, processes, system, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { available: false, reason: e instanceof Error ? e.message : 'host read failed' },
      { status: 500 },
    );
  }
}
