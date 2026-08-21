import { describe, expect, it } from 'vitest';
import { type BgmCandidate, paletteForCommunity, paletteForListing, selectBgm } from './select';
import type { BgmEnergy, BgmRole, BgmVibe } from './storage';

const track = (
  path: string,
  role?: BgmRole,
  vibe?: BgmVibe,
  energy: BgmEnergy = 'gentle',
): BgmCandidate => ({
  path,
  meta: role
    ? {
        title: path,
        vibe: vibe ?? (path.split('/')[0] as BgmVibe),
        energy,
        role,
        tags: [],
        source: 'lyria',
        created_at: '2026-08-20',
      }
    : undefined,
});

const beds = [
  track('acoustic/a.mp3', 'bed'),
  track('acoustic/b.mp3', 'bed'),
  track('acoustic/c.mp3', 'bed'),
];

describe('selectBgm', () => {
  it('gives one community the same track every time', () => {
    const first = selectBgm({ candidates: beds, vibe: 'acoustic', role: 'bed', seed: 'abc' });
    for (let i = 0; i < 20; i++) {
      expect(
        selectBgm({ candidates: beds, vibe: 'acoustic', role: 'bed', seed: 'abc' })?.path,
      ).toBe(first?.path);
    }
  });

  it('does not give every community the same track', () => {
    const picked = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(
        (s) => selectBgm({ candidates: beds, vibe: 'acoustic', role: 'bed', seed: s })?.path,
      ),
    );
    expect(picked.size).toBeGreaterThan(1);
  });

  it('is stable when Storage returns a different order', () => {
    const a = selectBgm({ candidates: beds, vibe: 'acoustic', role: 'bed', seed: 'x' });
    const b = selectBgm({
      candidates: [...beds].reverse(),
      vibe: 'acoustic',
      role: 'bed',
      seed: 'x',
    });
    expect(a?.path).toBe(b?.path);
  });

  it('never hands a narrated film a lead track when a bed exists', () => {
    const mixed = [track('acoustic/loud.mp3', 'lead'), ...beds];
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const got = selectBgm({ candidates: mixed, vibe: 'acoustic', role: 'bed', seed });
      expect(got?.meta?.role).toBe('bed');
    }
  });

  it('prefers the vibe but takes another rather than going silent', () => {
    const other = [track('piano/x.mp3', 'bed')];
    const got = selectBgm({
      candidates: other,
      vibe: 'acoustic',
      role: 'bed',
      seed: 'anything',
    });
    expect(got?.path).toBe('piano/x.mp3');
  });

  it('treats an untagged legacy track as a bed of its folder', () => {
    // Every track imported before metadata existed has been used as a bed for
    // months. Excluding them would have emptied the library on deploy day.
    const legacy = [track('acoustic/old.mp3')];
    const got = selectBgm({ candidates: legacy, vibe: 'acoustic', role: 'bed', seed: 's' });
    expect(got?.path).toBe('acoustic/old.mp3');
  });

  it('returns null only when there is nothing at all', () => {
    expect(selectBgm({ candidates: [], vibe: 'acoustic', role: 'bed', seed: 's' })).toBeNull();
  });
});

describe('paletteForCommunity', () => {
  // The real Aberdeen mix: 38 places, one of them a brewpub, median 1.83 mi.
  const aberdeen = {
    amenities: 7,
    dining: 6,
    daily_errands: 4,
    outdoor: 4,
    schools: 3,
    shopping: 3,
    fitness: 3,
    other: 3,
    nightlife: 1,
    civic: 1,
    pets: 1,
    healthcare: 1,
    asian_community: 1,
  };

  it('does not let one brewpub make a suburb urban', () => {
    // The first version returned 'electronic' here, on `has('nightlife')`.
    expect(paletteForCommunity({ bucketCounts: aberdeen, medianMiles: 1.83 })).toBe('acoustic');
  });

  it('calls a walkable, dining-heavy neighbourhood urban', () => {
    expect(
      paletteForCommunity({
        bucketCounts: { dining: 6, nightlife: 4, shopping: 4, work_hubs: 2, outdoor: 1 },
        medianMiles: 0.6,
      }),
    ).toBe('electronic');
  });

  it('needs BOTH density and character, not either', () => {
    const urbanMix = { dining: 6, nightlife: 4, shopping: 4 };
    // Same places, but three miles away — a strip of restaurants you drive to.
    expect(paletteForCommunity({ bucketCounts: urbanMix, medianMiles: 3.0 })).not.toBe(
      'electronic',
    );
    // Walkable, but it is parks and schools.
    expect(
      paletteForCommunity({ bucketCounts: { schools: 3, outdoor: 5 }, medianMiles: 0.5 }),
    ).toBe('acoustic');
  });

  it('reads a shops-and-gym pocket with no parks as new build', () => {
    expect(
      paletteForCommunity({
        bucketCounts: { shopping: 4, fitness: 3, amenities: 3 },
        medianMiles: 2,
      }),
    ).toBe('piano');
  });

  it('falls back to acoustic before the POIs are resolved', () => {
    expect(paletteForCommunity({ bucketCounts: {}, medianMiles: null })).toBe('acoustic');
  });
});

