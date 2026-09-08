/**
 * Real property tax rates, from the Georgia Department of Revenue's own
 * annual millage report, into `area_metrics`.
 *
 * This replaces the estimates `seed-area-metrics.ts` wrote for
 * `property_tax_rate_pct`. Property tax is the single biggest line in the
 * Search tab's true-cost lens, and the buyer study named hidden carrying cost
 * as the #1 thing people discovered only after moving in — a made-up number
 * there is worse than no number.
 *
 * ── Why 2023 and not 2025 ──────────────────────────────────────────────────
 *
 * DOR publishes this yearly as a PDF. The 2024 and 2025 editions are typeset
 * with **Type3 fonts carrying no `/ToUnicode` CMap and no embedded font
 * program**, so the character codes map to glyph names like `/0 /1 /2` with
 * nothing to turn them back into letters. Text extraction from those two
 * returns either gibberish or, for 2024, literally zero characters — that is
 * a property of the files, not of the extractor, and no PDF library gets past
 * it. They would need OCR.
 *
 * 2023 is the most recent edition typeset with standard Type1 fonts and
 * WinAnsi encoding, so it extracts cleanly. Millage rates move by fractions of
 * a mill year to year; a two-year-old real rate is far closer to the truth
 * than the round guess it replaces, and every row says `as_of 2023-12-31` so
 * the age is visible rather than implied. Re-point `YEAR` when DOR publishes
 * a text-bearing edition again.
 *
 * ── Why there is no PDF dependency ─────────────────────────────────────────
 *
 * The file is FlateDecode'd standard Type1 text. Node's own `zlib` inflates
 * the content streams, and the text operators carry an x/y with every string,
 * which is enough to rebuild the table by row. That is ~60 lines here against
 * adding a PDF library for one script.
 *
 * ── What a "rate" means here ───────────────────────────────────────────────
 *
 * The report is one row per TAXING DISTRICT, not per county: a county line, a
 * school line, a state line, and one per city or special district. A specific
 * address pays the sum of the districts it sits in, which we cannot know from
 * a county centroid. What we publish is therefore the **unincorporated county
 * total** — county M&O + county bond + school M&O + school bond + state —
 * which is what a buyer looking at a subdivision outside city limits actually
 * pays, and is the honest county-wide figure. A home inside a city pays that
 * city's millage on top; the detail sheet says so.
 *
 * Georgia assesses at 40% of fair market value (O.C.G.A. § 48-5-7), statewide,
 * so `effective % = total mills × 0.40 / 10`. Two caveats worth knowing and
 * NOT modelled here: bona fide agricultural land is assessed at 30%, and
 * HB 581's floating homestead exemption caps assessed-value growth for an
 * owner-occupied home, so a long-time owner's effective rate drifts below
 * this. For a buyer pricing a purchase at today's market value, this figure is
 * the right one.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-ga-millage.ts
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-ga-millage.ts --apply
 *
 * DRY RUN BY DEFAULT.
 */

import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

const YEAR = 2023;
const SOURCE_URL =
  'https://dor.georgia.gov/document/document/2023-georgia-county-ad-valorem-tax-digest-millage-rates/download';
const SOURCE = `Georgia DOR ${YEAR} County Ad Valorem Tax Digest Millage Rates`;
const AS_OF = `${YEAR}-12-31`;

/** Statewide assessment ratio, O.C.G.A. § 48-5-7. */
const ASSESSMENT_RATIO = 0.4;

/** The counties the lens map covers — same list as the shape builder. */
const METRO_COUNTIES = new Set(
  [
    'Barrow',
    'Bartow',
    'Carroll',
    'Cherokee',
    'Clayton',
    'Cobb',
    'Coweta',
    'Dawson',
    'DeKalb',
    'Douglas',
    'Fayette',
    'Forsyth',
    'Fulton',
    'Gwinnett',
    'Hall',
    'Haralson',
    'Heard',
    'Henry',
    'Jackson',
    'Lamar',
    'Meriwether',
    'Morgan',
    'Newton',
    'Paulding',
    'Pickens',
    'Pike',
    'Rockdale',
    'Spalding',
    'Walton',
  ].map((n) => n.toUpperCase()),
);

/**
 * The district rows that make up what an unincorporated homeowner pays.
 *
 * `UNINCORPORATED` is the county's own levy outside any city. `SCHOOL` and
 * `STATE` apply everywhere in the county. Everything else in the report is a
 * city or a special district, which only some addresses are inside — those are
 * deliberately excluded rather than averaged, because an average of districts
 * a home is not in is not a rate anybody pays.
 */
const COUNTYWIDE_DISTRICTS = ['UNINCORPORATED', 'SCHOOL', 'STATE'];

interface TextItem {
  page: number;
  x: number;
  y: number;
  text: string;
}

