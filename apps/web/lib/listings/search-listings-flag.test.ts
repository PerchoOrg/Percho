import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `listings: false` (the communities-only iOS build, phase308) must skip the
 * listing READ, not filter its result: the point is that no listing row leaves
 * the database for that app. This fake records which tables were queried.
 */
const tables: string[] = [];
/** Every `.in()` filter, as `[column, values]`. */
const inFilters: Array<[string, unknown]> = [];

/** Every read in `search.ts` ends in `.limit()`, so that is where it resolves. */
function fakeQuery(): unknown {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'not', 'or', 'gte', 'lte', 'order']) {
    chain[m] = () => chain;
  }
  chain.in = (column: string, values: unknown) => {
    inFilters.push([column, values]);
    return chain;
  };
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
  createUncachedServiceClient: () => ({}),
}));

/** Two filmed cities, as `fetchCityFilms` keys them (by geo unit). */
const film = (slug: string, name: string) => ({
  slug,
  posterUrl: `https://videodelivery.net/${slug}/thumbnails/thumbnail.jpg?time=1s`,
  place: { name, state: 'GA', county: 'Gwinnett', lat: 34, lng: -84.1 },
});
vi.mock('@/lib/cities/detail', () => ({
  fetchCityFilms: async () =>
    new Map([
      ['city:suwanee-ga', film('suwanee-ga', 'Suwanee')],
      ['city:peachtree-corners-ga', film('peachtree-corners-ga', 'Peachtree Corners')],
    ]),
}));

vi.mock('@/lib/communities/list', () => ({
  fetchCommunityListCards: async () => [{ id: 'filmed-1' }, { id: 'filmed-2' }],
}));

const { mapEntities, searchEntities } = await import('./search');

const BOUNDS = { minLat: 33.6, maxLat: 34.1, minLng: -84.6, maxLng: -84.1 };

beforeEach(() => {
  tables.length = 0;
  inFilters.length = 0;
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

describe('searchEntities / mapEntities — only communities with a video', () => {
  it('search limits the community read to the grid set', async () => {
    await searchEntities('oak', { listings: false });
    expect(inFilters).toEqual([['id', ['filmed-1', 'filmed-2']]]);
  });

  it('the map limits the community read to the same set', async () => {
    await mapEntities(BOUNDS, { listings: false });
    expect(inFilters).toEqual([['id', ['filmed-1', 'filmed-2']]]);
  });
});

describe('searchEntities — cities (phase409)', () => {
  it('finds a filmed city by part of its name', async () => {
    const res = await searchEntities('peachtree', { listings: false });
    expect(res.cities.map((c) => c.slug)).toEqual(['peachtree-corners-ga']);
    expect(res.cities[0]?.posterUrl).toContain('thumbnail.jpg');
  });

  it('returns no city when none matches', async () => {
    const res = await searchEntities('oak', { listings: false });
    expect(res.cities).toEqual([]);
  });
});
