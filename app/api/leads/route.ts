/**
 * POST /api/leads — public lead capture.
 *
 * . Anon-callable (no auth). The browser POSTs from LeadModal on the
 * public listing page. Validates with `LeadCreate` zod schema, looks up the
 * listing's `agent_id` server-side (client never trusts that field), inserts
 * via the service-role client.
 *
 * also accepts community_id for direct
 * "/c/[slug]/feed" leads (Contact button → community owner). Owner rule:
 * "if exploring community directly, contact community owner". Lookup
 * pivots on which target id is present; agent_id is always derived
 * server-side, never trusted from the client.
 *
 * RLS on `leads` permits anon INSERT (`with check (true)`) so we COULD use the
 * anon key here. We use the service role for parity with /api/events and to
 * avoid an RLS round-trip — the route handler is the trust boundary, not the
 * DB. agent_id is derived from listing_id, never from the request body, which
 * forecloses cross-listing pollution even if the schema later opens up.
 *
 * Email notification is fire-and-forget via a Postgres AFTER INSERT trigger
 * that calls the `notify-lead` Edge Function — this route just
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

  let listingId: string | null = null;
  let communityId: string | null = null;
  let agentId: string;

  if (parsed.data.listing_id) {
    // Listing-targeted lead: agent_id from listing.agent_id, gate by
    // status='active' (small abuse guard since RLS is `with check (true)`).
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
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
    if (!listing || listing.status !== 'active') {
      return NextResponse.json({ error: 'listing_not_available' }, { status: 404 });
    }
    listingId = listing.id;
    agentId = listing.agent_id;
  } else if (parsed.data.community_id) {
    // Community-targeted lead: agent_id from communities.created_by.
    // Communities without an owner (legacy / unowned) cannot accept leads —
    // there's nobody to route the message to.
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const lookup = await (supabase as any)
      .from('communities')
      .select('id, created_by')
      .eq('id', parsed.data.community_id)
      .maybeSingle();

    if (lookup.error) {
      console.error('[leads] community lookup failed', lookup.error.message);
      return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
    const community = lookup.data as { id: string; created_by: string | null } | null;
    if (!community || !community.created_by) {
      return NextResponse.json({ error: 'community_not_available' }, { status: 404 });
    }
    communityId = community.id;
    agentId = community.created_by;
  } else {
    // Schema refine should have caught this, defensive only.
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const row = {
    listing_id: listingId,
    community_id: communityId,
    agent_id: agentId,
    name: parsed.data.name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    message: parsed.data.message ?? null,
    source: parsed.data.source ?? null,
  };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
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
