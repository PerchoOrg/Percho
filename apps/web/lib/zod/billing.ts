/**
 * Billing payloads: what an agent sends to start a checkout, and the parts
 * of Stripe's webhook events the partnership state machine reads. Stripe
 * objects carry far more fields; only these are trusted, and only after the
 * webhook signature has been checked.
 */
import { z } from 'zod';

export const CheckoutRequest = z.object({
  community_id: z.string().uuid(),
});

const Metadata = z.record(z.string()).nullish();

export const StripeEvent = z.object({
  id: z.string(),
  type: z.string(),
  // Unix seconds.
  created: z.number().int(),
  data: z.object({ object: z.unknown() }),
});
export type StripeEvent = z.infer<typeof StripeEvent>;

export const StripeCheckoutSession = z.object({
  id: z.string(),
  mode: z.string(),
  status: z.string().nullish(),
  payment_status: z.string(),
  subscription: z.string().nullish(),
  url: z.string().nullish(),
  metadata: Metadata,
});
export type StripeCheckoutSession = z.infer<typeof StripeCheckoutSession>;

export const StripeSubscription = z.object({
  id: z.string(),
  status: z.string(),
  metadata: Metadata,
  // Top-level before Stripe API 2025-03-31, on each item since; read both.
  current_period_end: z.number().int().nullish(),
  items: z
    .object({ data: z.array(z.object({ current_period_end: z.number().int().nullish() })) })
    .nullish(),
});
export type StripeSubscription = z.infer<typeof StripeSubscription>;

export const StripeCustomer = z.object({ id: z.string() });
export const StripePortalSession = z.object({ url: z.string() });
