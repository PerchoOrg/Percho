import { describe, expect, it } from 'vitest';
import { mobileMapBoundsSchema } from '../mobile-map';

describe('mobileMapBoundsSchema', () => {
  it('coerces query-string numbers into bounds', () => {
    const out = mobileMapBoundsSchema.parse({
      minLat: '33.9',
      maxLat: '34.2',
      minLng: '-84.5',
      maxLng: '-84.1',
    });
    expect(out).toEqual({ minLat: 33.9, maxLat: 34.2, minLng: -84.5, maxLng: -84.1 });
  });

  it('rejects inverted or empty boxes', () => {
    expect(
      mobileMapBoundsSchema.safeParse({ minLat: 34.2, maxLat: 33.9, minLng: -84.5, maxLng: -84.1 })
        .success,
    ).toBe(false);
    expect(
      mobileMapBoundsSchema.safeParse({ minLat: 34, maxLat: 34, minLng: -84.5, maxLng: -84.1 })
        .success,
    ).toBe(false);
  });

  it('rejects a metro-dump span', () => {
    // The bands never draw content this wide; a huge box is a bug, not a use case.
    expect(
      mobileMapBoundsSchema.safeParse({ minLat: 30, maxLat: 35, minLng: -85, maxLng: -80 }).success,
    ).toBe(false);
  });

  it('rejects coordinates off the globe and non-numbers', () => {
    expect(
      mobileMapBoundsSchema.safeParse({ minLat: -91, maxLat: 0, minLng: 0, maxLng: 1 }).success,
    ).toBe(false);
    expect(
      mobileMapBoundsSchema.safeParse({ minLat: 'x', maxLat: 1, minLng: 0, maxLng: 1 }).success,
    ).toBe(false);
  });
});
