/**
 * Reading the Georgia DOR millage report's PDF — the pure half.
 *
 * This lives here rather than inside `scripts/admin/import-ga-millage.ts` for
 * the reason `lib/communities/naming.ts` exists: the rules below were arrived
 * at by watching counties silently disappear from the output, and a rule that
 * lives only in the script that discovered it is a rule the next script
 * re-derives, differently. The test file beside this one is doing most of the
 * work — it is the only written record of what these PDFs actually look like.
 *
 * Three things the report does that a reasonable parser gets wrong, each of
 * which cost a county:
 *
 *   1. **Two positioning idioms.** Most pages place every cell absolutely
 *      (`1 0 0 1 x y cm` then an identity `Tm`); some emit a whole row as one
 *      text object and step across it with relative `Td` moves. Matching only
 *      the absolute form dropped 146 strings — including every Barrow County
 *      row — and the failure was invisible, because the county simply was not
 *      in the output. Hence a real (if small) operator walk, not a regex.
 *
 *   2. **A zero bond is written three ways**: `0.000`, a literal single space,
 *      or the column not drawn at all. Requiring two trailing numerics loses
 *      Bartow's county levy; treating a blank as a terminator loses most of
 *      the report.
 *
 *   3. **One row per taxing district, not per county.** A county line, a
 *      school line, a state line, and one per city or special district. What a
 *      given address pays is the sum of the districts it sits in, which a
 *      county centroid cannot tell you.
 *
 * Only translation is tracked in the operator walk: the document never rotates
 * or scales text, and a full matrix multiply would be precision this does not
 * need. If a future edition does rotate, rows will interleave visibly rather
 * than fail quietly.
 *
 * Pure and dependency-free, so `scripts/admin/*` imports it the same way they
 * import `point-in-polygon`.
 */

import { inflateSync } from 'node:zlib';

export interface TextItem {
  page: number;
  x: number;
  y: number;
  text: string;
}

/**
 * How much of a buffer reads as text a PDF operator stream would contain.
 *
 * Content streams are ASCII operators and string literals — effectively all
 * printable plus whitespace. Embedded FONT FILES are also FlateDecode'd and
 * also inflate cleanly, and a binary TrueType blob will contain the two bytes
 * `Tj` or `TJ` by chance long before it contains anything meaningful.
 */
function printableRatio(text: string): number {
  if (text.length === 0) return 0;
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) printable++;
  }
  return printable / text.length;
}

/**
 * Anything below this is a font, an image or a colour profile, not operators.
 *
 * Measured: the millage report's real content streams are 0.99+; the DeKalb
 * millage sheet's embedded TrueType fonts — which `includes('TJ')` happily
 * accepted — are well under half.
 */
const MIN_PRINTABLE_RATIO = 0.9;

/**
 * Inflate every FlateDecode stream that carries text operators.
 *
 * Substring-matching `Tj`/`TJ` alone is not enough, and the failure was not
 * subtle: DeKalb's published millage sheet embeds its fonts, four of those
 * blobs matched, and feeding 74 KB of binary TrueType to the text-operator
 * regex HUNG the parser outright rather than returning nothing. A hang is a
 * worse outcome than a wrong answer, because nothing tells you which stage
 * stopped.
 */
export function contentStreams(pdf: Buffer): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const s = pdf.indexOf('stream', i);
    if (s < 0) break;
    let p = s + 'stream'.length;
    if (pdf[p] === 0x0d) p++;
    if (pdf[p] === 0x0a) p++;
    const e = pdf.indexOf('endstream', p);
    if (e < 0) break;
    try {
      const text = inflateSync(pdf.subarray(p, e)).toString('latin1');
      // No `continue` here: the loop's advance sits after this try block, so
      // skipping to the next iteration skips it and spins forever. Found the
      // hard way, in the same edit that was fixing a different hang.
      const drawsText = text.includes('Tj') || text.includes('TJ');
      if (drawsText && printableRatio(text) >= MIN_PRINTABLE_RATIO) {
        out.push(text);
      }
    } catch {
      // Images, fonts and anything not Flate — not our business.
    }
    i = e + 'endstream'.length;
  }
  return out;
}

