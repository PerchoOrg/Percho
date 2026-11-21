import { describe, expect, it } from 'vitest';
import {
  INSIGHT_ANGLES,
  type PlaceFact,
  anglesForCommunity,
  describeDistance,
  filmFacts,
  renderFacts,
} from './insights';

const f = (
  name: string,
  bucket: string,
  miles: number | null,
  rating: number | null = null,
  reviews: number | null = null,
): PlaceFact => ({ name, bucket, miles, rating, reviews });

describe('anglesForCommunity', () => {
  it('never leans on ratings or review counts (phase366.6)', () => {
    expect(INSIGHT_ANGLES as readonly string[]).not.toContain('standing');
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      expect(anglesForCommunity(seed)).not.toContain('standing');
    }
  });

  it('gives one community the same emphasis every time', () => {
    const first = anglesForCommunity('cc9fc1da').join();
    for (let i = 0; i < 10; i++) expect(anglesForCommunity('cc9fc1da').join()).toBe(first);
  });

  it('does not give every community the same emphasis', () => {
    const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => anglesForCommunity(s).join()));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('never repeats an angle within one film', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const got = anglesForCommunity(seed, 4);
      expect(new Set(got).size).toBe(got.length);
    }
  });

  it('cannot ask for more angles than exist', () => {
    expect(anglesForCommunity('x', 99).length).toBe(INSIGHT_ANGLES.length);
  });
});

describe('describeDistance', () => {
  it('calls the community its own thing rather than 0.0 mi', () => {
    expect(describeDistance(f('Pool', 'amenities', 0))).toBe('in the community');
  });

  it('keeps one decimal, so a line can say "under two miles" truthfully', () => {
    expect(describeDistance(f('Publix', 'shopping', 1.63))).toBe('1.6 mi');
  });
});

describe('filmFacts', () => {
  const set = [
    f('Pool', 'amenities', 0),
    f('Peony', 'dining', 0.8, 4.6, 522),
    f('Publix', 'shopping', 1.6, 4.5, 717),
    f('Chattahoochee Pointe', 'outdoor', 1.8, 4.6, 605),
    f('Sharon Springs', 'outdoor', 2.2, 4.4, 596),
    f('Sims Lake', 'outdoor', 4.0, 4.8, 1988),
    f('Halcyon', 'shopping', 4.8, 4.6, 1492),
  ];

  it('states a radius the shot list can be checked against', () => {
    expect(filmFacts(set).join(' | ')).toContain('within 4.8 miles');
  });

  it('counts parks, and only parks', () => {
    expect(filmFacts(set).join(' | ')).toContain('3 parks');
  });

  it('says nothing about ratings or reviews', () => {
    expect(filmFacts(set).join(' | ')).not.toMatch(/review|rated|1,988/);
  });

  it('says nothing rather than something thin', () => {
    expect(filmFacts([f('Pool', 'amenities', 0)])).toEqual([]);
  });
});

describe('renderFacts', () => {
  it('omits what is missing instead of printing a placeholder', () => {
    // Schools carry no Google rating, and inventing one is the thing this
    // whole module refuses to do.
    const out = renderFacts([f('Sharon Elementary', 'schools', 0.9)]);
    expect(out).toContain('0.9 mi');
    expect(out).not.toMatch(/null|undefined|reviews/);
  });

  it('never hands the narration a rating or a review count', () => {
    const out = renderFacts([f('Sims Lake', 'outdoor', 4, 4.8, 1988)]);
    expect(out).toContain('4.0 mi');
    expect(out).not.toMatch(/4\.8|1,988|review/);
  });
});
