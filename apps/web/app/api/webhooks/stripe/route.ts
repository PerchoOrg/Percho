/**
 * POST /api/webhooks/stripe — the only writer of a community partnership's
 * status (phase341).
 *
 * Signature is verified against STRIPE_WEBHOOK_SECRET over the raw body
 * BEFORE anything is parsed or written; only then is the service-role client
 * used. Each event is turned into one row update by `updateForEvent`. Stripe
 * retries and may reorder deliveries, so the update applies only when the
 * event is at least as new as the last one applied (`last_event_at`) — a
 * replayed or late event changes nothing.
 *
 * Subscribe the endpoint to: checkout.session.completed,
 * checkout.session.expired, customer.subscription.created / updated / deleted.
 * Runs whether or not BILLING_ENABLED is set: a subscription that exists must
 * keep its state even while checkout is switched off.
 */
import { updateForEvent } from '@/lib/billing/partnership';
import { verifyStripeSignature } from '@/lib/billing/stripe';
import { createServiceClient } from '@/lib/supabase/server';
import { StripeEvent } from '@/lib/zod/billing';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('stripe webhook: STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const rawBody = await req.text();
  const valid = await verifyStripeSignature({
    rawBody,
    signatureHeader: req.headers.get('stripe-signature'),
    secret,
  });
  if (!valid) return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const event = StripeEvent.safeParse(json);
  if (!event.success)
    return NextResponse.json({ ok: false, error: 'invalid event' }, { status: 400 });

  const update = updateForEvent(event.data);
  if (!update) return NextResponse.json({ ok: true, ignored: event.data.type });

  const eventAt = new Date(event.data.created * 1000).toISOString();
  let query = createServiceClient()
    .from('community_partnerships')
    .update({ ...update.patch, last_event_at: eventAt })
    .eq('id', update.partnershipId)
    .or(`last_event_at.is.null,last_event_at.lte."${eventAt}"`);
  if (update.onlyFrom) query = query.eq('status', update.onlyFrom);

  const { error } = await query;
  if (error) {
    // 500 makes Stripe retry, which is what a transient failure wants.
    console.error('stripe webhook: partnership update failed', event.data.id, error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
