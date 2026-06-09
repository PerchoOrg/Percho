/**
 * POST /api/leads — public lead capture.
 *
 * Phase 5.2. Anon-callable (no auth). The browser POSTs from LeadModal on the
 * public listing page. Validates with `LeadCreate` zod schema, looks up the
 * listing's `agent_id` server-side (client never trusts that field), inserts
 * via the service-role client.
 *
 * RLS on `leads` permits anon INSERT (`with check (true)`) so we COULD use the
 * anon key here. We use the service role for parity with /api/events and to
 * avoid an RLS round-trip — the route handler is the trust boundary, not the
 * DB. agent_id is derived from listing_id, never from the request body, which
 * forecloses cross-listing pollution even if the schema later opens up.
 *
 * Email notification is fire-and-forget via a Postgres AFTER INSERT trigger
 * that calls the `notify-lead` Edge Function (Phase 5.3) — this route just
 * lands the row and returns. Idempotency lives in the Edge Function.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { LeadCreate } from '@/lib/zod/leads';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = LeadCreate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Look up agent_id from the listing — never trust a client-supplied agent_id.
  // Also gates against leads for non-published listings (a small abuse guard;
  // RLS would let any listing_id through since the policy is `with check
  // (true)`). draft/archived listings shouldn't accept public leads.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types — TODO(phase5-end): pnpm db:types regen
  const lookup = await (supabase as any)
    .from('listings')
    .select('id, agent_id, status')
    .eq('id', parsed.data.listing_id)
    .maybeSingle();

  if (lookup.error) {
    console.error('[leads] listing lookup failed', lookup.error.message);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
  const listing = lookup.data as { id: string; agent_id: string; status: string } | null;
  if (!listing || listing.status !== 'published') {
    return NextResponse.json({ error: 'listing_not_available' }, { status: 404 });
  }

  const row = {
    listing_id: parsed.data.listing_id,
    agent_id: listing.agent_id,
    name: parsed.data.name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    message: parsed.data.message ?? null,
    source: parsed.data.source ?? null,
  };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types — TODO(phase5-end): pnpm db:types regen
  const { data: inserted, error } = await (supabase as any)
    .from('leads')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    console.error('[leads] insert failed', error.message);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}
