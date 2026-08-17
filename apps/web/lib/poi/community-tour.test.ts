import { describe, expect, it } from 'vitest';
import { scorePoi } from './community-tour';

describe('scorePoi', () => {
  it('agreement + confidence + photo count scale the score', () => {
    const base = {
      bucket: 'schools',
      agreement: 2 as const,
      confidence: 'high' as const,
      photo_count: 3,
    };
    const full = scorePoi(base);
    expect(full).toBeCloseTo(1.0, 5);
    // single-agent, medium confidence, 1 photo → big haircut
    const weak = scorePoi({ ...base, agreement: 1, confidence: 'medium', photo_count: 1 });
    expect(weak).toBeLessThan(full * 0.5);
    // photo_count caps at 3
    expect(scorePoi({ ...base, photo_count: 10 })).toBeCloseTo(1.0, 5);
  });
});
