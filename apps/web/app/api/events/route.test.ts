import { describe, expect, it } from 'vitest';
import { ClientEvent, eventRow } from './route';

/**
 * The row an analytics event turns into.
 *
 * This mapping used to sit inline behind `(supabase as any)`, so nothing about
 * it was checked — not the shape against the table, and not the branch below,
 * which was wrong.
 */
describe('eventRow', () => {
  const listing = {
    event_type: 'card_view' as const,
    listing_id: '11111111-1111-4111-8111-111111111111',
    session_id: 's1',
  };

  it('writes null for the id the event does not carry', () => {
    const row = eventRow(ClientEvent.parse(listing));
    expect(row.listing_id).toBe(listing.listing_id);
    expect(row.community_id).toBeNull();
  });

  it('writes null — not undefined — when the client sends the key explicitly', () => {
    // The bug this replaces. Both union members declare the other key as
    // `z.undefined().optional()`, so `'listing_id' in e` was TRUE for a
    // community event that sent `listing_id: undefined`, and the row went out
    // carrying undefined. A column that is absent and a column that is null are
    // the same to Postgres; a row that says `undefined` is neither.
    const row = eventRow(
      ClientEvent.parse({
        event_type: 'page_view',
        community_id: '22222222-2222-4222-8222-222222222222',
        listing_id: undefined,
        session_id: 's2',
      }),
    );
    expect(row.listing_id).toBeNull();
    expect(Object.hasOwn(row, 'listing_id')).toBe(true);
    expect(row.community_id).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('nulls the optional fields rather than omitting them', () => {
    const row = eventRow(ClientEvent.parse(listing));
    expect(row.card_id).toBeNull();
    expect(row.meta).toBeNull();
  });

  it('keeps meta as it arrived', () => {
    const row = eventRow(ClientEvent.parse({ ...listing, meta: { position: 3, source: 'feed' } }));
    expect(row.meta).toEqual({ position: 3, source: 'feed' });
  });

  it('refuses an event carrying both ids', () => {
    // The union exists to make "exactly one of" enforceable; a row with both
    // would be counted twice in every per-entity report.
    expect(
      ClientEvent.safeParse({
        event_type: 'card_view',
        listing_id: '11111111-1111-4111-8111-111111111111',
        community_id: '22222222-2222-4222-8222-222222222222',
        session_id: 's3',
      }).success,
    ).toBe(false);
  });
});
