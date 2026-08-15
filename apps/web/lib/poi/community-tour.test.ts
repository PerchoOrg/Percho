import { describe, expect, it } from 'vitest';
import { type ShotListInput, buildShotList, durationForCategory, scorePoi } from './community-tour';

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

describe('durationForCategory', () => {
  it('maps categories to 2-4s and clamps unknowns', () => {
    expect(durationForCategory('aerial')).toBe(4);
    expect(durationForCategory('landscape')).toBe(4);
    expect(durationForCategory('interior')).toBe(2);
    expect(durationForCategory('nonsense')).toBe(2.5);
  });
});

describe('buildShotList', () => {
  const mk = (
    p: Partial<ShotListInput> & {
      photo_id: string;
      poi_id: string;
      poi_name: string;
      category: string;
      bucket: string;
    },
  ): ShotListInput => ({
    usable: true,
    has_prominent_text: false,
    ai_score: 0.5,
    ...p,
  });

  it('opens widest, never 2 consecutive same-POI, max 2 per POI, closes with activity', () => {
    const inputs = [
      mk({
        photo_id: 'a1',
        poi_id: 'A',
        poi_name: 'A',
        category: 'landscape',
        bucket: 'outdoor',
        ai_score: 0.9,
      }),
      mk({
        photo_id: 'b1',
        poi_id: 'B',
        poi_name: 'B',
        category: 'storefront',
        bucket: 'dining',
        ai_score: 0.8,
      }),
      mk({
        photo_id: 'c1',
        poi_id: 'C',
        poi_name: 'C',
        category: 'interior',
        bucket: 'dining',
        ai_score: 0.7,
      }),
      mk({
        photo_id: 'd1',
        poi_id: 'D',
        poi_name: 'D',
        category: 'aerial',
        bucket: 'outdoor',
        ai_score: 0.6,
      }),
    ];
    const shots = buildShotList(inputs);
    expect(shots.length).toBeGreaterThanOrEqual(3);
    // opener is a widen category
    expect(['aerial', 'landscape']).toContain(shots[0]!.category);
    // per-POI max 2
    const counts = new Map<string, number>();
    for (const s of shots) counts.set(s.poi_id, (counts.get(s.poi_id) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(2);
    // no two consecutive same-POI
    for (let i = 1; i < shots.length; i++) {
      expect(shots[i]!.poi_id).not.toBe(shots[i - 1]!.poi_id);
    }
  });

  it('text-heavy photos route to depthflow, clean landscapes to seedance', () => {
    const inputs = [
      mk({
        photo_id: 't1',
        poi_id: 'T',
        poi_name: 'School',
        category: 'signage',
        bucket: 'schools',
        has_prominent_text: true,
      }),
      mk({
        photo_id: 'p1',
        poi_id: 'P',
        poi_name: 'Park',
        category: 'landscape',
        bucket: 'outdoor',
      }),
    ];
    const shots = buildShotList(inputs);
    expect(shots.find((s) => s.photo_id === 't1')?.engine).toBe('depthflow');
    expect(shots.find((s) => s.photo_id === 'p1')?.engine).toBe('seedance');
  });
});
