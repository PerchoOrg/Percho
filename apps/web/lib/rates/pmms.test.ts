import { describe, expect, it } from 'vitest';
import { parsePmmsCsv } from './pmms';

const HEADER = 'date,pmms30,pmms30p,pmms15,pmms15p,pmms51,pmms51p,pmms51m,pmms51spread';

describe('parsePmmsCsv', () => {
  it('returns the newest row as fractions with an ISO date', () => {
    const csv = [HEADER, '8/27/2026,6.66,,5.98,,,,,', '9/3/2026,6.71,,6.04,,,,,', ''].join('\n');
    expect(parsePmmsCsv(csv)).toEqual({
      rate30: 0.0671,
      rate15: 0.0604,
      asOf: '2026-09-03',
      source: 'Freddie Mac PMMS',
    });
  });

  it('skips trailing blank or malformed rows', () => {
    const csv = [HEADER, '9/3/2026,6.71,,6.04,,,,,', ',,,,,,,,', 'garbage', ''].join('\r\n');
    expect(parsePmmsCsv(csv)?.asOf).toBe('2026-09-03');
  });

  it('omits rate15 when the column is empty', () => {
    const csv = [HEADER, '4/2/1971,7.33, ,,,,,,'].join('\n');
    const rates = parsePmmsCsv(csv);
    expect(rates?.rate30).toBeCloseTo(0.0733);
    expect(rates && 'rate15' in rates).toBe(false);
  });

  it('returns null for a header-only or empty body', () => {
    expect(parsePmmsCsv(HEADER)).toBeNull();
    expect(parsePmmsCsv('')).toBeNull();
  });
});
