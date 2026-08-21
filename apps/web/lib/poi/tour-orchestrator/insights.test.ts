import { describe, expect, it } from 'vitest';
import {
  INSIGHT_ANGLES,
  type PlaceFact,
  anglesForCommunity,
  describeDistance,
  describeStanding,
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
  it('always includes standing — the angle with data behind every place', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      expect(anglesForCommunity(seed)).toContain('standing');
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

describe('describeStanding', () => {
  it('needs both a rating and a count to say anything', () => {
    expect(describeStanding(f('X', 'dining', 1, 4.8, null))).toBeNull();
    expect(describeStanding(f('X', 'dining', 1, null, 900))).toBeNull();
  });

  it('carries the review count, which is what separates the two 4.8s', () => {
    // Sims Lake and Caney Creek both score 4.8; one is the area's favourite
    // and the other is a local secret, and only the count says which.
    expect(describeStanding(f('Sims Lake', 'outdoor', 4, 4.8, 1988))).toBe(
      '4.8 from 1,988 reviews',
    );
    expect(describeStanding(f('Caney Creek', 'pets', 2.3, 4.8, 65))).toBe('4.8 from 65 reviews');
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

  it('picks the most-reviewed well-rated place, not the highest-scoring one', () => {
    // Sims Lake at 4.8/1988 beats Halcyon at 4.6/1492 on both, but the point
    // is that weight decides, not score alone.
    expect(filmFacts(set).join(' | ')).toContain('Sims Lake');
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
});
