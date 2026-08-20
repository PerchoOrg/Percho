import { describe, expect, it } from 'vitest';
import { clipLabel, formatDistance } from './clip-label';

describe('formatDistance', () => {
  it('reads the way someone says it out loud', () => {
    expect(formatDistance(1448)).toBe('0.9 mi');
    expect(formatDistance(4023)).toBe('2.5 mi');
    expect(formatDistance(6437)).toBe('4.0 mi');
  });

  it('prints a number even for something across the street', () => {
    // "walkable" used to appear under 400m. It put a word where every other
    // clip had a number, which shows once the card is pinned rather than
    // redrawn per clip (owner 2026-08-19).
    expect(formatDistance(0)).toBe('0.0 mi');
    expect(formatDistance(400)).toBe('0.2 mi');
  });

  it('drops the decimal once the number stops being precise', () => {
    expect(formatDistance(32187)).toBe('20 mi');
  });
});

describe('clipLabel', () => {
  it('gives a community amenity an explicit zero', () => {
    // Owner 2026-08-19: "if inside the community, just say 0 mile". A blank
    // second line read as missing data on an otherwise uniform card.
    expect(clipLabel({ poiName: 'Aberdeen Pool', bucket: 'amenities', distanceM: 0 })).toEqual({
      name: 'Aberdeen Pool',
      distance: '0 mi',
    });
  });

  it('says 0 mi for an amenity even when no distance was measured', () => {
    expect(clipLabel({ poiName: 'Aberdeen Clubhouse', bucket: 'amenities' })).toEqual({
      name: 'Aberdeen Clubhouse',
      distance: '0 mi',
    });
  });

  it('gives an outside place its distance, as a separate line', () => {
    expect(
      clipLabel({ poiName: 'Sharon Elementary School', bucket: 'schools', distanceM: 1448 }),
    ).toEqual({ name: 'Sharon Elementary School', distance: '0.9 mi' });
  });

  it('leaves the distance empty when it is genuinely unknown', () => {
    expect(clipLabel({ poiName: 'Sims Lake Park', bucket: 'outdoor', distanceM: null })).toEqual({
      name: 'Sims Lake Park',
      distance: '',
    });
  });

  it('renders nothing for a nameless POI', () => {
    expect(clipLabel({ poiName: '   ', bucket: 'outdoor', distanceM: 1600 })).toEqual({
      name: '',
      distance: '',
    });
  });
});