/**
 * CID → character, merged from every ToUnicode CMap in the file.
 *
 * Some rate sheets draw their text as GLYPH INDICES into an embedded subset
 * font — `[<0016>-0.05<0019>] TJ` rather than `(26) Tj` — so a reader that only
 * matches literal strings comes back with nothing at all. DeKalb's 2026 water
 * schedule is one, and it returned **zero text items** until this existed.
 *
 * The indices mean nothing on their own; the file ships the translation in a
 * `/ToUnicode` CMap, one per font, as `beginbfchar` pairs and `beginbfrange`
 * spans.
 *
 * ── Why one merged map, and when it refuses ────────────────────────────────
 *
 * Properly, each text run should be decoded with the CMap of the font its `Tf`
 * selected, which means resolving font references through the object streams.
 * A single merged map skips all of that — and is only honest if the fonts
 * AGREE about every index they share. In DeKalb's sheet the six CMaps overlap
 * and agree on all 75 entries, so merging costs nothing.
 *
 * Where they disagree the merge would silently pick one, so it throws instead.
 * A document that needs per-font decoding should say so rather than produce
 * plausible words built from the wrong font's alphabet.
 */
export function toUnicodeMap(pdf: Buffer): Map<string, string> {
  const merged = new Map<string, string>();
  const put = (cid: string, ch: string, seen: Map<string, string>) => {
    const prior = merged.get(cid);
    if (prior !== undefined && prior !== ch && seen.get(cid) !== ch) {
      throw new Error(
        `ToUnicode CMaps disagree on <${cid}>: ${JSON.stringify(prior)} vs ${JSON.stringify(ch)} — this file needs per-font decoding`,
      );
    }
    merged.set(cid, ch);
  };

  let i = 0;
  for (;;) {
    const s = pdf.indexOf('stream', i);
    if (s < 0) break;
    let p = s + 'stream'.length;
    if (pdf[p] === 0x0d) p++;
    if (pdf[p] === 0x0a) p++;
    const e = pdf.indexOf('endstream', p);
    if (e < 0) break;
    let text = '';
    try {
      text = inflateSync(pdf.subarray(p, e)).toString('latin1');
    } catch {
      i = e + 'endstream'.length;
      continue;
    }
    i = e + 'endstream'.length;
    if (!text.includes('beginbfchar') && !text.includes('beginbfrange')) continue;

    const seen = new Map<string, string>();
    for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const m of (blk[1] ?? '').matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const cid = (m[1] ?? '').toUpperCase().padStart(4, '0');
        const ch = String.fromCharCode(Number.parseInt((m[2] ?? '').slice(0, 4), 16));
        put(cid, ch, seen);
        seen.set(cid, ch);
      }
    }
    for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      const spans = (blk[1] ?? '').matchAll(
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
      );
      for (const m of spans) {
        const lo = Number.parseInt(m[1] ?? '0', 16);
        const hi = Number.parseInt(m[2] ?? '0', 16);
        const base = Number.parseInt((m[3] ?? '0').slice(0, 4), 16);
        // A span that runs away is a misparse, not a font with 100k glyphs.
        if (hi < lo || hi - lo > 0xffff) continue;
        for (let c = lo; c <= hi; c++) {
          const cid = c.toString(16).toUpperCase().padStart(4, '0');
          const ch = String.fromCharCode(base + c - lo);
          put(cid, ch, seen);
          seen.set(cid, ch);
        }
      }
    }
  }
  return merged;
}

/** `<0016001900...>` → the characters those glyph indices stand for. */
export function decodeCid(hex: string, map: ReadonlyMap<string, string>): string {
  let out = '';
  const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
  for (let i = 0; i + 4 <= clean.length; i += 4) {
    // An index with no entry is dropped rather than guessed at: a subset font
    // legitimately omits glyphs the page never draws, and inventing a
    // character would put text in the output that is not in the document.
    out += map.get(clean.slice(i, i + 4).toUpperCase()) ?? '';
  }
  return out;
}

/** PDF string escapes, as far as this document uses them. */
export function unescapePdf(s: string): string {
  return s
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ');
}

