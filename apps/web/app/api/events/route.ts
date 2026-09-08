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
 */

import type { Json } from '@/lib/supabase/database.types';
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

export const ClientEvent = z.union([ClientEventListing, ClientEventCommunity]);

const Payload = z.object({
  events: z.array(ClientEvent).min(1).max(100),
});

/**
 * One validated client event as the row `events` stores.
 *
 * Exported so the mapping can be tested without a request. The two things it
 * gets right are both easy to get wrong from reading the schema:
 *
 * `?? null`, not `'listing_id' in e`. Both union members DECLARE the other key
 * — as `z.undefined().optional()` — so `in` is true for a community event that
 * sent `listing_id: undefined` explicitly, and the row went out carrying
 * `undefined` rather than `null`. The column is nullable; absent and
 * explicitly-undefined are the same to it, and this says so.
 *
 * `meta` is asserted to `Json` because zod gives `Record<string, unknown>` —
 * `z.unknown()` says nothing about serialisability — while the value came out
 * of `req.json()` and so IS json. The assertion states that provenance rather
 * than suppressing the check, which is why it sits on this one field and not on
 * the client, where it used to.
 */
export function eventRow(e: z.infer<typeof ClientEvent>) {
  return {
    event_type: e.event_type,
    listing_id: e.listing_id ?? null,
    community_id: e.community_id ?? null,
    card_id: e.card_id ?? null,
    session_id: e.session_id,
    meta: (e.meta ?? null) as Json | null,
  };
}

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

  const rows = parsed.data.events.map(eventRow);

  const supabase = createServiceClient();
  const { error } = await supabase.from('events').insert(rows);
  if (error) {
    console.error('[events] insert failed', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
