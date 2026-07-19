/**
 * POST /api/agents/waitlist — public agent waitlist capture.
 *
 * Backs the /agents landing page (KW Atlanta meetup, 2026-07). Anonymously
 * callable. Zod-validates, rate-limits by IP (in-memory Map, 10/min), inserts
 * into `agent_waitlist_signups` via the service-role client. Returns 409 on
 * duplicate email.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const WaitlistCreate = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().trim().email('Enter a valid email').max(320),
  phone: z.string().trim().min(7, 'Phone is required').max(40),
  brokerage: z.string().trim().min(1, 'Brokerage is required').max(200),
  license_number: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  mls_association: z.enum(['FMLS', 'GAMLS', 'Both', 'Other']),
});

// In-memory rate limiter: 10 submissions / 60s per IP. MVP only — resets
// on process restart, does not survive across serverless instances.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const hits = (rateHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  rateHits.set(ip, hits);
  return false;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Too many submissions. Try again in a minute.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = WaitlistCreate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const userAgent = req.headers.get('user-agent') ?? null;

  // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
  const { error } = await (supabase as any).from('agent_waitlist_signups').insert({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    phone: parsed.data.phone,
    brokerage: parsed.data.brokerage,
    license_number: parsed.data.license_number ?? null,
    mls_association: parsed.data.mls_association,
    user_agent: userAgent,
    ip_address: ip,
  });

  if (error) {
    // Postgres unique_violation
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { ok: false, error: 'This email is already on the waitlist.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
