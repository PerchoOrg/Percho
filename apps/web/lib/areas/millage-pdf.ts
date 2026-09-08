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

/** Inflate every FlateDecode stream that carries text operators. */
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
      if (text.includes('Tj')) out.push(text);
    } catch {
      // Images, fonts and anything not Flate — not our business.
    }
    i = e + 'endstream'.length;
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
export function textItems(streams: readonly string[]): TextItem[] {
  const items: TextItem[] = [];
  let page = -1;
  const num = String.raw`(-?[\d.]+)`;
  const token = new RegExp(
    [
      String.raw`\((?<str>(?:\\.|[^\\()])*)\)\s*Tj`, // draw
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

      if (g.str !== undefined) {
        items.push({
          page: Math.max(page, 0),
          x: ctm.x + cursor.x,
          y: ctm.y + cursor.y,
          text: unescapePdf(g.str),
        });
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
