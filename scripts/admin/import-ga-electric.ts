/**
 * A real electric bill per county, from who actually serves it and what they
 * actually charge.
 *
 * Replaces the seeded `electric_monthly_usd` estimate, which was a round
 * number beside a hand-written provider name — and several of those names were
 * simply wrong. Gwinnett, Hall, Barrow and Jackson were all recorded as
 * Jackson EMC and are 68–97% Georgia Power; Cherokee was recorded as Cobb EMC
 * and is 57% Amicalola, with Cobb EMC fourth at 12%. Service territories were
 * drawn by who electrified which farms in the 1930s and have nothing to do
 * with county lines.
 *
 * ── The two halves ─────────────────────────────────────────────────────────
 *
 *   WHO   the HIFLD retail service territories, area-weighted against our own
 *         county shapes by `lib/areas/territory.ts`. A provider is named only
 *         when it covers a majority of the county; Cobb (Cobb EMC 41%, Georgia
 *         Power 39%) and Henry (Snapping Shoals 47%) honestly have no single
 *         answer and are left as estimates rather than assigned one.
 *
 *   HOW   NREL/OpenEI's utility rate tables, which publish an average
 *   MUCH  residential $/kWh per utility, keyed by the same EIA utility id.
 *
 * ── Why not the published tariff ───────────────────────────────────────────
 *
 * Georgia Power's residential tariff (Schedule R-31) is fetchable and parses
 * cleanly, and its energy charge is 8.21¢/kWh winter. That is not the bill.
 * The tariff says so itself: the amount "will be increased under the
 * provisions of" Fuel Cost Recovery, Environmental Compliance Cost Recovery,
 * the Demand Side Management schedule and the Municipal Franchise Fee. Four
 * riders, each its own schedule and none of them in the tariff PDF. Georgia
 * Power's all-in average residential rate is 14.6¢/kWh, so the winter energy
 * charge alone is a little over half of what a customer pays. An average of
 * revenue over sales carries every rider by construction, which is why it is
 * the source here and the tariff is not.
 *
 * ── Why a standard consumption rather than each utility's own ──────────────
 *
 * The bill is `STATE_MONTHLY_KWH × the county's rate`, not each utility's own
 * average bill. What varies between counties, and what a buyer is choosing
 * between, is the PRICE of electricity. A utility's own average bill also
 * carries its customer mix: one serving mostly apartments looks cheap in a way
 * that tells a buyer of a house nothing. Holding consumption constant makes
 * the lens compare the thing that actually differs, and the assumption is
 * stated on the figure.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-ga-electric.ts
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-ga-electric.ts --apply
 *
 * DRY RUN BY DEFAULT.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  type PolygonLike,
  blend,
  coverage,
  prepare,
} from '../../apps/web/lib/areas/territory.js';
import { readXlsx, readZip } from '../../apps/web/lib/areas/xlsx.js';

const APPLY = process.argv.includes('--apply');

/** HIFLD Electric Retail Service Territories, via the mirror that still
 *  serves it — the official endpoint went down with HIFLD Open. Pulled once
 *  and read here; nothing depends on it at runtime. */
const TERRITORY_URL =
  "https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0/query?where=STATE%3D'GA'&outFields=NAME,TYPE,CUSTOMERS,YEAR&returnGeometry=true&outSR=4326&f=geojson";

/**
 * EIA-861, the annual release — the primary source, and one year newer than
 * the OpenEI tables this used to read.
 *
 * `Sales_Ult_Cust_<year>.xlsx` carries residential Revenues (thousand $),
 * Sales (MWh) and Customers per utility per state, so the rate is
 * `revenue / sales`: money actually collected over energy actually delivered,
 * which carries every rider by construction. That is the same property that
 * ruled out Georgia Power's published tariff, obtained from the body that
 * collects the numbers rather than from a redistribution of them.
 */
const EIA_861_URL = 'https://www.eia.gov/electricity/data/eia861/zip/f8612024.zip';

/**
 * The vintage is READ FROM THE FILE, not declared beside it.
 *
 * There used to be a `const EIA_YEAR = 2024` next to the URL — two independent
 * statements of one fact, and changing the URL to `f8612025.zip` without
 * changing the constant would have stamped every county's rate with the wrong
 * year while nothing complained. phase243 is the same shape: a vintage that is
 * asserted rather than derived cannot tell you when it is wrong.
 *
 * The workbook carries a `Data Year` column, so the year comes from there and
 * the URL is checked against it. Three statements existed; now there is one
 * source and one guard.
 */
function yearInUrl(url: string): number | undefined {
  const m = /f861(\d{4})\.zip/.exec(url);
  return m?.[1] ? Number(m[1]) : undefined;
}

