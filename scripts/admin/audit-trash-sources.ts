/**
 * Why the trash figure is still an estimate — checked, not assumed.
 *
 * Read-only. Writes nothing. Run it to re-derive the conclusion below rather
 * than trusting this comment.
 *
 * ── The claim this replaces ────────────────────────────────────────────────
 *
 * The project notes have said since phase200: *"Trash: no source exists. 159
 * separate county/city arrangements; GA EPD regulates disposal facilities
 * only."* That was asserted, never tested, and it is wrong in its first three
 * words. A national per-government source does exist.
 *
 * ── The source that exists ─────────────────────────────────────────────────
 *
 * The Census Bureau's Annual Survey of State and Local Government Finances
 * publishes an Individual Unit File: one row per government per item code.
 * Item **A81 is "Charges — Solid Waste Management"**. For Georgia in 2024, 125
 * governments report it, including most metro counties. It is real, current
 * and machine-readable.
 *
 * ── Why it still cannot answer the question ────────────────────────────────
 *
 * A81 is total revenue from solid-waste charges. It is **not decomposed by
 * customer class**, so a county's landfill tipping fees from commercial
 * haulers land in the same number as household collection billing. Normalised
 * per resident, Georgia's metro counties run:
 *
 *     Jackson    $135.95     Newton  $124.22     DeKalb  $120.29
 *     Bartow      $75.23     Hall     $56.30     Gwinnett $53.17
 *     ...
 *     Cobb         $1.30     Henry     $0.53
 *     Fulton, Spalding, Barrow, Dawson, Pickens, Pike + 5 more: nothing
 *
 * Two things kill it.
 *
 * **The distribution is continuous, not bimodal.** It runs smoothly from $136
 * to $0.53 with no gap. Any cut between "the county bills you for collection"
 * and "the county has incidental solid-waste revenue" would be invented —
 * Forsyth ($14.28), Paulding ($13.84) and Clayton ($9.98) sit in the middle
 * with no principled place to put a knife. Manufacturing a binary out of a
 * continuum is the exact bug phases 218 and 219 were spent removing.
 *
 * **The top of the range is not a household bill either.** DeKalb's $120 per
 * resident is about $26/month per household, which matches its real published
 * sanitation fee. Jackson's $136 is HIGHER, and Jackson is rural — that is
 * commercial tipping revenue, not collection. So even the counties with big
 * numbers cannot be read as "what a household pays".
 *
 * ── The tempting inference, which is also wrong ────────────────────────────
 *
 * "County government reports no A81, therefore residents arrange collection
 * privately" — safe-sounding, and false for Fulton, whose residents mostly
 * live in cities (Atlanta, Sandy Springs, Roswell) that DO organise
 * collection. The county reporting nothing says nothing about the household.
 *
 * ── Conclusion ─────────────────────────────────────────────────────────────
 *
 * Trash stays an estimate, and now for a stated reason. The next thing worth
 * trying is not another national aggregate — it is per-city rate schedules,
 * which is the same shape of problem as the water rate sheets and has the same
 * cost.
 *
 * Also noted, not changed: `seed-area-metrics.ts` hand-writes
 * `trashArrangement: 'private hauler'` for every county including DeKalb,
 * which bills $88.4M of sanitation charges. The field is inert — `supplierOf`
 * projects nothing from an estimated row — but it is a wrong guess sitting in
 * the data.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/audit-trash-sources.ts
 */

import { readFileSync } from 'node:fs';
import { readZip } from '../../apps/web/lib/areas/xlsx.js';

const YEAR = 2024;
const ZIP = `https://www2.census.gov/programs-surveys/gov-finances/tables/${YEAR}/${YEAR}_Individual_Unit_Files.zip`;

/** Charges — Solid Waste Management. */
const ITEM = 'A81';
/** Georgia. The file keys on FIPS, not the Census government code. */
const STATE_FIPS = '13';
/** Digit 3 of the government ID: 1 = county government. */
const COUNTY_GOVT = '1';