describe('incumbency', () => {
  it('keeps what the community already shipped with when the library grows', () => {
    // Approving five tracks re-scored all six test communities before this
    // existed — the seed picks an index, and a longer list moves every index.
    const grown = [
      ...beds,
      ...['x', 'y', 'z', 'p', 'q'].map((n) => track(`acoustic/${n}.mp3`, 'bed')),
    ];
    const before = selectBgm({ candidates: beds, vibe: 'acoustic', role: 'bed', seed: 'abc' })!;
    const after = selectBgm({
      candidates: grown,
      vibe: 'acoustic',
      role: 'bed',
      seed: 'abc',
      incumbent: before.path,
    })!;
    expect(after.path).toBe(before.path);
  });

  it('lets go of a track that is no longer a candidate', () => {
    // Rejected, deleted, or re-tagged as a lead: the way out is the review.
    const got = selectBgm({
      candidates: beds,
      vibe: 'acoustic',
      role: 'bed',
      seed: 'abc',
      incumbent: 'acoustic/deleted.mp3',
    });
    expect(got).not.toBeNull();
    expect(got!.path).not.toBe('acoustic/deleted.mp3');
  });

  it('will not hold on to a lead track for a narrated film', () => {
    const mixed = [track('acoustic/loud.mp3', 'lead'), ...beds];
    const got = selectBgm({
      candidates: mixed,
      vibe: 'acoustic',
      role: 'bed',
      seed: 'abc',
      incumbent: 'acoustic/loud.mp3',
    })!;
    expect(got.meta?.role).toBe('bed');
  });
});

describe('energy', () => {
  it('prefers the asked-for energy within the palette', () => {
    const mixed = [
      track('acoustic/still.mp3', 'bed', 'acoustic', 'still'),
      track('acoustic/moving.mp3', 'bed', 'acoustic', 'moving'),
    ];
    for (const seed of ['a', 'b', 'c', 'd']) {
      expect(
        selectBgm({ candidates: mixed, vibe: 'acoustic', role: 'bed', energy: 'still', seed })?.meta
          ?.energy,
      ).toBe('still');
    }
  });

  it('ignores energy rather than returning nothing', () => {
    const only = [track('acoustic/moving.mp3', 'bed', 'acoustic', 'moving')];
    expect(
      selectBgm({ candidates: only, vibe: 'acoustic', role: 'bed', energy: 'still', seed: 's' })
        ?.path,
    ).toBe('acoustic/moving.mp3');
  });
});

describe('paletteForListing', () => {
  it('reads price as restraint, not as a category', () => {
    // The old taxonomy had a $2M+ bucket that fires on under 5% of the book
    // and means something different in every market. A percentile does not.
    expect(paletteForListing({ pricePercentile: 0.95 }).energy).toBe('still');
    expect(paletteForListing({ pricePercentile: 0.5 }).energy).toBe('gentle');
    expect(paletteForListing({ pricePercentile: 0.1 }).energy).toBe('moving');
  });

  it('takes instruments from the building, not the price', () => {
    expect(paletteForListing({ yearBuilt: 2022, pricePercentile: 0.1 }).vibe).toBe('piano');
    expect(paletteForListing({ yearBuilt: 1974, pricePercentile: 0.99 }).vibe).toBe('acoustic');
  });

  it('has a sane answer when both fields are missing', () => {
    // year_built is absent on 11 of 265 listings and price on 4.
    expect(paletteForListing({})).toEqual({ vibe: 'acoustic', energy: 'gentle' });
  });
});