/**
 * NREL/OpenEI's redistribution of the same figures, a year older.
 *
 * Kept as a CROSS-CHECK on every run rather than as the source. Two
 * independently-derived numbers landing within a few percent is the only
 * evidence available that either is right; when they diverge sharply, one of
 * them has changed shape and a run should say so rather than publish quietly.
 */
const CROSS_CHECK_URLS = [
  'https://data.openei.org/files/6225/iou_zipcodes_2023.csv',
  'https://data.openei.org/files/6225/non_iou_zipcodes_2023.csv',
];

/** Past this, the two sources are not describing the same thing any more. */
const CROSS_CHECK_TOLERANCE = 0.15;

const rateSourceFor = (year: number) => `EIA-861 ${year}, residential revenue ÷ sales`;
const TERRITORY_SOURCE =
  'HIFLD Electric Retail Service Territories (2022), area-weighted against county boundaries';


/**
 * Georgia's average residential consumption.
 *
 * **Verified against the primary source on 2026-09-08**, not taken on report:
 * EIA Table 5.A, `eia.gov/electricity/sales_revenue_price/xls/table_5A.xlsx`,
 * "2024 Average Monthly Bill — Residential", built from forms EIA-861. Its
 * Georgia row reads:
 *
 *   Number of Customers                4,815,501
 *   Average Monthly Consumption (kWh)  1074.0134
 *   Average Price (cents/kWh)          14.0825
 *   Average Monthly Bill               $151.248
 *
 * Read with `apps/web/lib/areas/xlsx.ts`, which exists because this figure
 * multiplies EVERY county's electric bill and was worth checking rather than
 * inheriting. Note the internal consistency: 1074.0134 × $0.140825 = $151.25.
 *
 * Held constant across counties on purpose — see the header.
 */
const STATE_MONTHLY_KWH = 1074;

/**
 * Rated providers must cover at least this much of a county to publish it.
 *
 * This replaces a `MIN_SHARE = 0.5` gate on the LARGEST provider's share,
 * which asked the wrong question. "Does one utility own half the county" is a
 * fact about concentration, not about how well we know the price: it published
 * Fulton at 55% as sourced while leaving Henry at 47% an unsourced guess,
 * though the figure for Fulton ignored 45% of the county either way. Cobb, at
 * 41/38, has no honest answer to "who is THE provider" and a perfectly good
 * answer to "what does electricity cost here".
 *
 * The question that does bear on confidence is how much of the county we have
 * a real rate for at all.
 */
const MIN_COVERED = 0.5;

interface Feature {
  properties: { NAME: string; TYPE: string; CUSTOMERS?: number };
  geometry: PolygonLike;
}

/** Utility name, upper-cased and stripped of the decoration each source adds
 *  differently — HIFLD writes `JACKSON ELECTRIC MEMBER CORP - (GA)`, OpenEI
 *  writes `Jackson Electric Member Corp - (GA)`, and one of them will
 *  eventually drop the suffix. */