/**
 * Every drawn string with the position it was drawn at.
 *
 * This walks the content stream's positioning operators rather than pattern
 * matching one of them, because **the report uses two different idioms and a
 * regex for either one silently loses whole counties**. Most pages position
 * each cell absolutely (`1 0 0 1 x y cm` then an identity `Tm`); some emit a
 * row as one text object and step through it with relative `Td` moves. A
 * regex for the absolute form dropped 146 strings, which happened to include
 * every Barrow County row — and the failure was invisible, because the county
 * simply did not appear in the output.
 *
 * Only translation is tracked. The document never rotates or scales text, and
 * a full matrix multiply would be precision this does not need.
 *
 * Pages are counted by the report's own header line rather than by stream
 * index: one page is several content streams, so the stream number is not a
 * page number and grouping by it would merge rows from different pages that
 * happen to share a y.
 */
export function textItems(
  streams: readonly string[],
  /** Needed only for files whose text is glyph indices — see `toUnicodeMap`.
   *  Without it a hex string decodes to nothing, which is what this reader did
   *  for every CID-encoded sheet before phase229. */
  cidMap?: ReadonlyMap<string, string>,
): TextItem[] {
  const items: TextItem[] = [];
  let page = -1;
  const num = String.raw`(-?[\d.]+)`;
  const token = new RegExp(
    [
      String.raw`\((?<str>(?:\\.|[^\\()])*)\)\s*Tj`, // draw one string
      String.raw`<(?<hex>[0-9A-Fa-f\s]*)>\s*Tj`, // ... or as glyph indices
      // `[^\\\]]` excludes the backslash so the two alternatives cannot both
      // match it. With the naive `(?:\\.|[^\]])*` they overlap, and on input
      // with open brackets and no closing `] TJ` — which is to say, on binary —
      // the engine backtracks exponentially and never returns.
      String.raw`\[(?<arr>(?:[^\\\]]|\\.)*)\]\s*TJ`, // draw an array of them
      String.raw`${num}\s+${num}\s+${num}\s+${num}\s+${num}\s+${num}\s+(?<op>cm|Tm)`,
      String.raw`${num}\s+${num}\s+(?<td>Td|TD)`,
      String.raw`(?<simple>BT|ET|q|Q|T\*)`,
    ].join('|'),
    'g',
  );

  for (const stream of streams) {
    if (stream.includes('GEORGIA DEPARTMENT OF REVENUE')) page++;

    // Graphics state stack: only the CTM translation matters here.
    let ctm = { x: 0, y: 0 };
    const stack: { x: number; y: number }[] = [];
    // Text line matrix (where the current line starts) and the cursor on it.
    let line = { x: 0, y: 0 };
    let cursor = { x: 0, y: 0 };

    token.lastIndex = 0;
    // `for` rather than `while ((m = exec()))`: the assignment-in-condition
    // idiom is banned here, and a plain `while` with the advance at the bottom
    // would be skipped by the `continue`s below.
    for (let m = token.exec(stream); m !== null; m = token.exec(stream)) {
      const g = m.groups ?? {};
      const n = m.slice(1).filter((v) => v !== undefined);

      if (g.hex !== undefined) {
        const text = cidMap ? decodeCid(g.hex, cidMap) : '';
        if (text.length > 0) {
          items.push({
            page: Math.max(page, 0),
            x: ctm.x + cursor.x,
            y: ctm.y + cursor.y,
            text,
          });
        }
        continue;
      }
      if (g.str !== undefined) {
        items.push({
          page: Math.max(page, 0),
          x: ctm.x + cursor.x,
          y: ctm.y + cursor.y,
          text: unescapePdf(g.str),
        });
        continue;
      }
      if (g.arr !== undefined) {
        // `[(Res) -250 (idential) 12 ( Service)] TJ` — the numbers between the
        // strings are kerning in thousandths of an em, not content. They are
        // dropped rather than turned into spaces: at this document's tracking
        // a real space is always its own `( )` string, and inferring one from
        // a kern threshold guesses wrong on both sides.
        // Both spellings: literal `(text)` and, in a subset-font file, the
        // glyph indices `<0016>` that mean the same thing.
        const parts = [...g.arr.matchAll(/\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>/g)].map((m) =>
          m[0].startsWith('<')
            ? cidMap
              ? decodeCid(m[0].slice(1, -1), cidMap)
              : ''
            : unescapePdf(m[0].slice(1, -1)),
        );
        const text = parts.join('');
        if (text.length > 0) {
          items.push({
            page: Math.max(page, 0),
            x: ctm.x + cursor.x,
            y: ctm.y + cursor.y,
            text,
          });
        }
        continue;
      }
      if (g.op === 'cm') {
        ctm = { x: ctm.x + Number(n[4]), y: ctm.y + Number(n[5]) };
        continue;
      }
      if (g.op === 'Tm') {
        line = { x: Number(n[4]), y: Number(n[5]) };
        cursor = { ...line };
        continue;
      }
      if (g.td !== undefined) {
        // Td moves the LINE origin, and the cursor restarts there — which is
        // why a row emitted as one text object walks correctly.
        line = { x: line.x + Number(n[0]), y: line.y + Number(n[1]) };
        cursor = { ...line };
        continue;
      }
      if (g.simple === 'q') {
        stack.push({ ...ctm });
      } else if (g.simple === 'Q') {
        ctm = stack.pop() ?? { x: 0, y: 0 };
      } else if (g.simple === 'BT') {
        line = { x: 0, y: 0 };
        cursor = { x: 0, y: 0 };
      }
    }
  }
  return items;
}

