import { describe, expect, it } from 'vitest';
import { clipLabel, formatDistance } from './clip-label';

describe('formatDistance', () => {
  it('reads the way someone says it out loud', () => {
    expect(formatDistance(1448)).toBe('0.9 mi');
    expect(formatDistance(4023)).toBe('2.5 mi');
    expect(formatDistance(6437)).toBe('4.0 mi');
  });

  it('calls the very close things walkable instead of printing a number', () => {
    expect(formatDistance(0)).toBe('walkable');
    expect(formatDistance(400)).toBe('walkable');
    expect(formatDistance(401)).not.toBe('walkable');
  });

  it('drops the decimal once the number stops being precise', () => {
    expect(formatDistance(32187)).toBe('20 mi');
  });
});

describe('clipLabel', () => {
  it('names a community amenity without a distance', () => {
    // The clubhouse is here; "0.0 mi" would be noise.
    expect(clipLabel({ poiName: 'Aberdeen Pool', bucket: 'amenities', distanceM: 0 })).toBe(
      'Aberdeen Pool',
    );
  });

  it('gives an outside place its distance', () => {
    expect(
      clipLabel({ poiName: 'Sharon Elementary School', bucket: 'schools', distanceM: 1448 }),
    ).toBe('Sharon Elementary School · 0.9 mi');
  });

  it('falls back to the bare name when distance is unknown', () => {
    expect(clipLabel({ poiName: 'Sims Lake Park', bucket: 'outdoor', distanceM: null })).toBe(
      'Sims Lake Park',
    );
  });

  it('renders nothing for a nameless POI rather than a stray separator', () => {
    expect(clipLabel({ poiName: '   ', bucket: 'outdoor', distanceM: 1600 })).toBe('');
  });
});
