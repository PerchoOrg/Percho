/**
 * POST /api/mobile/events — the mobile telemetry queue's drain target.
 *
 *   body: { installId, events: [{ type, seq, at, listingId?, ...payload }] }
 *   → 200 { accepted } | 400 | 429 | 500
 *
 * The client transport contract (`state/event-queue.ts`): a batch may be
 * re-sent whenever an ack was lost, so acceptance must be idempotent — the
 * insert ignores (install_id, seq) duplicates and re-sending is always safe.
 *
 * Attribution: if the app sends its session token, events are stamped with
 * the user id; without one they stay anonymous. A bad token does NOT reject
 * the batch — telemetry must not be lost to an expired session.
 *
 * Rate limiting is in-memory per serverless instance — a soft ceiling
 * against a runaway client or a naive script, not a security boundary (same
 * posture as `lib/ai/rate-limit.ts`'s "soft ceiling against UI spam").
 * Honest drains are ~1 request per app-foreground, far under the cap.
 */

import type { Json } from '@/lib/supabase/database.types';
import { createAnonClient, createServiceClient } from '@/lib/supabase/server';
import { mobileEventsPayloadSchema } from '@/lib/zod/mobile-events';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const RATE_LIMIT_PER_MIN = 12;
const recentByInstall = new Map<string, number[]>();

function rateLimited(installId: string, now: number): boolean {
  const cutoff = now - 60_000;
  const stamps = (recentByInstall.get(installId) ?? []).filter((t) => t > cutoff);
  if (stamps.length >= RATE_LIMIT_PER_MIN) {
    recentByInstall.set(installId, stamps);
    return true;
  }
  stamps.push(now);
  recentByInstall.set(installId, stamps);
  // Unbounded growth guard: this map lives for the instance's lifetime.
  if (recentByInstall.size > 10_000) recentByInstall.clear();
  return false;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = mobileEventsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  if (rateLimited(parsed.data.installId, Date.now())) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let userId: string | null = null;
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const { data } = await createAnonClient().auth.getUser(authHeader.slice('Bearer '.length));
    userId = data.user?.id ?? null;
  }

  const rows = parsed.data.events.map((e) => ({
    install_id: parsed.data.installId,
    user_id: userId,
    type: e.type,
    seq: e.seq,
    at: new Date(e.at).toISOString(),
    listing_id: e.listingId ?? null,
    // Parsed from JSON, so JSON-serializable by construction; zod's
    // passthrough output type just can't say so.
    payload: e as unknown as Json,
  }));

  const { error } = await createServiceClient()
    .from('mobile_events')
    .upsert(rows, { onConflict: 'install_id,seq', ignoreDuplicates: true });

  if (error) {
    console.error('[mobile-events] insert failed', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ accepted: rows.length });
}
