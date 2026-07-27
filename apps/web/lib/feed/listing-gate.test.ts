/**
 * §0.2 listing hard gate — server side.
 *
 * This is the product's core promise ("no listings before the buyer has told us
 * anything") enforced a second time, so these tests are deliberately blunt
 * about the stage boundaries. The client has the mirror of this in
 * `apps/mobile/lib/feed/generate-feed.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { type PoolListingDTO, gateListings } from './listing-gate';

const listing = (id: string, communityId?: string, city?: string): PoolListingDTO => ({
  id,
  slug: id,
  address: `${id} Main St`,
  priceLabel: '$450K',
  bedBathSqft: '3 bd · 2 ba',
  heroUrl: `https://example.com/${id}.jpg`,
  ...(communityId ? { communityId } : {}),
  ...(city ? { city } : {}),
});

const twelve = Array.from({ length: 12 }, (_, i) => listing(`l${i + 1}`));

describe('stage 0 — nothing, full stop', () => {
  it('returns zero listings even with a full pool', () => {
    expect(gateListings(twelve, 0, 12, [])).toEqual([]);
  });

  it('returns zero even when liked communities are supplied', () => {
    expect(gateListings(twelve, 0, 12, [{ id: 'c1' }])).toEqual([]);
  });
});

describe('stages 1–2 — the 1-per-10 tease rate (§1.7)', () => {
  it('caps at ceil(limit/10) for a 12-card page', () => {
    const out = gateListings(twelve, 1, 12, []);
    expect(out).toHaveLength(2);
    expect(gateListings(twelve, 2, 12, [])).toHaveLength(2);
  });

  it('caps at 1 for a 10-card page', () => {
    expect(gateListings(twelve, 1, 10, [])).toHaveLength(1);
  });

  // The badge is suppressed off this flag: a tease score is not yet
  // trustworthy, so showing a match % would be a lie.
  it('tags every returned listing as a tease', () => {
    for (const l of gateListings(twelve, 2, 12, [])) {
      expect(l.tease).toBe(true);
      expect(l.preview).toBeUndefined();
    }
  });

  it('never exceeds the available pool', () => {
    expect(gateListings([listing('only')], 1, 40, [])).toHaveLength(1);
  });
});

describe('stage 3 — previews tied to liked communities', () => {
  const pool = [
    listing('a', 'waterside'),
    listing('b', 'abernathy'),
    listing('c'),
    listing('d', 'waterside'),
  ];

  it('returns only listings in a liked community', () => {
    const out = gateListings(pool, 3, 12, [{ id: 'waterside' }]);
    expect(out.map((l) => l.id)).toEqual(['a', 'd']);
  });

  // The dangerous failure mode: treating "no liked communities" as "no filter"
  // would dump the entire unlocked pool on a stage-3 buyer.
  it('returns nothing when the buyer has liked no communities', () => {
    expect(gateListings(pool, 3, 12, [])).toEqual([]);
  });

  it('drops listings with no community and no matching city', () => {
    const out = gateListings(pool, 3, 12, [{ id: 'waterside' }, { id: 'abernathy' }]);
    expect(out.map((l) => l.id)).not.toContain('c');
  });

  it('tags as preview, not tease', () => {
    for (const l of gateListings(pool, 3, 12, [{ id: 'waterside' }])) {
      expect(l.preview).toBe(true);
      expect(l.tease).toBeUndefined();
    }
  });

  it('is not capped by the tease rate', () => {
    const many = Array.from({ length: 9 }, (_, i) => listing(`x${i}`, 'waterside'));
    expect(gateListings(many, 3, 12, [{ id: 'waterside' }])).toHaveLength(9);
  });
});

// Only 3 of 260 active listings carry a community_id, so a strict id match
// would leave Stage 3 with ~1 preview. The city fallback keeps the stage
// populated without unlocking anything the buyer didn't ask for.
describe('stage 3 — city fallback when community_id is unpopulated', () => {
  const pool = [
    listing('has-id', 'waterside', 'Alpharetta'),
    listing('same-city', undefined, 'Alpharetta'),
    listing('other-city', undefined, 'Marietta'),
    listing('no-city'),
  ];

  it('matches listings in the liked community\u2019s city', () => {
    const out = gateListings(pool, 3, 12, [{ id: 'waterside', city: 'Alpharetta' }]);
    expect(out.map((l) => l.id)).toEqual(['has-id', 'same-city']);
  });

  it('does not leak listings from a city the buyer never liked', () => {
    const out = gateListings(pool, 3, 12, [{ id: 'waterside', city: 'Alpharetta' }]);
    expect(out.map((l) => l.id)).not.toContain('other-city');
    expect(out.map((l) => l.id)).not.toContain('no-city');
  });

  // A liked community with no city attached must not widen the gate.
  it('falls back to id-only matching when the ref carries no city', () => {
    const out = gateListings(pool, 3, 12, [{ id: 'waterside' }]);
    expect(out.map((l) => l.id)).toEqual(['has-id']);
  });
});

describe('stage 4 — unlocked', () => {
  it('returns the full pool untagged', () => {
    const out = gateListings(twelve, 4, 12, []);
    expect(out).toHaveLength(12);
    expect(out.every((l) => !l.tease && !l.preview)).toBe(true);
  });
});

describe('input robustness', () => {
  // The zod layer clamps to 0–4, but the gate must fail closed on its own —
  // it is the last line of defence and must not depend on its caller.
  it('treats a negative stage as stage 0', () => {
    expect(gateListings(twelve, -1, 12, [])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const pool = [listing('a')];
    gateListings(pool, 1, 12, []);
    expect(pool[0]?.tease).toBeUndefined();
  });
});