/** Cells closer than this in y are the same row. Real rows step by ~15.8pt. */
const ROW_TOLERANCE = 2;

/**
 * Group the drawn strings into table rows, each ordered left to right.
 *
 * Two passes, deliberately. Sorting by `(page, -y, x)` once and cutting on a y
 * gap looks equivalent and is not: the moment two cells of one row differ in y
 * by even a fraction, the y comparison wins and they come out in the wrong
 * order, which silently transposes a district name and its rate. So rows are
 * CLUSTERED first, on y alone, and only then is each row sorted by x.
 */
export function rows(items: readonly TextItem[]): string[][] {
  const byRow = [...items].sort((a, b) => a.page - b.page || b.y - a.y);
  const clusters: TextItem[][] = [];
  let current: TextItem[] = [];
  let page = -1;
  let y = Number.NaN;
  for (const item of byRow) {
    if (item.page !== page || Math.abs(item.y - y) > ROW_TOLERANCE) {
      if (current.length > 0) clusters.push(current);
      current = [];
      page = item.page;
      y = item.y;
    }
    current.push(item);
  }
  if (current.length > 0) clusters.push(current);
  return clusters.map((row) => [...row].sort((a, b) => a.x - b.x).map((i) => i.text));
}

export interface DistrictRate {
  county: string;
  district: string;
  mo: number;
  bond: number;
}

/**
 * A data row is `County District M&O [Bond]`, with the rates last.
 *
 * Four shapes occur, and all four are real:
 *   `COBB    SCHOOL                 18.900  0.000`  — the usual form
 *   `COBB    ACWORTH                 8.950  " "`    — bond drawn as a SPACE
 *   `BARTOW  COUNTY UNINCORPORATED   6.970`         — bond column not drawn
 *   `BARTOW  CID RED TOP MOUNTAIN`                  — a district with no levy
 *
 * A zero bond is written three different ways and two of them are not the
 * digit zero. Requiring two numerics drops the third shape (Bartow's county
 * levy vanished exactly that way); treating a blank as a terminator instead of
 * as zero drops the second, which is most of the report. Both failures are
 * silent in the sense that the row simply is not there — which is why the
 * completeness check and the printed skip list exist, and why they are the
 * thing to read when a county goes missing.
 *
 * The district name can contain spaces, so the row is read from the END:
 * trailing rate cells (numeric, or blank meaning zero) are rates, the first
 * cell is the county, everything between is the district name. A row with no
 * rate at all is page furniture or a levy-free district and returns null.
 */
