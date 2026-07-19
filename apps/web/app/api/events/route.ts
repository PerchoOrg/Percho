/**
 * POST /api/events — bulk insert behavioral events from the public feed.
 *
 * History:
 *   - Phase 3.7: anon-callable batch insert. Listing-only.
 *   - Phase 50 (2026-06-22): events now attribute to either a listing
 *     or a community. The schema was widened in migration 0035 (one of
 *     listing_id / community_id, never both, never neither). Validation
 *     here mirrors the DB check for fast-fail.
 *
 * Service-role client used because the anon RLS policy permits inserts
 * but the bulk insert is faster server-side without RLS round-trips.
 * The route is intentionally minimal: no rate limiting (Phase 6), no
 * PII fields (CLAUDE.md §3.6).
 */

import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

// Either listing_id OR community_id must be present, never both. zod
// has no native "exactly one of" so we union two strict shapes.
const ClientEventBase = z.object({
  event_type: z.enum(['page_view', 'card_view', 'video_complete']),
  card_id: z.string().max(80).optional(),
  session_id: z.string().min(1).max(80),
  meta: z.record(z.unknown()).optional(),
});

const ClientEventListing = ClientEventBase.extend({
  listing_id: z.string().uuid(),
  community_id: z.undefined().optional(),
});

const ClientEventCommunity = ClientEventBase.extend({
  community_id: z.string().uuid(),
  listing_id: z.undefined().optional(),
});

const ClientEvent = z.union([ClientEventListing, ClientEventCommunity]);

const Payload = z.object({
  events: z.array(ClientEvent).min(1).max(100),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = Payload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const rows = parsed.data.events.map((e) => ({
    event_type: e.event_type,
    listing_id: 'listing_id' in e ? e.listing_id : null,
    community_id: 'community_id' in e ? e.community_id : null,
    card_id: e.card_id ?? null,
    session_id: e.session_id,
    meta: e.meta ?? null,
  }));

  const supabase = createServiceClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any).from('events').insert(rows);
  if (error) {
    console.error('[events] insert failed', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
