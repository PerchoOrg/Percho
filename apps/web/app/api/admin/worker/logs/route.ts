/**
 * GET /api/admin/worker/logs?source=<agent id>&q=&noise=&limit=
 *
 * Tails one agent's log. The path comes from that agent's plist, never from
 * the request — `source` only selects a row of `MANAGED`.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { findManaged, isWorkerHost, loadProcesses, tailLog } from '@/lib/worker-hub/host';
import { WorkerLogQuery } from '@/lib/zod/worker-hub';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (!isWorkerHost()) {
    return NextResponse.json({ available: false, reason: 'Not the worker host.' });
  }

  const { searchParams } = new URL(req.url);
  const parsed = WorkerLogQuery.safeParse({
    source: searchParams.get('source') ?? '',
    q: searchParams.get('q') ?? undefined,
    noise: searchParams.get('noise') ?? '1',
    limit: searchParams.get('limit') ?? 300,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'bad request' },
      { status: 400 },
    );
  }

  const spec = findManaged(parsed.data.source);
  if (!spec) return NextResponse.json({ error: 'unknown agent' }, { status: 400 });

  const proc = (await loadProcesses()).find((p) => p.id === spec.id);
  if (!proc?.logPath) {
    return NextResponse.json({ available: false, reason: `${spec.name} is not installed here.` });
  }

  try {
    const tail = await tailLog(proc.logPath, {
      query: parsed.data.q,
      hideNoise: parsed.data.noise === '1',
      limit: parsed.data.limit,
    });
    return NextResponse.json({ available: true, ...tail });
  } catch (e) {
    return NextResponse.json(
      { available: false, reason: e instanceof Error ? e.message : 'log read failed' },
      { status: 500 },
    );
  }
}