export function parseRow(cells: readonly string[]): DistrictRate | null {
  if (cells.length < 2) return null;

  /** A rate cell: a number, or a blank standing in for 0.000. */
  const asRate = (cell: string | undefined): number | null => {
    if (cell === undefined) return null;
    if (cell.trim() === '') return 0;
    const v = Number(cell);
    return Number.isFinite(v) ? v : null;
  };

  const rates: number[] = [];
  let end = cells.length;
  while (end > 1 && rates.length < 2) {
    const v = asRate(cells[end - 1]);
    if (v === null) break;
    rates.unshift(v);
    end--;
  }
  if (rates.length === 0) return null;

  const county = (cells[0] ?? '').trim().toUpperCase();
  if (county.length === 0 || /\d/.test(county)) return null;
  const district = cells.slice(1, end).join(' ').trim().toUpperCase();
  if (district.length === 0) return null;

  const [mo, bond] = rates.length === 2 ? rates : [rates[0], 0];
  return { county, district, mo: mo ?? 0, bond: bond ?? 0 };
}

/**
 * The levies every homeowner in a county pays, keyed by which one they are.
 *
 * `COUNTY UNINCORPORATED` is the county's own levy outside any city; `SCHOOL`
 * and `STATE` apply county-wide. Cities, independent city school systems and
 * special districts are excluded: only some addresses are inside them, and an
 * average over districts a home is not in is not a rate anybody pays.
 *
 * **Districts are matched exactly, never by substring.** Substring matching
 * looks harmless and is not — `AVONDALE ESTATES` contains `STATE`, and
 * `IND SCHOOL ATLANTA` contains `SCHOOL`. Both are real DeKalb districts, and
 * with `includes()` DeKalb summed 48.023 mills: its own county levy, Atlanta's
 * independent school levy in place of DeKalb's, and the city of Avondale
 * Estates standing in for the state. The correct total is 40.953. Nothing
 * about the output looked malformed; it was merely too high, which is exactly
 * how a rate error hides.
 *
 * M&O and bond are returned SEPARATELY, not summed. A homestead exemption
 * reduces the maintenance-and-operations base and by law never touches bond
 * millage (O.C.G.A. § 48-5-44 excludes levies "to pay interest on and to
 * retire bonded indebtedness"). A combined figure cannot be taxed correctly,
 * and combining them was the shape this returned before anyone tried to.
 */
export const COUNTYWIDE_DISTRICTS = ['COUNTY UNINCORPORATED', 'SCHOOL', 'STATE'] as const;

export interface LevyMills {
  mo: number;
  bond: number;
}

export function countywideMills(
  districts: readonly DistrictRate[],
  county: string,
): Map<string, LevyMills> {
  const out = new Map<string, LevyMills>();
  for (const r of districts) {
    if (r.county !== county) continue;
    const which = COUNTYWIDE_DISTRICTS.find((d) => r.district === d);
    if (!which || out.has(which)) continue;
    out.set(which, { mo: r.mo, bond: r.bond });
  }
  return out;
}

/** Every county-wide mill, M&O and bond together. */
export function totalMills(parts: ReadonlyMap<string, LevyMills>): number {
  return [...parts.values()].reduce((n, l) => n + l.mo + l.bond, 0);
}

/**
 * What a county's residential taxing districts add up to, one scenario at a
 * time.
 *
 * ── Why a county has a RANGE, not a rate ───────────────────────────────────
 *
 * A single county figure reads as "what you pay here" and is only ever true
 * for one scenario: a home outside every city. Inside a city the bill is built
 * from different rows, and the difference is larger than most of the arguments
 * about how to compute a rate. In DeKalb 2023 it runs from 38.445 mills in
 * Dunwoody to 51.886 in Pine Lake against 40.953 unincorporated — a spread of
 * 13 mills, or half a percentage point of market value.
 *
 * ── And it does not always go up ───────────────────────────────────────────
 *
 * The intuition is that a city adds its millage on top. That is wrong, and it
 * was written into this codebase as fact before anyone checked: the county
 * levies a LOWER rate inside a city, because the city provides the services
 * the county would otherwise. DeKalb charges 17.494 mills unincorporated and
 * 9.588 incorporated, so **a Dunwoody resident pays less county-wide tax than
 * their unincorporated neighbour**, city millage included. Pine Lake's own
 * 16.481 mills more than swallow the discount; Dunwoody's 3.04 do not.
 *
 * ── What is deliberately excluded, and what that costs ─────────────────────
 *
 *   `CID *`  Community Improvement Districts levy on COMMERCIAL property only.
 *            Including them would put a 25-mill industrial district in a
 *            residential range.
 *   `TAD *`  Tax Allocation Districts are a financing mechanism and levy
 *            0.000 in every row of this report.
 *   other    A special service district that is not `COUNTY SSD - <city>`
 *   `SSD`    covers specific parcels rather than a whole city — Doraville's
 *            tank farm SSD is 54.994 mills and applies to a tank farm.
 *   sub-     A district whose name begins with another district's name is a
 *   areas    slice of it — `BROOKHAVEN ANNEX B` beside `BROOKHAVEN`. The
 *            report does not say whether such a row REPLACES the parent's
 *            millage or adds to it, and the two readings differ by more than
 *            the row itself. Left in, `BROOKHAVEN ANNEX B` set DeKalb's floor
 *            at 1.367% on the replace reading; it would be 1.496% on the other.
 *            A number we cannot interpret should not define a county's floor.
 *
 * The cost of those exclusions is that a home inside such a district pays more
 * than this range's top. The range is therefore a floor-and-ceiling for the
 * ORDINARY case, which is what it is labelled as, and not a guarantee.
 *
 * Independent city school systems replace the county school levy rather than
 * adding to it — Atlanta, Decatur, Marietta and the rest — so a city with one
 * is priced with `IND SCHOOL <city>` in place of `SCHOOL`.
 */

