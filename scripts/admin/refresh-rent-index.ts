/**
 * Refresh the ZIP-level rent index the ROI calculator reads (phase D).
 *
 * Source: Zillow Observed Rent Index — the public research CSVs, no key, no
 * account. Owner rule: free data first; this is the free source, and it is
 * the one the buyer study's "ROI calculator" ask can be honest about
 * ("typical single-family rent in this ZIP", not "this house rents for").
 *
 * ZIP-level ZORI is only published for ALL homes (SFR + condo + multifamily),
 * which under-states what a house rents for — Atlanta metro SFR runs ~25%
 * above the all-homes figure. Zillow does publish SFR-only at METRO level, so
 * each ZIP's figure is scaled by its metro's SFR/all-homes ratio (1.0 when
 * the metro is not matched). The result is a per-ZIP "typical single-family
 * rent" — still not a valuation of the specific home, which is why the app
 * shows it as an editable default.
 *
 * Output: `apps/web/data/rent-by-zip.json` — every ZIP in the file, latest
 * non-empty month, rounded to the dollar. ~8.5k ZIPs, ~110 KB. Read by
 * `apps/web/lib/listings/rent-index.ts` at request time.
 *
 * Run (from apps/web):  pnpm exec tsx ../../scripts/admin/refresh-rent-index.ts
 * Re-run monthly; Zillow publishes mid-month for the prior month.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'https://files.zillowstatic.com/research/public_csvs/zori/';
const ZIP_ALL = `${BASE}Zip_zori_uc_sfrcondomfr_sm_month.csv`;
const METRO_ALL = `${BASE}Metro_zori_uc_sfrcondomfr_sm_month.csv`;
const METRO_SFR = `${BASE}Metro_zori_uc_sfr_sm_month.csv`;
const OUT = resolve(import.meta.dirname, '../../apps/web/data/rent-by-zip.json');

export interface RentIndex {
  source: 'Zillow ZORI';
  /** Newest month column in the ZIP file, ISO date. */
  asOf: string;
  /** ZIP → typical single-family monthly rent, USD, rounded. Missing = no coverage. */
  zips: Record<string, number>;
}

/** Quote-aware split — metro names carry commas ("Atlanta, GA"). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** "Atlanta-Sandy Springs-Alpharetta, GA" / "Atlanta, GA" → "atlanta|GA". */
export function metroKey(name: string): string | null {
  const m = /^([^,-]+)[^,]*,\s*([A-Z]{2})$/.exec(name.trim());
  return m ? `${m[1]!.trim().toLowerCase()}|${m[2]}` : null;
}

interface Table {
  header: string[];
  rows: string[][];
}

function parse(csv: string): Table {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  return { header: splitCsvLine(lines[0] ?? ''), rows: lines.slice(1).map(splitCsvLine) };
}

/** Newest month with a value — a region can trail by a month or two. */
function latest(cells: string[], firstMonth: number): number | null {
  for (let i = cells.length - 1; i >= firstMonth; i--) {
    const v = Number.parseFloat(cells[i] ?? '');
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

function firstMonthCol(header: string[]): number {
  const i = header.findIndex((h) => /^\d{4}-\d{2}-\d{2}$/.test(h));
  if (i < 0) throw new Error('ZORI header not recognised');
  return i;
}

/** metroKey → latest value, from a metro-level file. */
export function metroLatest(csv: string): Map<string, number> {
  const t = parse(csv);
  const name = t.header.indexOf('RegionName');
  const first = firstMonthCol(t.header);
  const out = new Map<string, number>();
  for (const r of t.rows) {
    const key = metroKey(r[name] ?? '');
    const v = latest(r, first);
    if (key && v !== null) out.set(key, v);
  }
  return out;
}

export function buildRentIndex(
  zipCsv: string,
  metroAllCsv: string,
  metroSfrCsv: string,
): RentIndex {
  const all = metroLatest(metroAllCsv);
  const sfr = metroLatest(metroSfrCsv);
  const factorFor = (metro: string): number => {
    const key = metroKey(metro);
    const a = key ? all.get(key) : undefined;
    const s = key ? sfr.get(key) : undefined;
    return a && s ? s / a : 1;
  };

  const t = parse(zipCsv);
  const zipCol = t.header.indexOf('RegionName');
  const metroCol = t.header.indexOf('Metro');
  const first = firstMonthCol(t.header);
  if (zipCol < 0 || metroCol < 0) throw new Error('ZORI ZIP header not recognised');
  const asOf = t.header[t.header.length - 1] ?? '';

  const zips: Record<string, number> = {};
  for (const r of t.rows) {
    const zip = (r[zipCol] ?? '').padStart(5, '0');
    if (!/^\d{5}$/.test(zip)) continue;
    const v = latest(r, first);
    if (v === null) continue;
    zips[zip] = Math.round(v * factorFor(r[metroCol] ?? ''));
  }
  return { source: 'Zillow ZORI', asOf, zips };
}

async function text(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

async function main() {
  const [zip, metroAll, metroSfr] = await Promise.all([
    text(ZIP_ALL),
    text(METRO_ALL),
    text(METRO_SFR),
  ]);
  const index = buildRentIndex(zip, metroAll, metroSfr);
  mkdirSync(resolve(OUT, '..'), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(index)}\n`);
  console.log(`rent index: ${Object.keys(index.zips).length} ZIPs, as of ${index.asOf} → ${OUT}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
