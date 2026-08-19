import { describe, expect, it } from 'vitest';
import { MAX_DISTANCE_M, distanceWeight, scorePoi } from './community-tour';

describe('scorePoi', () => {
  it('agreement + confidence + photo count scale the score', () => {
    const base = {
      bucket: 'schools',
      agreement: 2 as const,
      confidence: 'high' as const,
      photo_count: 3,
      distance_m: 800,
    };
    const full = scorePoi(base);
    expect(full).toBeCloseTo(1.0, 5);
    // single-agent, medium confidence, 1 photo → big haircut
    const weak = scorePoi({ ...base, agreement: 1, confidence: 'medium', photo_count: 1 });
    expect(weak).toBeLessThan(full * 0.5);
    // photo_count caps at 3
    expect(scorePoi({ ...base, photo_count: 10 })).toBeCloseTo(1.0, 5);
  });

  it('ranks the nearer of two otherwise identical places first', () => {
    const base = {
      bucket: 'outdoor',
      agreement: 2 as const,
      confidence: 'high' as const,
      photo_count: 3,
    };
    // The Aberdeen case: a park half a mile away vs Suwanee Town Center at 4.7.
    const near = scorePoi({ ...base, distance_m: 800 });
    const far = scorePoi({ ...base, distance_m: 7523 });
    expect(near).toBeGreaterThan(far);
    expect(far / near).toBeLessThan(0.6);
  });

  it('treats an unknown distance as neither near nor far', () => {
    const base = {
      bucket: 'schools',
      agreement: 2 as const,
      confidence: 'high' as const,
      photo_count: 3,
    };
    const unknown = scorePoi(base);
    expect(unknown).toBeLessThan(scorePoi({ ...base, distance_m: 500 }));
    expect(unknown).toBeGreaterThan(scorePoi({ ...base, distance_m: MAX_DISTANCE_M }));
  });
});

describe('distanceWeight', () => {
  it('gives the whole first mile full marks', () => {
    expect(distanceWeight(0)).toBe(1.0);
    expect(distanceWeight(1609)).toBe(1.0);
  });

  it('decays monotonically from one mile to the ceiling', () => {
    // Sampled between the two constants so the test does not need rewriting
    // every time the ceiling moves.
    let prev = distanceWeight(1609);
    for (let i = 1; i <= 8; i++) {
      const w = distanceWeight(1609 + ((MAX_DISTANCE_M - 1609) * i) / 8);
      expect(w).toBeLessThan(prev);
      prev = w;
    }
    expect(distanceWeight(MAX_DISTANCE_M)).toBeCloseTo(0.4, 5);
  });

  it('never rewards distance past the ceiling', () => {
    // Anything out here is dropped before scoring; the floor is belt and braces.
    expect(distanceWeight(MAX_DISTANCE_M + 10_000)).toBe(0.4);
  });
});