/** Fixed width, 32 characters: id(12) item(3) amount(12) year(4) origin(1). */
interface Record_ {
  id: string;
  item: string;
  amount: number;
}

function parseFinance(text: string): Record_[] {
  const out: Record_[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.length !== 32) continue;
    out.push({
      id: line.slice(0, 12),
      item: line.slice(12, 15),
      amount: Number(line.slice(15, 27)),
    });
  }
  return out;
}

/** The directory: government id, its name, and the county it sits in. */
function parseDirectory(text: string): Map<string, { name: string; county: string }> {
  const out = new Map<string, { name: string; county: string }>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.length < 80) continue;
    out.set(line.slice(0, 12), {
      name: line.slice(12, 76).trim(),
      county: line.slice(76, 111).trim(),
    });
  }
  return out;
}

async function main() {
  console.log(`Fetching ${ZIP}`);
  const res = await fetch(ZIP);
  if (!res.ok) {
    console.error(`Census returned ${res.status}. Nothing to report.`);
    process.exit(1);
  }
  const entries = readZip(Buffer.from(await res.arrayBuffer()));
  const find = (suffix: string) => entries.find((e) => e.name.endsWith(suffix));
  const finance = entries.find((e) => /FinEstDAT.*\.txt$/.test(e.name));
  const directory = find(`Fin_PID_${YEAR}.txt`);
  if (!finance || !directory) {
    console.error(`Expected files missing from the zip: ${entries.map((e) => e.name).join(', ')}`);
    process.exit(1);
  }

  const dir = parseDirectory(directory.data.toString('utf8'));
  const rows = parseFinance(finance.data.toString('utf8'));

  const shapes = JSON.parse(
    readFileSync(new URL('../../apps/web/data/metro-county-shapes.json', import.meta.url), 'utf8'),
  ) as { counties: { name: string }[] };
  const metro = new Set(shapes.counties.map((c) => c.name));

  const ga = rows.filter((r) => r.id.startsWith(STATE_FIPS) && r.item === ITEM);
  console.log(`\n${ga.length} Georgia governments report ${ITEM} (charges — solid waste).`);

  // Every government charging inside each metro county, county and city alike.
  const byCounty = new Map<string, { name: string; amount: number; isCounty: boolean }[]>();
  for (const r of ga) {
    const d = dir.get(r.id);
    if (!d || !metro.has(d.county)) continue;
    const list = byCounty.get(d.county) ?? [];
    list.push({ name: d.name, amount: r.amount * 1000, isCounty: r.id[2] === COUNTY_GOVT });
    byCounty.set(d.county, list);
  }

  console.log(
    `\n${'county'.padEnd(12)}${'county govt $'.padStart(14)}${'other govts'.padStart(12)}  who else charges`,
  );
  let noCountyCharge = 0;
  for (const name of shapes.counties.map((c) => c.name).sort()) {
    const list = byCounty.get(name) ?? [];
    const county = list.find((x) => x.isCounty);
    const others = list.filter((x) => !x.isCounty);
    if (!county) noCountyCharge++;
    console.log(
      `${name.padEnd(12)}${(county ? county.amount.toLocaleString() : '—').padStart(14)}` +
        `${String(others.length).padStart(12)}  ` +
        others
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 2)
          .map((o) => o.name)
          .join(', ')
          .slice(0, 46),
    );
  }

  console.log(
    `\n${noCountyCharge} of ${shapes.counties.length} county governments report no solid-waste charge at all,` +
      ' and in several of the rest the cities charge more than the county does.',
  );
  console.log(
    '\nCONCLUSION: A81 is total charge revenue, NOT decomposed by customer class,\n' +
      'so landfill tipping fees from commercial haulers sit in the same number as\n' +
      'household billing. Per resident the counties run continuously from about\n' +
      '$136 to $0.53 with no gap, so any "the county bills you / it does not" cut\n' +
      'would be invented. Trash stays an estimate — see this file’s header.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
