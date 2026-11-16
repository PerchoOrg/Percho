/**
 * POST /api/billing/portal — Stripe's hosted billing page for the signed-in
 * agent: cancel, change card, download invoices (phase341). Returns `{ url }`.
 *
 * 404 unless BILLING_ENABLED=true. The customer id is read through the
 * cookie client, so RLS ("agent reads own billing customer") is the check
 * that an agent can only open their own portal.
 */
import { billingEnabled } from '@/lib/billing/partnership';
import { stripeRequest } from '@/lib/billing/stripe';
import { createClient } from '@/lib/supabase/server';
import { StripePortalSession } from '@/lib/zod/billing';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  if (!billingEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'not_an_agent' }, { status: 403 });

  const { data: customer } = await supabase
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('agent_id', agent.id)
    .maybeSingle();
  if (!customer) return NextResponse.json({ error: 'no_billing_account' }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.percho.co';
  try {
    const session = StripePortalSession.parse(
      await stripeRequest('POST', '/billing_portal/sessions', {
        customer: customer.stripe_customer_id,
        return_url: `${appUrl}/dashboard`,
      }),
    );
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('billing portal failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 });
  }
}
