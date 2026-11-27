import { schoolGrade, typicalShare } from '@percho/shared/school-grade';
import { describe, expect, it } from 'vitest';

describe('schoolGrade', () => {
  it('is a letter for a standing in the top half, the edge included', () => {
    expect([1, 5, 6, 10, 11, 20, 21, 30, 40, 50].map(schoolGrade)).toEqual([
      'A+',
      'A+',
      'A',
      'A',
      'A−',
      'A−',
      'B+',
      'B+',
      'B',
      'B−',
    ]);
  });

  it('is no letter past it', () => {
    expect(schoolGrade(51)).toBeNull();
    expect(schoolGrade(100)).toBeNull();
  });
});

describe('typicalShare', () => {
  it("is the middle of a city's schools, as a whole percent", () => {
    expect(typicalShare([{ share: 43 }, { share: 1 }, { share: 6 }])).toBe(6);
    // Between two middles, rounded: Suwanee's twenty sit at 4 and 7.
    expect(typicalShare([{ share: 1 }, { share: 4 }, { share: 7 }, { share: 43 }])).toBe(6);
    expect(typicalShare([])).toBeNull();
  });
});
