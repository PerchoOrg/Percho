/**
 * Community Partner plan — the rules, without I/O.
 *
 * An agent pays monthly (Stripe subscription) to hold one of a community's
 * partner seats. A seat is held from the moment checkout opens (`pending`)
 * so two agents cannot pay for the last one; an abandoned checkout releases
 * it. After payment, Stripe's webhook events are the only thing that moves a
 * partnership between states — this module turns one event into the update
 * to apply. Not shown anywhere in the product yet (phase341).
 */
import { StripeCheckoutSession, type StripeEvent, StripeSubscription } from '@/lib/zod/billing';

/** Partner seats per community (owner default, phase341). */
export const SEATS_PER_COMMUNITY = 2;

/** Stripe's minimum checkout lifetime is 30 minutes. */
export const CHECKOUT_TTL_MIN = 30;
/** The seat outlives the checkout by a margin, so a payment completed in the
 * checkout's last minute still finds its seat held when the webhook lands. */
export const SEAT_HOLD_MIN = CHECKOUT_TTL_MIN + 10;

export type PartnershipStatus = 'pending' | 'active' | 'past_due' | 'canceled' | 'expired';

/** `BILLING_ENABLED=true` opens checkout and the portal. Off by default. */
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === 'true';
}

/** Stripe subscription status → partnership status. A seat stays held while
 * Stripe retries a failed renewal (`past_due`, `unpaid`, `paused`). */
export function partnershipStatusFor(stripeStatus: string): PartnershipStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'incomplete':
      return 'pending';
    default:
      // canceled, incomplete_expired, and anything Stripe adds later.
      return 'canceled';
  }
}

/** When the paid period ends, as ISO — wherever this API version put it. */
export function periodEnd(sub: StripeSubscription): string | null {
  const sec = sub.current_period_end ?? sub.items?.data[0]?.current_period_end ?? null;
  return sec ? new Date(sec * 1000).toISOString() : null;
}

export interface PartnershipUpdate {
  partnershipId: string;
  patch: {
    status?: PartnershipStatus;
    stripe_subscription_id?: string;
    current_period_end?: string | null;
    hold_expires_at?: null;
  };
  /** Apply only while the row is in this state. */
  onlyFrom?: PartnershipStatus;
}

/**
 * The update one Stripe event implies, or null when the event is not about a
 * partnership. Rows are found by the `partnership_id` metadata the checkout
 * route stamps on both the session and the subscription, so events can be
 * applied in any order.
 */
export function updateForEvent(event: StripeEvent): PartnershipUpdate | null {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = StripeCheckoutSession.safeParse(event.data.object);
      const id = s.success ? s.data.metadata?.partnership_id : undefined;
      if (!s.success || !id || s.data.mode !== 'subscription') return null;
      const paid =
        s.data.payment_status === 'paid' || s.data.payment_status === 'no_payment_required';
      return {
        partnershipId: id,
        patch: {
          ...(s.data.subscription ? { stripe_subscription_id: s.data.subscription } : {}),
          ...(paid ? { status: 'active' as const, hold_expires_at: null } : {}),
        },
      };
    }
    case 'checkout.session.expired': {
      const s = StripeCheckoutSession.safeParse(event.data.object);
      const id = s.success ? s.data.metadata?.partnership_id : undefined;
      if (!id) return null;
      return { partnershipId: id, patch: { status: 'expired' }, onlyFrom: 'pending' };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const s = StripeSubscription.safeParse(event.data.object);
      const id = s.success ? s.data.metadata?.partnership_id : undefined;
      if (!s.success || !id) return null;
      const status =
        event.type === 'customer.subscription.deleted'
          ? 'canceled'
          : partnershipStatusFor(s.data.status);
      return {
        partnershipId: id,
        patch: {
          status,
          stripe_subscription_id: s.data.id,
          current_period_end: periodEnd(s.data),
          ...(status === 'pending' ? {} : { hold_expires_at: null }),
        },
      };
    }
    default:
      return null;
  }
}