export interface TaxScenario {
  /** `null` for the unincorporated baseline, otherwise the city's name. */
  city: string | null;
  /** Total mills a residential parcel in this scenario is levied. */
  mills: number;
}

const NON_RESIDENTIAL = /^CID |^TAD /;

/** Rows that are structural rather than a place someone lives in. */
function isStructural(district: string): boolean {
  return (
    district.startsWith('COUNTY ') ||
    district === 'SCHOOL' ||
    district === 'STATE' ||
    district.startsWith('IND SCHOOL') ||
    district.includes('SSD') ||
    NON_RESIDENTIAL.test(district)
  );
}

/**
 * Every ordinary residential scenario in a county, unincorporated first.
 *
 * Empty when the county has no `COUNTY UNINCORPORATED` or `SCHOOL` row, which
 * is the same completeness bar `countywideMills` is held to — a partial total
 * would read as a cheap county.
 */
export function taxScenarios(districts: readonly DistrictRate[], county: string): TaxScenario[] {
  const rows = districts.filter((r) => r.county === county);
  const total = (d: string) => {
    const r = rows.find((x) => x.district === d);
    return r ? r.mo + r.bond : undefined;
  };

  const unincorporated = total('COUNTY UNINCORPORATED');
  const school = total('SCHOOL');
  const state = total('STATE') ?? 0;
  if (unincorporated === undefined || school === undefined) return [];

  const out: TaxScenario[] = [{ city: null, mills: unincorporated + school + state }];

  const incorporated = total('COUNTY INCORPORATED');
  if (incorporated === undefined) return out;

  const cities = rows.filter((r) => !isStructural(r.district) && r.mo + r.bond > 0);
  for (const row of cities) {
    // A district named after another district is a slice of it, and the report
    // does not say whether it replaces or adds — see the header.
    const isSubArea = cities.some(
      (other) => other !== row && row.district.startsWith(`${other.district} `),
    );
    if (isSubArea) continue;
    const cityMills = row.mo + row.bond;
    // The county's own service district for this city, where it runs one.
    const ssd = total(`COUNTY SSD - ${row.district}`) ?? 0;
    // An independent city school system REPLACES the county levy.
    const indSchool = total(`IND SCHOOL ${row.district}`);
    out.push({
      city: row.district,
      mills: incorporated + ssd + (indSchool ?? school) + state + cityMills,
    });
  }
  return out;
}

/** Lowest and highest ordinary scenario, with the place each belongs to. */
export function scenarioRange(
  scenarios: readonly TaxScenario[],
): { low: TaxScenario; high: TaxScenario } | undefined {
  if (scenarios.length === 0) return undefined;
  let low = scenarios[0] as TaxScenario;
  let high = scenarios[0] as TaxScenario;
  for (const s of scenarios) {
    if (s.mills < low.mills) low = s;
    if (s.mills > high.mills) high = s;
  }
  return { low, high };
}
