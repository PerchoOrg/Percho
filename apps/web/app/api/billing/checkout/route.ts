/**
 * POST /api/billing/checkout — an agent starts paying for a community's
 * partner seat (phase341). Body: `{ community_id }`. Returns `{ url }`, the
 * Stripe Checkout page to send the agent to.
 *
 * 404 unless BILLING_ENABLED=true; nothing in the product calls this yet.
 *
 * Order matters: the agent is authenticated through the cookie client first;
 * only then is the service-role client used (CLAUDE.md §3.7) — to hold the
 * seat through `claim_partner_seat`, which no browser may execute, and to
 * record the Stripe ids, which no browser may write. Errors:
 *   409 full | already_partner | checkout_in_progress, 404 community, 502 stripe.
 */
import {
  CHECKOUT_TTL_MIN,
  SEATS_PER_COMMUNITY,
  SEAT_HOLD_MIN,
  billingEnabled,
} from '@/lib/billing/partnership';
import { stripeRequest } from '@/lib/billing/stripe';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { CheckoutRequest, StripeCheckoutSession, StripeCustomer } from '@/lib/zod/billing';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ServiceClient = ReturnType<typeof createServiceClient>;

export async function POST(req: Request) {
  if (!billingEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const price = process.env.STRIPE_PRICE_COMMUNITY_PARTNER;
  if (!price) {
    console.error('billing checkout: STRIPE_PRICE_COMMUNITY_PARTNER not set');
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, email')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'not_an_agent' }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const body = CheckoutRequest.safeParse(json);
  if (!body.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const communityId = body.data.community_id;

  const service = createServiceClient();
  const { data: community } = await service
    .from('communities')
    .select('id, slug')
    .eq('id', communityId)
    .eq('status', 'active')
    .maybeSingle();
  if (!community) return NextResponse.json({ error: 'community_not_found' }, { status: 404 });

  const now = Date.now();
  const { data: claim, error: claimError } = await service
    .rpc('claim_partner_seat', {
      p_agent_id: agent.id,
      p_community_id: community.id,
      p_seats: SEATS_PER_COMMUNITY,
      p_hold_until: new Date(now + SEAT_HOLD_MIN * 60_000).toISOString(),
    })
    .single();
  if (claimError || !claim) {
    console.error('billing checkout: claim_partner_seat failed', claimError?.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (claim.reason === 'full' || claim.reason === 'already_partner') {
    return NextResponse.json({ error: claim.reason }, { status: 409 });
  }
  const partnershipId = claim.partnership_id;
  if (!partnershipId) return NextResponse.json({ error: 'db_error' }, { status: 500 });

  try {
    if (claim.reason === 'pending') {
      const resumed = await resumeCheckout(service, partnershipId);
      if (resumed === 'in_progress') {
        return NextResponse.json({ error: 'checkout_in_progress' }, { status: 409 });
      }
      if (resumed) return NextResponse.json({ url: resumed });
      // No session was ever recorded for this hold — create one below.
    }

    const customerId = await customerFor(service, agent);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.percho.co';
    const metadata = {
      partnership_id: partnershipId,
      community_id: community.id,
      agent_id: agent.id,
    };
    const session = StripeCheckoutSession.parse(
      await stripeRequest(
        'POST',
        '/checkout/sessions',
        {
          mode: 'subscription',
          customer: customerId,
          client_reference_id: partnershipId,
          line_items: [{ price, quantity: 1 }],
          success_url: `${appUrl}/dashboard?billing=success`,
          cancel_url: `${appUrl}/dashboard?billing=canceled`,
          expires_at: Math.floor(now / 1000) + CHECKOUT_TTL_MIN * 60,
          metadata,
          subscription_data: { metadata },
        },
        // No idempotency key: `expires_at` differs on every call, and Stripe
        // refuses a reused key with different parameters. A session orphaned
        // by a crash here simply expires.
      ),
    );

    const { error } = await service
      .from('community_partnerships')
      .update({ stripe_checkout_id: session.id })
      .eq('id', partnershipId);
    if (error) throw new Error(`record checkout id: ${error.message}`);
    if (!session.url) throw new Error('checkout session has no url');
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(
      'billing checkout failed',
      partnershipId,
      err instanceof Error ? err.message : err,
    );
    // Release the seat; a retry holds a fresh one.
    await service
      .from('community_partnerships')
      .update({ status: 'expired' })
      .eq('id', partnershipId)
      .eq('status', 'pending');
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 });
  }
}

/**
 * The agent already holds this seat with an open checkout: hand back the same
 * Stripe page. Null when no session was recorded; 'in_progress' when the
 * session is no longer open (paid, and the webhook has not landed yet).
 */
async function resumeCheckout(
  service: ServiceClient,
  partnershipId: string,
): Promise<string | 'in_progress' | null> {
  const { data } = await service
    .from('community_partnerships')
    .select('stripe_checkout_id')
    .eq('id', partnershipId)
    .maybeSingle();
  if (!data?.stripe_checkout_id) return null;
  const session = StripeCheckoutSession.parse(
    await stripeRequest('GET', `/checkout/sessions/${encodeURIComponent(data.stripe_checkout_id)}`),
  );
  return session.status === 'open' && session.url ? session.url : 'in_progress';
}

/** The agent's Stripe customer, created on first checkout. */
async function customerFor(
  service: ServiceClient,
  agent: { id: string; name: string; email: string },
): Promise<string> {
  const read = () =>
    service
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('agent_id', agent.id)
      .maybeSingle();

  const existing = await read();
  if (existing.data) return existing.data.stripe_customer_id;

  // The idempotency key makes two concurrent first checkouts get one customer.
  const customer = StripeCustomer.parse(
    await stripeRequest(
      'POST',
      '/customers',
      { email: agent.email, name: agent.name, metadata: { agent_id: agent.id } },
      { idempotencyKey: `customer-${agent.id}` },
    ),
  );
  await service
    .from('billing_customers')
    .upsert(
      { agent_id: agent.id, stripe_customer_id: customer.id },
      { onConflict: 'agent_id', ignoreDuplicates: true },
    );
  const saved = await read();
  if (!saved.data) throw new Error('billing customer not saved');
  return saved.data.stripe_customer_id;
}
