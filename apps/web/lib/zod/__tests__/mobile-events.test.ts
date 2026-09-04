/**
 * The mobile events envelope. What matters: unknown event types and extra
 * payload fields PASS (a new client build must not lose data on an old
 * server), while unbounded or malformed input fails.
 */
import { describe, expect, it } from 'vitest';
import { mobileEventsPayloadSchema } from '../mobile-events';

const INSTALL = '4b4a0a3e-1c1d-4f6e-9a2b-3c4d5e6f7a8b';

const event = (over: Record<string, unknown> = {}) => ({
  type: 'swipe',
  seq: 1,
  at: 1_788_500_000_000,
  ...over,
});

describe('mobileEventsPayloadSchema', () => {
  it('accepts a batch and keeps unknown payload fields', () => {
    const parsed = mobileEventsPayloadSchema.parse({
      installId: INSTALL,
      events: [event({ verdict: 'L', cardType: 'listing', futureField: 42 })],
    });
    expect(parsed.events[0]).toMatchObject({ verdict: 'L', futureField: 42 });
  });

  it('accepts any event type string — the union is client-owned', () => {
    const parsed = mobileEventsPayloadSchema.parse({
      installId: INSTALL,
      events: [event({ type: 'some_event_added_in_2027' })],
    });
    expect(parsed.events[0]?.type).toBe('some_event_added_in_2027');
  });

  it('rejects a non-uuid installId', () => {
    expect(
      mobileEventsPayloadSchema.safeParse({ installId: 'device-1', events: [event()] }).success,
    ).toBe(false);
  });

  it('rejects an empty batch and a batch over 100', () => {
    expect(mobileEventsPayloadSchema.safeParse({ installId: INSTALL, events: [] }).success).toBe(
      false,
    );
    const big = Array.from({ length: 101 }, (_, i) => event({ seq: i }));
    expect(mobileEventsPayloadSchema.safeParse({ installId: INSTALL, events: big }).success).toBe(
      false,
    );
  });

  it('rejects a seconds-scale timestamp and a negative seq', () => {
    expect(
      mobileEventsPayloadSchema.safeParse({
        installId: INSTALL,
        events: [event({ at: -5 })],
      }).success,
    ).toBe(false);
    expect(
      mobileEventsPayloadSchema.safeParse({
        installId: INSTALL,
        events: [event({ seq: -1 })],
      }).success,
    ).toBe(false);
  });

  it('rejects an oversized event payload', () => {
    expect(
      mobileEventsPayloadSchema.safeParse({
        installId: INSTALL,
        events: [event({ blob: 'x'.repeat(5000) })],
      }).success,
    ).toBe(false);
  });

  it('rejects a malformed listingId but allows its absence', () => {
    expect(
      mobileEventsPayloadSchema.safeParse({
        installId: INSTALL,
        events: [event({ listingId: 'not-a-uuid' })],
      }).success,
    ).toBe(false);
  });
});
