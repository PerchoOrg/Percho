import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `listings: false` (the communities-only iOS build, phase308) must skip the
 * listing READ, not filter its result: the point is that no listing row leaves
 * the database for that app. This fake records which tables were queried.
 */
const tables: string[] = [];

/** Every read in `search.ts` ends in `.limit()`, so that is where it resolves. */
function fakeQuery(): unknown {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'not', 'or', 'gte', 'lte', 'order', 'in']) {
    chain[m] = () => chain;
  }
  chain.limit = () => Promise.resolve({ data: [], error: null });
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createUncachedAnonClient: () => ({
    from: (table: string) => {
      tables.push(table);
      return fakeQuery();
    },
  }),
}));

const { mapEntities, searchEntities } = await import('./search');

const BOUNDS = { minLat: 33.6, maxLat: 34.1, minLng: -84.6, maxLng: -84.1 };

beforeEach(() => {
  tables.length = 0;
});

describe('searchEntities / mapEntities — the listings option', () => {
  it('reads listings and communities by default', async () => {
    await searchEntities('oak');
    expect(tables.sort()).toEqual(['communities', 'listings']);
  });

  it('search with listings off never touches the listings table', async () => {
    const res = await searchEntities('oak', { listings: false });
    expect(tables).toEqual(['communities']);
    expect(res.listings).toEqual([]);
  });

  it('the map with listings off never touches the listings table', async () => {
    const res = await mapEntities(BOUNDS, { listings: false });
    expect(tables).toEqual(['communities']);
    expect(res.listings).toEqual([]);
  });

  it('the map still reads both by default', async () => {
    await mapEntities(BOUNDS);
    expect(tables.sort()).toEqual(['communities', 'listings']);
  });
});