function normalizeUtility(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s*-\s*\(GA\)\s*$/, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Average residential $/kWh per utility, from EIA-861's own figures. */
async function fetchRates(): Promise<{
  rates: Map<string, { rate: number; name: string }>;
  year: number;
}> {
  const local = process.env.EIA_861_ZIP;
  let zip: Buffer;
  if (local && existsSync(local)) {
    console.log(`Reading ${local}`);
    zip = readFileSync(local);
  } else {
    console.log(`Fetching ${EIA_861_URL}`);
    const res = await fetch(EIA_861_URL);
    if (!res.ok) throw new Error(`${EIA_861_URL} returned ${res.status}`);
    zip = Buffer.from(await res.arrayBuffer());
  }

  const sales = readZip(zip).find((e) => /^Sales_Ult_Cust_\d+\.xlsx$/.test(e.name));
  if (!sales) throw new Error('EIA-861 archive has no Sales_Ult_Cust file');
  const [sheet] = readXlsx(sales.data);
  if (!sheet) throw new Error(`${sales.name} has no worksheets`);

  // The header is two rows deep and its position moved between the 2024 and
  // 2025 editions, so it is FOUND rather than assumed: the row naming
  // "Utility Name" is the header, and residential Revenues/Sales/Customers are
  // the three columns beginning three past State.
  const headerAt = sheet.rows.findIndex((r) => r.includes('Utility Name'));
  if (headerAt < 0) throw new Error(`${sales.name}: no header row naming "Utility Name"`);
  const header = sheet.rows[headerAt] ?? [];
  const iName = header.indexOf('Utility Name');
  const iState = header.indexOf('State');
  if (iName < 0 || iState < 0) throw new Error(`${sales.name}: header is missing a column`);
  const iRevenue = iState + 3;
  const iYear = header.indexOf('Data Year');
  if (iYear < 0) throw new Error(`${sales.name}: no "Data Year" column to take the vintage from`);
  const group = sheet.rows[headerAt - 1]?.slice(iRevenue, iRevenue + 3) ?? [];
  if (group[0] !== 'Revenues' || group[1] !== 'Sales') {
    throw new Error(
      `${sales.name}: expected Revenues/Sales at ${iRevenue}, found ${JSON.stringify(group)}`,
    );
  }

  // A utility can appear more than once per state — bundled vs delivery-only,
  // and split filings — so revenue and sales are SUMMED before dividing.
  // Taking the first row instead silently prices a utility on part of itself.
  const totals = new Map<string, { name: string; revenue: number; mwh: number }>();
  const seenYears: number[] = [];
  for (const row of sheet.rows.slice(headerAt + 1)) {
    if (row[iState] !== 'GA') continue;
    const name = row[iName]?.trim();
    const revenue = Number(row[iRevenue]);
    const mwh = Number(row[iRevenue + 1]);
    if (!name || !Number.isFinite(revenue) || !Number.isFinite(mwh)) continue;
    const key = normalizeUtility(name);
    const rowYear = Number(row[iYear]);
    if (Number.isFinite(rowYear)) seenYears.push(rowYear);
    const cur = totals.get(key) ?? { name, revenue: 0, mwh: 0 };
    cur.revenue += revenue;
    cur.mwh += mwh;
    totals.set(key, cur);
  }

  const out = new Map<string, { rate: number; name: string }>();
  for (const [key, t] of totals) {
    if (t.mwh <= 0) continue;
    // Thousand dollars over MWh is already dollars per kWh.
    out.set(key, { rate: t.revenue / t.mwh, name: t.name });
  }

  // One year across every row we used, or the file is not what we think.
  const years = [...new Set(seenYears)];
  if (years.length !== 1 || years[0] === undefined) {
    throw new Error(`${sales.name}: expected one Data Year, found ${JSON.stringify(years)}`);
  }
  const year = years[0];
  const fromUrl = yearInUrl(EIA_861_URL);
  if (fromUrl !== undefined && fromUrl !== year) {
    throw new Error(
      `the URL says ${fromUrl} and the file says ${year}. One of them is stale — nothing written.`,
    );
  }
  console.log(`\nEIA-861 data year, from the file's own column: ${year}`);
  return { rates: out, year };
}

/**
 * OpenEI's older redistribution of the same data, for comparison only.
 *
 * Returns an empty map rather than failing the run: a cross-check that can
 * block publishing real data is a liability, not a safeguard.
 */
async function fetchCrossCheck(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const url of CROSS_CHECK_URLS) {
    const local = process.env.OPENEI_DIR
      ? `${process.env.OPENEI_DIR}/${url.split('/').pop()}`
      : undefined;
    let csv: string;
    try {
      if (local && existsSync(local)) csv = readFileSync(local, 'utf8');
      else {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        csv = await res.text();
      }
    } catch (err) {
      console.warn(`  cross-check unavailable (${url}): ${(err as Error).message}`);
      continue;
    }
    const lines = csv.split('\n');
    // CRLF: every last cell carries a trailing \r, including `res_rate`.
    const header = (lines[0] ?? '').split(',').map((h) => h.trim());
    const iState = header.indexOf('state');
    const iName = header.indexOf('utility_name');
    const iRes = header.indexOf('res_rate');
    if (iState < 0 || iName < 0 || iRes < 0) continue;
    for (let i = 1; i < lines.length; i++) {
      const c = (lines[i] ?? '').split(',');
      if (c[iState] !== 'GA') continue;
      const name = c[iName]?.trim();
      const rate = Number(c[iRes]?.trim());
      if (!name || !Number.isFinite(rate) || rate <= 0) continue;
      const key = normalizeUtility(name);
      if (!out.has(key)) out.set(key, rate);
    }
  }
  return out;
}

