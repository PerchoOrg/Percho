import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  contentStreams,
  countywideMills,
  decodeCid,
  parseRow,
  rows,
  scenarioRange,
  taxScenarios,
  textItems,
  toUnicodeMap,
  totalMills,
} from './millage-pdf';

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

describe('textItems — TJ arrays', () => {
  it('joins the strings in a TJ array and drops the kerning numbers', () => {
    // Verbatim shape from Georgia Power's residential tariff, which is typeset
    // entirely in TJ arrays and has no Tj at all. The numbers between strings
    // are kerning in thousandths of an em, not content.
    const stream = `BT
/F1 9.96 Tf
1 0 0 1 57.6 746.6 Tm
[(Firs) -3 (t 650 kWh)] TJ
ET`;
    const [item] = textItems([stream]);
    expect(item?.text).toBe('First 650 kWh');
    expect(item?.x).toBeCloseTo(57.6);
  });

  it('ignores an array that draws nothing', () => {
    expect(textItems(['BT 1 0 0 1 0 0 Tm [( )] TJ ET'])[0]?.text).toBe(' ');
    expect(textItems(['BT 1 0 0 1 0 0 Tm [] TJ ET'])).toHaveLength(0);
  });

  it('reads a document that mixes both idioms', () => {
    const stream = `BT 1 0 0 1 0 100 Tm (PLAIN)Tj ET
BT 1 0 0 1 0 90 Tm [(AR) 5 (RAY)] TJ ET`;
    expect(textItems([stream]).map((i) => i.text)).toEqual(['PLAIN', 'ARRAY']);
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

describe('countywideMills — districts match exactly, never by substring', () => {
  /** DeKalb's real 2023 rows, verbatim. Every one of these names is why. */
  const DEKALB = [
    { county: 'DEKALB', district: 'AVONDALE ESTATES', mo: 9.55, bond: 0 },
    { county: 'DEKALB', district: 'COUNTY UNINCORPORATED', mo: 17.494, bond: 0.479 },
    { county: 'DEKALB', district: 'IND SCHOOL ATLANTA', mo: 20.5, bond: 0 },
    { county: 'DEKALB', district: 'IND SCHOOL DECATUR 50%', mo: 20.3, bond: 0 },
    { county: 'DEKALB', district: 'SCHOOL', mo: 22.98, bond: 0 },
    { county: 'DEKALB', district: 'STATE', mo: 0, bond: 0 },
  ];

  it('does not let AVONDALE ESTATES stand in for the STATE levy', () => {
    // `'AVONDALE ESTATES'.includes('STATE')` is true. With substring matching
    // the city's 9.55 mills were summed as the state's.
    expect(countywideMills(DEKALB, 'DEKALB').get('STATE')?.mo).toBe(0);
  });

  it('does not let an independent city school stand in for the county school', () => {
    // `'IND SCHOOL ATLANTA'.includes('SCHOOL')` is true, and it sorts before
    // the real row, so first-match-wins picked Atlanta's 20.5 over DeKalb's.
    expect(countywideMills(DEKALB, 'DEKALB').get('SCHOOL')?.mo).toBe(22.98);
  });

  it('totals DeKalb at its real county-wide rate', () => {
    const total = totalMills(countywideMills(DEKALB, 'DEKALB'));
    // 17.494 + 0.479 + 22.98 + 0. Substring matching gave 48.023 — the error
    // that motivated this whole function.
    expect(total).toBeCloseTo(40.953, 3);
    expect(total).not.toBeCloseTo(48.023, 1);
  });

  it('keeps a district’s M&O and bond apart — an exemption reaches only M&O', () => {
    const county = countywideMills(DEKALB, 'DEKALB').get('COUNTY UNINCORPORATED');
    expect(county?.mo).toBeCloseTo(17.494, 3);
    expect(county?.bond).toBeCloseTo(0.479, 3);
  });

  it('ignores districts belonging to another county', () => {
    const mixed = [...DEKALB, { county: 'FULTON', district: 'SCHOOL', mo: 17.14, bond: 0 }];
    expect(countywideMills(mixed, 'FULTON').get('SCHOOL')?.mo).toBe(17.14);
    expect(countywideMills(mixed, 'DEKALB').get('SCHOOL')?.mo).toBe(22.98);
  });

  it('reports what is missing rather than substituting for it', () => {
    // A county with no STATE row simply has no STATE key — the caller decides
    // whether that is a gap (it is not; the state levy has been 0 since 2016).
    const partial = DEKALB.filter((r) => r.district !== 'STATE');
    const parts = countywideMills(partial, 'DEKALB');
    expect(parts.has('STATE')).toBe(false);
    expect(parts.has('SCHOOL')).toBe(true);
  });

  it('is empty for a county that is not in the report at all', () => {
    expect(countywideMills(DEKALB, 'NOWHERE').size).toBe(0);
  });
});

describe('taxScenarios — a county is a range, not a rate', () => {
  /** DeKalb's real 2023 rows, trimmed to the ones that matter here. */
  const d = (district: string, mo: number, bond = 0) => ({
    county: 'DEKALB',
    district,
    mo,
    bond,
  });
  const DEKALB = [
    d('COUNTY UNINCORPORATED', 17.494, 0.479),
    d('COUNTY INCORPORATED', 9.588),
    d('SCHOOL', 22.98),
    d('STATE', 0),
    d('COUNTY FIRE DISTRICT', 2.837),
    d('COUNTY SSD - DUNWOODY', 2.837),
    d('COUNTY SSD - PINE LAKE', 2.837),
    d('COUNTY SSD - ATLANTA', 0.826),
    d('DUNWOODY', 3.04),
    d('PINE LAKE', 16.481),
    d('ATLANTA', 8.52, 1.88),
    d('IND SCHOOL ATLANTA', 20.5),
    // Excluded: commercial, financing, sub-area, tank farm.
    d('CID ASSEMBLY', 25),
    d('TAD - CITY OF DECATUR', 0),
    d('BROOKHAVEN', 2.74, 0.49),
    d('BROOKHAVEN ANNEX B', 1.6),
    d('DORAVILLE SSD (S13T)', 54.994),
  ];

  const byCity = (city: string | null) =>
    taxScenarios(DEKALB, 'DEKALB').find((s) => s.city === city);

  it('leads with the unincorporated baseline', () => {
    const first = taxScenarios(DEKALB, 'DEKALB')[0];
    expect(first?.city).toBeNull();
    // 17.494 + 0.479 + 22.980
    expect(first?.mills).toBeCloseTo(40.953, 3);
  });

  it('prices a city from the INCORPORATED county rate, not the unincorporated one', () => {
    // 9.588 + 2.837 + 22.980 + 3.040
    expect(byCity('DUNWOODY')?.mills).toBeCloseTo(38.445, 3);
  });

  it('finds cities that pay LESS than unincorporated', () => {
    // The intuition that a city adds its millage on top is wrong: the county
    // charges less inside city limits because the city provides the services.
    const base = byCity(null)?.mills ?? 0;
    expect(byCity('DUNWOODY')?.mills).toBeLessThan(base);
    expect(byCity('PINE LAKE')?.mills).toBeGreaterThan(base);
  });

  it('replaces the county school levy with an independent city system', () => {
    // 9.588 + 0.826 + 20.500 + 8.520 + 1.880 — county SCHOOL 22.98 is NOT here.
    expect(byCity('ATLANTA')?.mills).toBeCloseTo(41.314, 3);
  });

  it('excludes commercial improvement districts', () => {
    expect(byCity('CID ASSEMBLY')).toBeUndefined();
  });

  it('excludes tax allocation districts and zero-mill rows', () => {
    expect(byCity('TAD - CITY OF DECATUR')).toBeUndefined();
  });

  it('excludes a special service district that is not a whole city', () => {
    // Doraville's tank farm SSD is 54.994 mills and applies to a tank farm.
    expect(byCity('DORAVILLE SSD (S13T)')).toBeUndefined();
  });

  it('excludes a sub-area named after another district', () => {
    // The report does not say whether BROOKHAVEN ANNEX B replaces Brookhaven's
    // millage or adds to it, and the two readings differ by more than the row.
    expect(byCity('BROOKHAVEN ANNEX B')).toBeUndefined();
    expect(byCity('BROOKHAVEN')).toBeDefined();
  });

  it('has nothing to say about a county missing its baseline rows', () => {
    expect(
      taxScenarios(
        DEKALB.filter((r) => r.district !== 'SCHOOL'),
        'DEKALB',
      ),
    ).toEqual([]);
  });

  it('returns only the baseline when a county has no incorporated rate', () => {
    const noCities = DEKALB.filter((r) => r.district !== 'COUNTY INCORPORATED');
    const out = taxScenarios(noCities, 'DEKALB');
    expect(out).toHaveLength(1);
    expect(out[0]?.city).toBeNull();
  });

  it('ignores another county’s districts', () => {
    const mixed = [...DEKALB, { county: 'FULTON', district: 'HAPEVILLE', mo: 20, bond: 0 }];
    expect(taxScenarios(mixed, 'DEKALB').some((s) => s.city === 'HAPEVILLE')).toBe(false);
  });
});

describe('scenarioRange', () => {
  it('reports the cheapest and dearest with the place each belongs to', () => {
    const r = scenarioRange([
      { city: null, mills: 40 },
      { city: 'CHEAP', mills: 30 },
      { city: 'DEAR', mills: 50 },
    ]);
    expect(r?.low.city).toBe('CHEAP');
    expect(r?.high.city).toBe('DEAR');
  });

  it('can name unincorporated as either end', () => {
    const r = scenarioRange([
      { city: null, mills: 20 },
      { city: 'PRICEY', mills: 50 },
    ]);
    expect(r?.low.city).toBeNull();
  });

  it('has no range for an empty county', () => {
    expect(scenarioRange([])).toBeUndefined();
  });
});

describe('contentStreams rejects what only looks like a content stream', () => {
  /** A FlateDecode'd buffer holding one deflated payload, framed as a PDF
   *  stream object so `contentStreams` will find it. */
  function pdfWith(payload: Buffer): Buffer {
    return Buffer.concat([
      Buffer.from('%PDF-1.6\n1 0 obj\n<</Length 1>>\nstream\n'),
      deflateSync(payload),
      Buffer.from('\nendstream\nendobj\n'),
    ]);
  }

  it('keeps a real operator stream', () => {
    const ops = 'BT 1 0 0 1 10 20 Tm (HELLO)Tj ET';
    expect(contentStreams(pdfWith(Buffer.from(ops, 'latin1')))).toHaveLength(1);
  });

  it('drops an embedded font that happens to contain the bytes "TJ"', () => {
    // Not hypothetical: DeKalb's published millage sheet embeds four TrueType
    // fonts, and every one of them matched a bare `includes('TJ')`.
    const font = Buffer.alloc(4096);
    for (let i = 0; i < font.length; i++) font[i] = i % 256;
    font.write('glyfTJ[[[[Tj', 100, 'latin1');
    expect(contentStreams(pdfWith(font))).toHaveLength(0);
  });

  it('returns promptly on binary with open brackets and no closing TJ', () => {
    // This is the shape that hung the parser: the array alternative's two
    // branches both matched a backslash, so on input with `[` and no `] TJ`
    // the engine backtracked exponentially and never came back. 74 KB of
    // TrueType did it. Anything over a second here means it is back.
    const hostile = Buffer.from(`Tj${'['.repeat(400)}${'\\'.repeat(400)}`, 'latin1');
    const started = Date.now();
    textItems(contentStreams(pdfWith(hostile)));
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('terminates when a stream is filtered out', () => {
    // The advance sits after the try block, so an early `continue` on a
    // rejected stream spins forever. Two rejects in a row is the case.
    const font = Buffer.alloc(512, 0xfe);
    font.write('Tj', 10, 'latin1');
    const pdf = Buffer.concat([pdfWith(font), pdfWith(font)]);
    const started = Date.now();
    expect(contentStreams(pdf)).toHaveLength(0);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('what the reader does not read, and says so', () => {
  it('keeps a real operator stream even when the document also embeds a font', () => {
    // Measured on Rockdale's exemption schedule: its eight content streams are
    // 1.000 printable and its one embedded font is 0.315. The phase212 filter
    // separates them exactly, and this pins that it is not over-aggressive —
    // a filter that also dropped real streams would look identical from the
    // outside, since both cases end in an empty result.
    const ops = Buffer.from('BT /F1 11 Tf 55 756 Td (VISIBLE)Tj ET', 'latin1');
    const font = Buffer.alloc(2048);
    for (let i = 0; i < font.length; i++) font[i] = i % 256;
    font.write('OS/2cvt fpgmTj', 4, 'latin1');
    const both = [ops, font].map((b) => deflateSync(b));
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.6\n'),
      ...both.flatMap((d) => [
        Buffer.from('1 0 obj\n<</Length 1>>\nstream\n'),
        d,
        Buffer.from('\nendstream\nendobj\n'),
      ]),
    ]);
    const kept = contentStreams(pdf);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toContain('VISIBLE');
  });

  it('draws nothing from hex strings, which is a known limit', () => {
    // `<0015>Tj` is valid PDF and this reader ignores it. Documented rather
    // than fixed because the documents that use it here — Rockdale's schedule,
    // the 2024/25 DOR millage editions — pair it with a Type0 composite font,
    // so the bytes are glyph IDs and decoding the hex yields no letters. A
    // reader that returned those codes as text would produce confident
    // nonsense, which is worse than producing nothing.
    const items = textItems(['BT 1 0 0 1 10 20 Tm <001500130015>Tj ET']);
    expect(items).toHaveLength(0);
  });
});

describe('CID-encoded text', () => {
  /** A one-object PDF whose only stream is `body`, Flate-compressed. */
  function pdfWith(...bodies: string[]): Buffer {
    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
    for (const b of bodies) {
      parts.push(
        Buffer.from('stream\n'),
        deflateSync(Buffer.from(b, 'latin1')),
        Buffer.from('\nendstream\n'),
      );
    }
    return Buffer.concat(parts);
  }

  const CMAP =
    '/CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange ' +
    '3 beginbfchar <0003> <0020> <0024> <0041> <0025> <0042> endbfchar';

  it('reads a bfchar CMap', () => {
    const map = toUnicodeMap(pdfWith(CMAP));
    expect(map.get('0024')).toBe('A');
    expect(map.get('0025')).toBe('B');
    expect(map.get('0003')).toBe(' ');
  });

  it('expands a bfrange span', () => {
    const map = toUnicodeMap(pdfWith('1 beginbfrange <0010> <0013> <0030> endbfrange'));
    // 0x30 is "0", so 0010→"0", 0011→"1", 0012→"2", 0013→"3".
    expect([...'0123'].every((c, i) => map.get(`001${i}`) === c)).toBe(true);
  });

  it('refuses when two CMaps disagree about the same index', () => {
    // Merging is only honest while the fonts agree. Silently picking one would
    // produce plausible words built from the wrong font's alphabet.
    expect(() =>
      toUnicodeMap(
        pdfWith('1 beginbfchar <0024> <0041> endbfchar', '1 beginbfchar <0024> <005A> endbfchar'),
      ),
    ).toThrow(/disagree/);
  });

  it('allows two CMaps that agree', () => {
    const map = toUnicodeMap(
      pdfWith('1 beginbfchar <0024> <0041> endbfchar', '1 beginbfchar <0024> <0041> endbfchar'),
    );
    expect(map.get('0024')).toBe('A');
  });

  it('drops an index the font never defined rather than inventing one', () => {
    // A subset font legitimately omits glyphs the page never draws.
    const map = new Map([['0024', 'A']]);
    expect(decodeCid('00240099', map)).toBe('A');
  });

  it('decodes a hex string drawn with Tj', () => {
    const map = new Map([
      ['0024', 'A'],
      ['0025', 'B'],
    ]);
    const items = textItems(['BT 1 0 0 1 100 200 Tm <00240025> Tj ET'], map);
    expect(items.map((i) => i.text)).toEqual(['AB']);
  });

  it('decodes hex strings inside a TJ array, kerning and all', () => {
    const map = new Map([
      ['0024', 'A'],
      ['0025', 'B'],
    ]);
    const items = textItems(['BT 1 0 0 1 10 20 Tm [<0024>-55.5<0025>] TJ ET'], map);
    expect(items.map((i) => i.text)).toEqual(['AB']);
  });

  it('yields nothing from hex text when no map is supplied', () => {
    // Which is exactly what this reader did for every CID-encoded sheet before
    // phase229 — DeKalb's water schedule returned zero items and looked empty
    // rather than unreadable.
    expect(textItems(['BT 1 0 0 1 10 20 Tm <00240025> Tj ET'])).toHaveLength(0);
  });

  it('still reads a literal string when a map is present', () => {
    const items = textItems(['BT 1 0 0 1 10 20 Tm (Cobb) Tj ET'], new Map([['0024', 'A']]));
    expect(items.map((i) => i.text)).toEqual(['Cobb']);
  });
});
