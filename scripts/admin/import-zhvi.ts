/**
 * Cut Zillow's Home Value Index down to what the community pages draw:
 * one value a year for every Georgia city, and the same for metro Atlanta.
 *
 * Source: Zillow Research's public files (typical home value, all homes,
 * smoothed and seasonally adjusted, middle tier):
 *   https://files.zillowstatic.com/research/public_csvs/zhvi/City_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv
 *   https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv
 * Zillow asks for attribution wherever the figures are shown; the pages name
 * it in their source line.
 *
 * The city file is ~90 MB and changes monthly, so it is not in the repo. What
 * is: `data/zhvi-ga.json`, ~200 KB — the newest month and the same month of the
 * ten years before it, per city. A year-over-year line needs no more, and a
 * diff of that file is a readable account of what changed.
 *
 * No database, no network. Usage:
 *   curl -sO <city url> && curl -sO <metro url>
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-zhvi.ts City_zhvi_….csv Metro_zhvi_….csv
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZhviExtract } from '../../apps/web/lib/communities/profile-build.js';

const METRO = 'Atlanta, GA';
const YEARS = 11;

/** One CSV line, honouring quoted fields ("Atlanta-Sandy Springs-Alpharetta, GA"). */
function cells(line: string): string[] {
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

function table(path: string): { header: string[]; rows: string[][] } {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = cells(lines[0] ?? '');
  return { header, rows: lines.slice(1).map(cells) };
}

/** The newest month's column and the same month of each earlier year, oldest first. */
function yearlyColumns(header: string[]): { year: number; index: number }[] {
  const dated = header
    .map((h, index) => ({ h, index }))
    .filter(({ h }) => /^\d{4}-\d{2}-\d{2}$/.test(h));
  const newest = dated[dated.length - 1];
  if (!newest) throw new Error('no dated columns');
  const month = newest.h.slice(5, 7);
  const latestYear = Number(newest.h.slice(0, 4));
  const out: { year: number; index: number }[] = [];
  for (let year = latestYear - YEARS + 1; year <= latestYear; year++) {
    const col = dated.find(({ h }) => h.startsWith(`${year}-${month}`));
    if (col) out.push({ year, index: col.index });
  }
  return out;
}

function series(row: string[], cols: { year: number; index: number }[]) {
  return cols
    .map(({ year, index }) => ({ year, value: Math.round(Number(row[index])) }))
    .filter((p) => Number.isFinite(p.value) && p.value > 0);
}

function main() {
  const [cityPath, metroPath] = process.argv.slice(2);
  if (!cityPath || !metroPath) {
    console.error('Usage: import-zhvi.ts <City_zhvi csv> <Metro_zhvi csv>');
    process.exit(1);
  }

  const city = table(cityPath);
  const at = (name: string) => city.header.indexOf(name);
  const cols = yearlyColumns(city.header);
  const newest = city.header[cols[cols.length - 1]?.index ?? -1] ?? '';
  const cities = city.rows
    .filter((r) => r[at('State')] === 'GA')
    .map((r) => ({
      city: r[at('RegionName')] ?? '',
      county: (r[at('CountyName')] ?? '').replace(/ County$/, ''),
      metroAtlanta: (r[at('Metro')] ?? '').startsWith('Atlanta'),
      series: series(r, cols),
    }))
    .filter((c) => c.city && c.series.length >= 6)
    .sort((a, b) => a.city.localeCompare(b.city));

  const metro = table(metroPath);
  const metroRow = metro.rows.find((r) => r[metro.header.indexOf('RegionName')] === METRO);
  if (!metroRow) throw new Error(`no "${METRO}" row in ${metroPath}`);

  const extract: ZhviExtract = {
    asOf: newest,
    metro: { name: 'Metro Atlanta', series: series(metroRow, yearlyColumns(metro.header)) },
    cities,
  };
  const out = join(dirname(fileURLToPath(import.meta.url)), 'data', 'zhvi-ga.json');
  writeFileSync(out, `${JSON.stringify(extract)}\n`);
  console.log(
    `${cities.length} Georgia cities (${cities.filter((c) => c.metroAtlanta).length} in metro Atlanta), as of ${newest} → ${out}`,
  );
}

main();
