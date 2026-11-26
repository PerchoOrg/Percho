import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The listing page's place filter (phase404). A focused pool must be narrowed
 * IN THE QUERY: filtering a newest-first page afterwards returns whichever of
 * its twelve rows happen to be in the place, which for one subdivision out of
 * a metro's listings is none. This fake records the filters each table got.
 */
const eqFilters: Array<[table: string, column: string, value: unknown]> = [];

/** The listing reads resolve at `.range()`; the video-id read is awaited at `.or()`. */
function fakeQuery(table: string): unknown {
  const rows = table === 'listing_videos' ? [{ listing_id: 'l-1' }] : [];
  const chain: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: supabase-js query builders are thenables; the fake has to be one too.
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
  };
  for (const m of ['select', 'in', 'or', 'order', 'range']) chain[m] = () => chain;
  chain.eq = (column: string, value: unknown) => {
    eqFilters.push([table, column, value]);
    return chain;
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (table: string) => fakeQuery(table) }),
}));

const { fetchBrowseCards, fetchBrowseCardsVideosOnly } = await import('./browse-cards');

const listingFilters = () =>
  eqFilters.filter(([table]) => table === 'listings').map(([, column, value]) => [column, value]);

beforeEach(() => {
  eqFilters.length = 0;
});

describe.each([
  ['fetchBrowseCards', fetchBrowseCards],
  ['fetchBrowseCardsVideosOnly', fetchBrowseCardsVideosOnly],
])('%s — the place filter', (_name, read) => {
  it('reads every active listing without one', async () => {
    await read(0, 12);
    expect(listingFilters()).toEqual([['status', 'active']]);
  });

  it('narrows to a city by the listing’s own city and state', async () => {
    await read(0, 12, { city: 'Suwanee', state: 'GA' });
    expect(listingFilters()).toEqual([
      ['status', 'active'],
      ['city', 'Suwanee'],
      ['state', 'GA'],
    ]);
  });

  it('narrows to a community by id', async () => {
    await read(0, 12, { communityId: 'c-edinburgh' });
    expect(listingFilters()).toEqual([
      ['status', 'active'],
      ['community_id', 'c-edinburgh'],
    ]);
  });
});
