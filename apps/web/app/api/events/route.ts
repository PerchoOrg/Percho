/**
 * POST /api/events — bulk insert behavioral events from the public feed.
 *
 * Anon-callable batch insert. Events attribute to either a listing or a
 * community. The schema (migration 0035) enforces exactly one of
 * listing_id / community_id — validation here mirrors that DB check for
 * fast-fail.
 *
 * Service-role client used because the anon RLS policy permits inserts
 * but the bulk insert is faster server-side without RLS round-trips.
 * The route is intentionally minimal: no rate limiting, no
 * PII fields (CLAUDE.md §3.6).
 *
 * The zod model + row mapper live in `lib/analytics/events.ts`, not here:
 * a route file may only export HTTP methods / route config, and the model
 * is exported for tests.
 */

import { ClientEventPayload, eventRow } from '@/lib/analytics/events';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = ClientEventPayload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const rows = parsed.data.events.map(eventRow);

  const supabase = createServiceClient();
  const { error } = await supabase.from('events').insert(rows);
  if (error) {
    console.error('[events] insert failed', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
