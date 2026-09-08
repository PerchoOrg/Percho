import { describe, expect, it } from 'vitest';
import { parseRow, rows, textItems } from './millage-pdf';

/**
 * Every fixture below is a verbatim fragment of the real 2023 DOR report,
 * copied out of the inflated content streams. That is the point of this file:
 * it is the only written record of what these PDFs actually look like, and
 * each case here is a county that once went silently missing.
 */

describe('textItems — the two positioning idioms', () => {
  it('reads a cell placed absolutely', () => {
    // Most pages look like this: each cell gets its own cm + identity Tm.
    const stream = `q
BT
/F2 10 Tf
1 0 0 1 19.8 690.65 cm
1 0 0 1 0 0 Tm
(COBB)Tj
ET
Q`;
    const [item] = textItems([stream]);
    expect(item?.text).toBe('COBB');
    expect(item?.x).toBeCloseTo(19.8);
    expect(item?.y).toBeCloseTo(690.65);
  });

  it('walks a row emitted as one text object with relative Td moves', () => {
    // The idiom that cost us every Barrow row. Verbatim from the report.
    const stream = `BT
/T1_1 9 Tf
489.3 650.49 Td
(Bond)Tj
-414.78 -18.1 Td
(BANKS)Tj
115.2 0 Td
(SCHOOL)Tj
245.1 0 Td
(14.000)Tj
81.95 0 Td
(0.000)Tj
ET`;
    const items = textItems([stream]);
    expect(items.map((i) => i.text)).toEqual(['Bond', 'BANKS', 'SCHOOL', '14.000', '0.000']);
    // BANKS starts a new line; the three cells after it share that baseline.
    const banks = items[1];
    const school = items[2];
    expect(school?.y).toBeCloseTo(banks?.y ?? Number.NaN);
    expect(school?.x).toBeGreaterThan(banks?.x ?? 0);
  });

  it('does not let one page’s translation leak into the next drawing', () => {
    // q/Q bracket the CTM; without honouring them every later cell drifts.
    const stream = `q
1 0 0 1 100 100 cm
BT
1 0 0 1 0 0 Tm
(INSIDE)Tj
ET
Q
BT
1 0 0 1 5 5 Tm
(OUTSIDE)Tj
ET`;
    const items = textItems([stream]);
    expect(items[0]?.x).toBeCloseTo(100);
    expect(items[1]?.x).toBeCloseTo(5);
  });

  it('counts pages by the report’s header, not by stream', () => {
    // One page is several content streams, so the stream index is not a page
    // number — grouping by it would merge rows that share a y across pages.
    const page = (n: string) =>
      `BT 1 0 0 1 0 500 Tm (GEORGIA DEPARTMENT OF REVENUE)Tj ET BT 1 0 0 1 0 400 Tm (${n})Tj ET`;
    const items = textItems([
      page('FIRST'),
      'BT 1 0 0 1 0 300 Tm (SAME PAGE)Tj ET',
      page('SECOND'),
    ]);
    const byText = new Map(items.map((i) => [i.text, i.page]));
    expect(byText.get('FIRST')).toBe(0);
    expect(byText.get('SAME PAGE')).toBe(0);
    expect(byText.get('SECOND')).toBe(1);
  });
});

describe('rows', () => {
  const at = (page: number, y: number, x: number, text: string) => ({
    page,
    y,
    x,
    text,
  });

  it('groups cells sharing a baseline, left to right', () => {
    const grouped = rows([
      at(0, 100, 300, '0.000'),
      at(0, 100, 20, 'COBB'),
      at(0, 100, 120, 'SCHOOL'),
    ]);
    expect(grouped).toEqual([['COBB', 'SCHOOL', '0.000']]);
  });

  it('tolerates the sub-point baseline jitter the report actually has', () => {
    // Real rows step by 15.79 and 15.80 alternately; cells within one row can
    // differ by a fraction of a point.
    expect(rows([at(0, 100, 10, 'A'), at(0, 100.9, 50, 'B')])).toEqual([['A', 'B']]);
  });

  it('never merges rows from different pages that share a y', () => {
    expect(rows([at(0, 100, 10, 'FIRST'), at(1, 100, 10, 'SECOND')])).toEqual([
      ['FIRST'],
      ['SECOND'],
    ]);
  });

  it('reads a page top to bottom', () => {
    expect(rows([at(0, 50, 10, 'LOWER'), at(0, 500, 10, 'UPPER')])).toEqual([['UPPER'], ['LOWER']]);
  });
});

describe('parseRow — the three ways a zero bond is written', () => {
  it('reads the usual two-number form', () => {
    expect(parseRow(['COBB', 'SCHOOL', '18.900', '0.000'])).toEqual({
      county: 'COBB',
      district: 'SCHOOL',
      mo: 18.9,
      bond: 0,
    });
  });

  it('treats a bond drawn as a literal space as zero, not as a terminator', () => {
    // Most of the report is this shape. Stopping at the blank drops it all.
    expect(parseRow(['COBB', 'ACWORTH', '8.950', ' '])).toEqual({
      county: 'COBB',
      district: 'ACWORTH',
      mo: 8.95,
      bond: 0,
    });
  });

  it('reads a row whose bond column was never drawn', () => {
    // Bartow's county levy. Requiring two numerics loses it, and the county
    // then fails the completeness check rather than reporting a wrong figure.
    expect(parseRow(['BARTOW', 'COUNTY UNINCORPORATED', '6.970'])).toEqual({
      county: 'BARTOW',
      district: 'COUNTY UNINCORPORATED',
      mo: 6.97,
      bond: 0,
    });
  });

  it('rejects a district with no levy at all', () => {
    expect(parseRow(['BARTOW', 'CID RED TOP MOUNTAIN'])).toBeNull();
  });

  it('keeps a multi-word district name whole', () => {
    expect(parseRow(['FULTON', 'BELTLINE', 'SSD', '2.000', '0.000'])?.district).toBe(
      'BELTLINE SSD',
    );
    expect(
      parseRow(['BARTOW', 'CARTERSVILLE', 'D/T', 'DEV', 'AUTH', '0.846', '0.000'])?.district,
    ).toBe('CARTERSVILLE D/T DEV AUTH');
  });

  it('rejects page furniture', () => {
    expect(parseRow(['County', 'District', 'M&O', 'Bond'])).toBeNull();
    expect(parseRow(['GEORGIA DEPARTMENT OF REVENUE'])).toBeNull();
    expect(parseRow(['Feb 13, 2024 8:52 PM'])).toBeNull();
  });

  it('rejects a row whose first cell is not a county name', () => {
    expect(parseRow(['2023', 'SOMETHING', '1.000', '0.000'])).toBeNull();
  });

  it('takes at most two rates, so a wide row cannot eat its district name', () => {
    const parsed = parseRow(['COBB', 'SCHOOL', '18.900', '0.000']);
    expect(parsed?.mo).toBe(18.9);
    expect(parsed?.bond).toBe(0);
  });

  it('normalises the county to upper case for the join', () => {
    expect(parseRow(['DeKalb', 'SCHOOL', '23.080', '0.000'])?.county).toBe('DEKALB');
  });
});
