/**
 * City geo-unit projection — `public.city_geo_units` row → `GeoUnitDTO`.
 *
 * The aggregation itself now lives in SQL (migration 20260727010000), so what is
 * testable here is the projection: the "real or absent" rule on the way out.
 * That rule matters because this task ships against 8680 real communities and
 * only 265 real listings, so most cities legitimately have no median price.
 * Every test below exists to prove a missing number stays MISSING — no 0, no
 * null in the DTO, no "—" placeholder for a card to render.
 *
 * The aggregation rules the view owns (grouping, the 8-listing median floor,
 * dropping coordinate-less cities, densest-first ordering) were verified against
 * the linked remote on 2026-07-27: 109 units, Atlanta 731 communities, and all 5
 * qualifying medians match a hand `percentile_cont` over raw `listings`. They are
 * not re-asserted here — a unit test with a fake row cannot prove what SQL does.
 */

import { describe, expect, it } from 'vitest';
import { type CityGeoUnitRow, projectUnit } from './geo-units';

// `publicCoverImageUrl` throws without this, and vitest does not load
// `.env.local`. Set here rather than in a global setup file so this suite stays
// self-contained; the value is a shape, not a secret.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://project.supabase.co';

const row = (over: Partial<CityGeoUnitRow> = {}): CityGeoUnitRow => ({
  id: 'city:atlanta-ga',
  name: 'Atlanta',
  state: 'GA',
  centroid_lat: 33.93,
  centroid_lng: -84.38,
  hero_storage_path: 'nextdoor/abernathy.jpg',
  community_count: 731,
  sample_community_names: ['Abernathy', 'Ansley Park', 'Buckhead'],
  median_list_price: null,
  median_sample_size: null,
  active_listings: null,
  ...over,
});

describe('the real fields pass through', () => {
  it('projects a full row', () => {
    const unit = projectUnit(row());
    expect(unit).not.toBeNull();
    expect(unit?.id).toBe('city:atlanta-ga');
    expect(unit?.level).toBe('city');
    expect(unit?.name).toBe('Atlanta');
    expect(unit?.state).toBe('GA');
    expect(unit?.centroid).toEqual({ lat: 33.93, lng: -84.38 });
    expect(unit?.communityCount).toBe(731);
    expect(unit?.sampleCommunityNames).toEqual(['Abernathy', 'Ansley Park', 'Buckhead']);
  });

  it('resolves the hero storage path to a public URL', () => {
    expect(projectUnit(row())?.heroUrl).toContain('nextdoor/abernathy.jpg');
  });
});

describe('median list price — real or absent, never partial', () => {
  it('is emitted with its sample size when the view supplied both', () => {
    const unit = projectUnit(row({ median_list_price: 594450, median_sample_size: 52 }));
    expect(unit?.stats.medianListPrice).toEqual({ value: 594450, sampleSize: 52 });
  });

  it('is ABSENT — not zero, not null — when the view withheld it', () => {
    const stats = projectUnit(row())?.stats;
    expect(stats?.medianListPrice).toBeUndefined();
    expect('medianListPrice' in (stats ?? {})).toBe(false);
  });

  it('is absent when a price arrives without its sample size', () => {
    // A median with no n is exactly the "statistic wearing clothes" the 8-row
    // floor exists to prevent, so half a pair is treated as no pair.
    const stats = projectUnit(row({ median_list_price: 500000, median_sample_size: null }))?.stats;
    expect(stats?.medianListPrice).toBeUndefined();
  });

  it('is absent when a sample size arrives without a price', () => {
    const stats = projectUnit(row({ median_list_price: null, median_sample_size: 52 }))?.stats;
    expect(stats?.medianListPrice).toBeUndefined();
  });
});

describe('active listings — absent rather than zero', () => {
  it('is emitted when the city really has active listings', () => {
    expect(projectUnit(row({ active_listings: 52 }))?.stats.activeListings).toBe(52);
  });

  it('is omitted for a null count', () => {
    expect(projectUnit(row())?.stats.activeListings).toBeUndefined();
  });

  it('is omitted for a zero count — "0 listings" is a rendered claim', () => {
    const stats = projectUnit(row({ active_listings: 0 }))?.stats;
    expect(stats?.activeListings).toBeUndefined();
    expect(stats).toEqual({});
  });
});

describe('rows that cannot form a real unit', () => {
  it('emits an empty stats object when nothing real is known', () => {
    expect(projectUnit(row())?.stats).toEqual({});
  });

  it('omits heroUrl entirely when the city has no cover', () => {
    const unit = projectUnit(row({ hero_storage_path: null }));
    expect(unit?.heroUrl).toBeUndefined();
    expect('heroUrl' in (unit ?? {})).toBe(false);
  });

  it('drops a unit with no centroid rather than placing it at (0,0)', () => {
    // The view's `having` clause already excludes these; if one ever arrives,
    // defaulting to 0/0 would put the card in the Gulf of Guinea.
    expect(projectUnit(row({ centroid_lat: null, centroid_lng: null }))).toBeNull();
    expect(projectUnit(row({ centroid_lat: 33.9, centroid_lng: null }))).toBeNull();
    expect(projectUnit(row({ centroid_lat: null, centroid_lng: -84.3 }))).toBeNull();
  });

  it('tolerates a null sample-name array as an empty list', () => {
    expect(projectUnit(row({ sample_community_names: null }))?.sampleCommunityNames).toEqual([]);
  });
});
