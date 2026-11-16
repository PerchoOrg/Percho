import type { StripeEvent } from '@/lib/zod/billing';
import { describe, expect, it } from 'vitest';
import { partnershipStatusFor, periodEnd, updateForEvent } from './partnership';

const event = (type: string, object: unknown): StripeEvent => ({
  id: 'evt_1',
  type,
  created: 1_800_000_000,
  data: { object },
});
const meta = { partnership_id: 'part_1' };

describe('partnershipStatusFor', () => {
  it('holds the seat while Stripe retries a failed renewal', () => {
    expect(partnershipStatusFor('active')).toBe('active');
    expect(partnershipStatusFor('trialing')).toBe('active');
    expect(partnershipStatusFor('past_due')).toBe('past_due');
    expect(partnershipStatusFor('unpaid')).toBe('past_due');
    expect(partnershipStatusFor('incomplete')).toBe('pending');
    expect(partnershipStatusFor('canceled')).toBe('canceled');
    expect(partnershipStatusFor('incomplete_expired')).toBe('canceled');
    expect(partnershipStatusFor('something_new')).toBe('canceled');
  });
});

describe('periodEnd', () => {
  it('reads the top-level field (older API versions)', () => {
    expect(periodEnd({ id: 's', status: 'active', current_period_end: 1_800_000_000 })).toBe(
      '2027-01-15T08:00:00.000Z',
    );
  });
  it('reads the item field (API 2025-03-31 and later)', () => {
    expect(
      periodEnd({
        id: 's',
        status: 'active',
        items: { data: [{ current_period_end: 1_800_000_000 }] },
      }),
    ).toBe('2027-01-15T08:00:00.000Z');
  });
  it('is null when neither is present', () => {
    expect(periodEnd({ id: 's', status: 'active' })).toBeNull();
  });
});

describe('updateForEvent', () => {
  const session = {
    id: 'cs_1',
    mode: 'subscription',
    status: 'complete',
    payment_status: 'paid',
    subscription: 'sub_1',
    metadata: meta,
  };

  it('activates a paid checkout and releases its hold', () => {
    expect(updateForEvent(event('checkout.session.completed', session))).toEqual({
      partnershipId: 'part_1',
      patch: { stripe_subscription_id: 'sub_1', status: 'active', hold_expires_at: null },
    });
  });

  it('records but does not activate an unpaid checkout', () => {
    const u = updateForEvent(
      event('checkout.session.completed', { ...session, payment_status: 'unpaid' }),
    );
    expect(u?.patch).toEqual({ stripe_subscription_id: 'sub_1' });
  });

  it('expires an abandoned checkout only while it is still pending', () => {
    expect(
      updateForEvent(event('checkout.session.expired', { ...session, status: 'expired' })),
    ).toEqual({
      partnershipId: 'part_1',
      patch: { status: 'expired' },
      onlyFrom: 'pending',
    });
  });

  it('follows the subscription status, with its period end', () => {
    const sub = {
      id: 'sub_1',
      status: 'past_due',
      metadata: meta,
      items: { data: [{ current_period_end: 1_800_000_000 }] },
    };
    expect(updateForEvent(event('customer.subscription.updated', sub))).toEqual({
      partnershipId: 'part_1',
      patch: {
        status: 'past_due',
        stripe_subscription_id: 'sub_1',
        current_period_end: '2027-01-15T08:00:00.000Z',
        hold_expires_at: null,
      },
    });
  });

  it('cancels on deletion whatever status the object carries', () => {
    const u = updateForEvent(
      event('customer.subscription.deleted', { id: 'sub_1', status: 'active', metadata: meta }),
    );
    expect(u?.patch.status).toBe('canceled');
  });

  it('keeps the hold while the first payment is incomplete', () => {
    const u = updateForEvent(
      event('customer.subscription.created', { id: 'sub_1', status: 'incomplete', metadata: meta }),
    );
    expect(u?.patch.status).toBe('pending');
    expect(u?.patch).not.toHaveProperty('hold_expires_at');
  });

  it('ignores events that are not about a partnership', () => {
    expect(updateForEvent(event('invoice.paid', {}))).toBeNull();
    expect(
      updateForEvent(event('customer.subscription.updated', { id: 'sub_9', status: 'active' })),
    ).toBeNull();
    expect(
      updateForEvent(event('checkout.session.completed', { ...session, mode: 'payment' })),
    ).toBeNull();
    expect(updateForEvent(event('checkout.session.completed', { nonsense: true }))).toBeNull();
  });
});