/** Inflate every FlateDecode stream that carries text operators. */
function contentStreams(pdf: Buffer): string[] {
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
function unescapePdf(s: string): string {
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
function textItems(streams: readonly string[]): TextItem[] {
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

    let m: RegExpExecArray | null;
    token.lastIndex = 0;
    while ((m = token.exec(stream)) !== null) {
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

/** Same-row means same page and the same baseline within a hair. */
function rows(items: readonly TextItem[]): string[][] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const out: string[][] = [];
  let currentPage = -1;
  let currentY = Number.NaN;
  let row: string[] = [];
  for (const item of sorted) {
    if (item.page !== currentPage || Math.abs(item.y - currentY) > 2) {
      if (row.length > 0) out.push(row);
      row = [];
      currentPage = item.page;
      currentY = item.y;
    }
    row.push(item.text);
  }
  if (row.length > 0) out.push(row);
  return out;
}

interface DistrictRate {
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
function parseRow(cells: readonly string[]): DistrictRate | null {
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

async function main() {
  const pdfPath = process.env.MILLAGE_PDF;
  let pdf: Buffer;
  if (pdfPath && existsSync(pdfPath)) {
    pdf = readFileSync(pdfPath);
    console.log(`Reading ${pdfPath}`);
  } else {
    console.log(`Fetching ${SOURCE_URL}`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) {
      console.error(`DOR returned ${res.status}. Nothing written.`);
      process.exit(1);
    }
    pdf = Buffer.from(await res.arrayBuffer());
  }

  const parsed = rows(textItems(contentStreams(pdf)))
    .map(parseRow)
    .filter((r): r is DistrictRate => r !== null);
  console.log(`${parsed.length} district rows parsed.`);

  // Sum the county-wide districts. A county missing its UNINCORPORATED or
  // SCHOOL line is reported rather than published at a partial rate — a low
  // number here would read as a cheap county.
  const byCounty = new Map<string, Map<string, number>>();
  for (const r of parsed) {
    if (!METRO_COUNTIES.has(r.county)) continue;
    const which = COUNTYWIDE_DISTRICTS.find((d) => r.district.includes(d));
    if (!which) continue;
    const seen = byCounty.get(r.county) ?? new Map<string, number>();
    // First occurrence wins: some counties list a district twice with the
    // second as an incorporated variant.
    if (!seen.has(which)) seen.set(which, r.mo + r.bond);
    byCounty.set(r.county, seen);
  }

  const rowsOut: Record<string, unknown>[] = [];
  const incomplete: string[] = [];
  for (const [county, parts] of [...byCounty].sort()) {
    const missing = COUNTYWIDE_DISTRICTS.filter((d) => !parts.has(d));
    // STATE has been 0.000 statewide since 2016 and is often simply absent;
    // that is not a gap. A missing county or school levy is.
    if (missing.some((m) => m !== 'STATE')) {
      incomplete.push(`${county} (missing ${missing.join(', ')})`);
      continue;
    }
    const mills = [...parts.values()].reduce((a, b) => a + b, 0);
    const effectivePct = (mills * ASSESSMENT_RATIO) / 10;
    const name = county
      .split(/\s+/)
      .map((w) => w[0] + w.slice(1).toLowerCase())
      .join(' ')
      // The report spells it DEKALB; the shape file and every UI string say
      // DeKalb, and the key must match or the join silently drops the county.
      .replace(/^Dekalb$/, 'DeKalb');
    rowsOut.push({
      area_kind: 'county',
      state: 'GA',
      area_key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      area_name: name,
      metric: 'property_tax_rate_pct',
      value: Number(effectivePct.toFixed(3)),
      unit: 'percent',
      source: SOURCE,
      source_url: SOURCE_URL,
      as_of: AS_OF,
      estimated: false,
      detail: {
        total_mills: Number(mills.toFixed(3)),
        assessment_ratio: ASSESSMENT_RATIO,
        districts: Object.fromEntries(parts),
        basis:
          'Unincorporated county: county + school + state levies. A home inside a city pays that city’s millage on top.',
      },
    });
  }

  console.log(`\n${rowsOut.length} counties with a complete county-wide rate:`);
  for (const r of rowsOut) {
    console.log(
      `  ${String(r.area_name).padEnd(12)} ${String(r.value).padStart(6)}%  (${(r.detail as { total_mills: number }).total_mills} mills)`,
    );
  }
  if (incomplete.length > 0) {
    console.log(`\nSkipped (incomplete): ${incomplete.join('; ')}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN. Re-run with --apply to write.');
    return;
  }

  const envPath = new URL('../../.env.local', import.meta.url);
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase
    .from('area_metrics')
    .upsert(rowsOut, { onConflict: 'area_kind,state,area_key,metric' });
  if (error) {
    console.error(`upsert failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`\nWrote ${rowsOut.length} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
