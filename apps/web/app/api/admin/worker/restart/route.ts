/**
 * POST /api/admin/worker/restart — `launchctl kickstart -k` one agent.
 *
 * The one write in the hub. It exists because a long-lived worker keeps
 * running the code it booted with: merging a fix to `worker.py` changes
 * nothing until the process restarts, which has bitten this project twice
 * (DEVLOG 2026-08-18). The hub shows that state, so it should also be able to
 * clear it.
 *
 * Restarting mid-render loses that render. The claimed row stays `processing`
 * until it is requeued by hand — the UI says so before it asks.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { findManaged, isWorkerHost, restartAgent } from '@/lib/worker-hub/host';
import { WorkerRestartBody } from '@/lib/zod/worker-hub';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (!isWorkerHost()) {
    return NextResponse.json({ error: 'not the worker host' }, { status: 409 });
  }

  const parsed = WorkerRestartBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'bad request' },
      { status: 400 },
    );
  }

  const spec = findManaged(parsed.data.id);
  if (!spec) return NextResponse.json({ error: 'unknown agent' }, { status: 400 });

  try {
    await restartAgent(spec);
    return NextResponse.json({ ok: true, label: spec.label, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'restart failed' },
      { status: 500 },
    );
  }
}