async function main() {
  const shapes = JSON.parse(
    readFileSync(new URL('../../apps/web/data/metro-county-shapes.json', import.meta.url), 'utf8'),
  ) as { counties: { name: string; key: string; rings: [number, number][][] }[] };

  const localTerritory = process.env.GA_TERRITORY;
  let territoryJson: string;
  if (localTerritory && existsSync(localTerritory)) {
    console.log(`Reading ${localTerritory}`);
    territoryJson = readFileSync(localTerritory, 'utf8');
  } else {
    console.log('Fetching service territories…');
    const res = await fetch(TERRITORY_URL);
    if (!res.ok) {
      console.error(`Territories returned ${res.status}. Nothing written.`);
      process.exit(1);
    }
    territoryJson = await res.text();
  }
  const { features } = JSON.parse(territoryJson) as { features: Feature[] };
  console.log(`${features.length} Georgia service territories.`);

  const { rates, year: eiaYear } = await fetchRates();
  console.log(`${rates.size} Georgia utilities with a published residential rate.`);

  // Two independently-derived numbers landing close is the only evidence
  // available that either is right. Reported, never enforced.
  const crossCheck = await fetchCrossCheck();
  const divergent: string[] = [];
  for (const [key, r] of rates) {
    const other = crossCheck.get(key);
    if (other === undefined) continue;
    const delta = (r.rate - other) / other;
    if (Math.abs(delta) > CROSS_CHECK_TOLERANCE) {
      divergent.push(
        `${r.name}: EIA ${(r.rate * 100).toFixed(2)}¢ vs OpenEI ${(other * 100).toFixed(2)}¢ (${(delta * 100).toFixed(0)}%)`,
      );
    }
  }
  const compared = [...rates.keys()].filter((k) => crossCheck.has(k)).length;
  console.log(
    divergent.length === 0
      ? `Cross-check: ${compared} utilities agree with OpenEI within ${(CROSS_CHECK_TOLERANCE * 100).toFixed(0)}%.`
      : `Cross-check: ${divergent.length} of ${compared} diverge by more than ${(CROSS_CHECK_TOLERANCE * 100).toFixed(0)}%:\n  ${divergent.join('\n  ')}`,
  );

  const territories = prepare(
    features.map((f) => ({ value: f.properties.NAME, geometry: f.geometry })),
  );

  const rowsOut: Record<string, unknown>[] = [];
  const split: string[] = [];
  const noRate: string[] = [];

  console.log('\ncounty       largest provider              share/n    ¢/kWh   $/mo');
  for (const county of shapes.counties) {
    const area: PolygonLike = {
      type: 'MultiPolygon',
      coordinates: county.rings.map((r) => [r]),
    };
    const result = coverage(area, territories, 60);
    const mix = blend(result, (name) => rates.get(normalizeUtility(name))?.rate);
    if (!mix) {
      noRate.push(`${county.name} (${result.shares[0]?.value ?? 'no territory'})`);
      continue;
    }
    // Every county the old code published, it published at its top provider's
    // rate. Kept only to report how far the blend moves each one.
    const top = result.shares[0];
    const topRate = top ? rates.get(normalizeUtility(top.value))?.rate : undefined;
    if (mix.covered < MIN_COVERED) {
      split.push(
        `${county.name} (rated providers cover only ${(mix.covered * 100).toFixed(0)}%)`,
      );
      continue;
    }
    const monthly = Math.round(STATE_MONTHLY_KWH * mix.value);
    const wasMonthly = topRate ? Math.round(STATE_MONTHLY_KWH * topRate) : undefined;
    const lead = mix.parts[0];
    const moved =
      wasMonthly !== undefined && wasMonthly !== monthly
        ? `  was $${wasMonthly}`
        : '';
    console.log(
      `  ${county.name.padEnd(11)} ${String(lead?.value ?? '').slice(0, 26).padEnd(27)} ${((lead?.share ?? 0) * 100).toFixed(0).padStart(3)}% of ${mix.parts.length}  ${(mix.value * 100).toFixed(2).padStart(6)}  $${String(monthly).padStart(4)}${moved}`,
    );
    rowsOut.push({
      area_kind: 'county',
      state: 'GA',
      area_key: county.key,
      area_name: county.name,
      metric: 'electric_monthly_usd',
      value: monthly,
      unit: 'usd_per_month',
      source: `${rateSourceFor(eiaYear)}; provider by ${TERRITORY_SOURCE}`,
      source_url: EIA_861_URL,
      as_of: `${eiaYear}-12-31`,
      estimated: false,
      detail: {
        providers: mix.parts.map((p) => ({
          name: p.value,
          share: Number(p.share.toFixed(3)),
          rate_usd_per_kwh: p.weight,
        })),
        provider_count: mix.parts.length,
        covered_share: Number(mix.covered.toFixed(3)),
        rate_usd_per_kwh: Number(mix.value.toFixed(5)),
        assumed_monthly_kwh: STATE_MONTHLY_KWH,
        basis:
          'Georgia’s average residential consumption at the area-weighted average of the residential rates charged across this county. Most counties are served by more than one utility, so naming a single “the” provider would put a rate on the bill of everyone who does not buy from it. Consumption is held constant across counties so the figure compares the price of electricity, which is what differs, rather than local customer mix. Area is a proxy for customers, not a substitute: a utility serving the denser half of a county has more customers than its acreage implies.',
      },
    });
  }

  if (split.length > 0) {
    console.log(`\nToo little of the county has a known rate, left as an estimate:\n  ${split.join('\n  ')}`);
  }
  if (noRate.length > 0) {
    console.log(`\nNo published rate, left as an estimate:\n  ${noRate.join('\n  ')}`);
  }
  console.log(`\n${rowsOut.length} of ${shapes.counties.length} counties get a real figure.`);

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
