/**
 * Near places first: a far place stays only when its kind has nothing near.
 * Northbrooke's cut (2026-09-23) put Ducktown Park (6.7 mi) and Poole's Mill
 * Park (5.8 mi) beside Matt Community Park (2.5 mi).
 */

import { describe, expect, it } from 'vitest';
import { NEAR_TIER_M, preferNearPois } from './photos';

const MI = 1609;
const places: Record<string, { bucket: string; miles: number | null }> = {
  matt: { bucket: 'outdoor', miles: 2.5 },
  ducktown: { bucket: 'outdoor', miles: 6.7 },
  pooles: { bucket: 'outdoor', miles: 5.8 },
  nofo: { bucket: 'nightlife', miles: 4.6 },
  reveille: { bucket: 'dining', miles: 0.8 },
  far_dining: { bucket: 'dining', miles: 5.0 },
  mystery: { bucket: 'fitness', miles: null },
};
const at = (id: string) => places[id] ?? { bucket: 'other', miles: null };
const pick = (ids: string[], handPicked?: Set<string>) =>
  preferNearPois({
    surrounding: ids,
    bucketOf: (id) => at(id).bucket,
    distanceOf: (id) => {
      const m = at(id).miles;
      return m == null ? null : m * MI;
    },
    ...(handPicked ? { handPicked } : {}),
  });

describe('preferNearPois', () => {
  it('drops a far place when its kind has a near one', () => {
    expect(pick(['matt', 'ducktown', 'pooles', 'reveille', 'far_dining'])).toEqual([
      'matt',
      'reveille',
    ]);
  });

  it('keeps a far place when it is the only one of its kind', () => {
    expect(pick(['nofo', 'reveille'])).toEqual(['nofo', 'reveille']);
  });

  it('never drops a place the owner approved by hand', () => {
    expect(pick(['matt', 'ducktown'], new Set(['ducktown']))).toEqual(['matt', 'ducktown']);
  });

  it('treats an unknown distance as near, not as missing', () => {
    expect(pick(['mystery'])).toEqual(['mystery']);
  });

  it('draws the line at four miles', () => {
    expect(NEAR_TIER_M / MI).toBeCloseTo(4, 1);
  });
});
