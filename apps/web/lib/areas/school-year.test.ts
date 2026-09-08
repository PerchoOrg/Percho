import { describe, expect, it } from 'vitest';
import { schoolYearAsOf } from './school-year';

describe('schoolYearAsOf', () => {
  it('reads the year off a GOSA file name', () => {
    expect(schoolYearAsOf(['EOG_2024-25_By_System.csv'])).toBe('2025-06-30');
  });

  it('takes the NEWEST year, not the first named', () => {
    // The bug this replaces: an EOG from 2023-24 beside an EOC from 2024-25
    // stamped both with the older year, while the comment said "newest".
    expect(schoolYearAsOf(['EOG_2023-24.csv', 'EOC_2024-25.csv'])).toBe('2025-06-30');
    expect(schoolYearAsOf(['EOC_2024-25.csv', 'EOG_2023-24.csv'])).toBe('2025-06-30');
  });

  it('is undefined when no name carries a year', () => {
    // The other bug: it used to default to '2025-06-30', which is exactly what
    // a real 2024-25 file produces — so an unnamed local run claimed the same
    // vintage as a parsed one and nothing could tell them apart.
    expect(schoolYearAsOf(['/tmp/eog.csv', '/tmp/eoc.csv'])).toBeUndefined();
    expect(schoolYearAsOf([])).toBeUndefined();
  });

  it('ignores a hyphenated number that is not a school year', () => {
    // A school year ends the calendar year after it starts. `2024-99` does not.
    expect(schoolYearAsOf(['/tmp/run-2024-99/eog.csv'])).toBeUndefined();
    expect(schoolYearAsOf(['/var/1234-56/eog.csv'])).toBeUndefined();
  });

  it('finds the year in a full URL', () => {
    expect(schoolYearAsOf(['https://download.gosa.ga.gov/2025/EOC_2024-25_By_System.csv'])).toBe(
      '2025-06-30',
    );
  });
});
