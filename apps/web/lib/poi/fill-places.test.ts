/**
 * Topping up short research (phase366.8): Hedgerows reached its cut with ten
 * surrounding places and Towne Village with eight.
 */
import { describe, expect, it } from 'vitest';
import { pickFill } from './fill-places';
import type { PlaceResult } from './google-places';

const CENTER = { lat: 34.078223, lng: -83.955384 }; // Hedgerows, Buford

let n = 0;
const place = (over: Partial<PlaceResult> = {}): PlaceResult => ({
  id: `p${n++}`,
  displayName: { text: 'A Park' },
  primaryType: 'park',
  types: ['park'],
  rating: 4.7,
  userRatingCount: 900,
  location: { latitude: 34.09, longitude: -83.96 },
  photos: [{ name: 'x' }],
  ...over,
});

describe('pickFill', () => {
  it('adds well-regarded places up to the need, best first', () => {
    const weak = place({ rating: 4.4, userRatingCount: 60 });
    const strong = place({ rating: 4.8, userRatingCount: 3000 });
    const out = pickFill([weak, strong], { center: CENTER, have: new Set(), need: 1 });
    expect(out.map((p) => p.place_id)).toEqual([strong.id]);
    expect(out[0]?.source).toBe('google_fill');
    expect(out[0]?.bucket).toBe('outdoor');
  });

  it('skips what research already has, the thinly rated and the far', () => {
    const known = place();
    const thin = place({ userRatingCount: 12 });
    const far = place({ location: { latitude: 34.3, longitude: -83.96 } });
    const out = pickFill([known, thin, far], {
      center: CENTER,
      have: new Set([known.id]),
      need: 5,
    });
    expect(out).toEqual([]);
  });

  it('keeps any one kind to three, so the film is not all parks', () => {
    const parks = Array.from({ length: 6 }, () => place());
    const cafe = place({ primaryType: 'cafe', types: ['cafe'], rating: 4.4, userRatingCount: 80 });
    const out = pickFill([...parks, cafe], { center: CENTER, have: new Set(), need: 10 });
    expect(out.filter((p) => p.bucket === 'outdoor')).toHaveLength(3);
    expect(out.some((p) => p.bucket === 'dining')).toBe(true);
  });

  it('never adds a place of worship', () => {
    const church = place({
      displayName: { text: 'First Baptist Church' },
      primaryType: 'church',
      types: ['church', 'place_of_worship'],
    });
    expect(pickFill([church], { center: CENTER, have: new Set(), need: 3 })).toEqual([]);
  });
});
