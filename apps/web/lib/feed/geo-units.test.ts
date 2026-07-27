/**
 * City geo-unit aggregation. The pure reduce is tested directly; the Supabase
 * scan around it is not (it is a paged select with no logic of its own).
 *
 * What matters here is the "real or absent" rule: this task ships against 8680
 * real communities and only 265 listings, so most cities legitimately have no
 * median price. Every one of these tests exists to prove the aggregate omits
 * data rather than inventing it.
 */

import { describe, expect, it } from 'vitest';
import { aggregateCityUnits } from './geo-units';

type Community = Parameters<typeof aggregateCityUnits>[0][number];
type Listing = Parameters<typeof aggregateCityUnits>[1][number];

const community = (over: Partial<Community> = {}): Community => ({
  name: 'Abernathy',
  city: 'Atlanta',
  state: 'GA',
  lat: 33.93,
  lng: -84.38,
  cover_storage_path: 'nextdoor/abernathy.jpg',
  ...over,
});

const priced = (price: number | null, city = 'Atlanta'): Listing => ({
  city,
  state: 'GA',
  price,
});

describe('grouping', () => {
  it('groups communities into one unit per city/state', () => {
    const units = aggregateCityUnits(
      [
        community({ name: 'A' }),
        community({ name: 'B' }),
        community({ name: 'C', city: 'Marietta' }),
      ],
      [],
    );
    expect(units).toHaveLength(2);
    expect(units[0]?.name).toBe('Atlanta');
    expect(units[0]?.communityCount).toBe(2);
  });

  it('emits a stable level-prefixed slug id', () => {
    const [unit] = aggregateCityUnits([community({ city: 'Sandy Springs' })], []);
    expect(unit?.id).toBe('city:sandy-springs-ga');
    expect(unit?.level).toBe('city');
  });

  it('keeps at most 3 sample community names', () => {
    const units = aggregateCityUnits(
      Array.from({ length: 6 }, (_, i) => community({ name: `N${i}` })),
      [],
    );
    expect(units[0]?.sampleCommunityNames).toEqual(['N0', 'N1', 'N2']);
    // The count still reflects reality, not the sample size.
    expect(units[0]?.communityCount).toBe(6);
  });

  it('sorts densest first, tie-broken by name for determinism', () => {
    const units = aggregateCityUnits(
      [
        community({ city: 'Zebulon' }),
        community({ city: 'Alpharetta' }),
        community({ city: 'Atlanta' }),
        community({ city: 'Atlanta', name: 'Second' }),
      ],
      [],
    );
    expect(units.map((u) => u.name)).toEqual(['Atlanta', 'Alpharetta', 'Zebulon']);
  });
});

describe('rows that cannot form a real unit are dropped', () => {
  it('drops communities with no city or no state', () => {
    expect(aggregateCityUnits([community({ city: null })], [])).toEqual([]);
    expect(aggregateCityUnits([community({ state: null })], [])).toEqual([]);
  });

  // A unit with no coordinates would land at (0,0) in the Gulf of Guinea and
  // break both the map thumb and any distance math.
  it('drops a city where no community has coordinates', () => {
    expect(aggregateCityUnits([community({ lat: null, lng: null })], [])).toEqual([]);
  });

  it('averages only the communities that do have coordinates', () => {
    const [unit] = aggregateCityUnits(
      [
        community({ lat: 34, lng: -84 }),
        community({ lat: 36, lng: -86 }),
        community({ lat: null, lng: null }),
      ],
      [],
    );
    expect(unit?.centroid).toEqual({ lat: 35, lng: -85 });
    // The null-coordinate row still counts as inventory.
    expect(unit?.communityCount).toBe(3);
  });
});

describe('median list price — real or absent', () => {
  it('is omitted below the 8-listing sample floor', () => {
    const units = aggregateCityUnits(
      [community()],
      Array.from({ length: 7 }, () => priced(400_000)),
    );
    expect(units[0]?.stats.medianListPrice).toBeUndefined();
    // But the honest raw count is still reported.
    expect(units[0]?.stats.activeListings).toBe(7);
  });

  it('is emitted at exactly the sample floor, with its sample size', () => {
    const units = aggregateCityUnits(
      [community()],
      Array.from({ length: 8 }, (_, i) => priced(100_000 * (i + 1))),
    );
    expect(units[0]?.stats.medianListPrice).toEqual({
      value: 450_000,
      sampleSize: 8,
    });
  });

  it('takes the middle value for an odd sample', () => {
    const prices = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((p) => priced(p * 1000));
    expect(aggregateCityUnits([community()], prices)[0]?.stats.medianListPrice).toEqual({
      value: 500_000,
      sampleSize: 9,
    });
  });

  it('ignores null and non-positive prices when computing the median', () => {
    const prices = [...Array.from({ length: 8 }, () => priced(300_000)), priced(null), priced(0)];
    const stats = aggregateCityUnits([community()], prices)[0]?.stats;
    expect(stats?.medianListPrice).toEqual({ value: 300_000, sampleSize: 8 });
    // activeListings counts rows, including the unpriced ones — they are real
    // active listings, they just have no price to average.
    expect(stats?.activeListings).toBe(10);
  });

  it('does not leak another city listings into this city median', () => {
    const units = aggregateCityUnits(
      [community(), community({ city: 'Marietta' })],
      Array.from({ length: 8 }, () => priced(900_000, 'Marietta')),
    );
    const atlanta = units.find((u) => u.name === 'Atlanta');
    const marietta = units.find((u) => u.name === 'Marietta');
    expect(atlanta?.stats.medianListPrice).toBeUndefined();
    expect(atlanta?.stats.activeListings).toBeUndefined();
    expect(marietta?.stats.medianListPrice?.value).toBe(900_000);
  });

  it('emits an empty stats object when nothing real is known', () => {
    expect(aggregateCityUnits([community()], [])[0]?.stats).toEqual({});
  });
});

describe('hero image', () => {
  it('uses the first community cover available in the city', () => {
    const [unit] = aggregateCityUnits(
      [
        community({ cover_storage_path: null }),
        community({ cover_storage_path: 'nextdoor/second.jpg' }),
      ],
      [],
    );
    expect(unit?.heroUrl).toContain('nextdoor/second.jpg');
  });

  it('omits heroUrl entirely when no community has a cover', () => {
    const [unit] = aggregateCityUnits([community({ cover_storage_path: null })], []);
    expect(unit?.heroUrl).toBeUndefined();
  });
});
