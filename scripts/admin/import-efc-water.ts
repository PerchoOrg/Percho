/**
 * Water and sewer bills for the metro counties, from the Georgia rate survey.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * 28 of 29 counties carried a water figure I invented in phase200 —
 * "Percho estimate — pending sourced data" — with no source at all. DeKalb is
 * the one exception (phase230, read from the county's own 2026 sheet).
 *
 * Reading each remaining county's current rate sheet is not the blocker any
 * more; phase229's CID decoder largely solved that. The blocker is that most
 * counties publish no typical bill to check a reading against, so phase228's
 * rule bites: a bill built from a column I am 80% sure of is worse than a
 * flagged estimate. Cobb and Gwinnett both fail on exactly that.
 *
 * The UNC Environmental Finance Center and GEFA survey ~450 Georgia providers
 * and publish, per utility, the RESIDENTIAL BILL AT SET CONSUMPTION LEVELS —
 * including 4,000 gallons, the same volume DeKalb prices its published example
 * at. That is a real bill from a named source, which is strictly better than a
 * number I made up.
 *
 * ── Why these stay flagged as estimates ────────────────────────────────────
 *
 * The survey is January 2022. Water bills rise about 6% a year, so a 2022
 * figure understates 2026 by roughly a quarter. It is SOURCED but it is not
 * CURRENT, and using it as this month's cost is an estimate — a well-founded
 * one. So `estimated` stays true and the source names the survey and its year,
 * rather than dressing four-year-old data as today's.
 *
 * DeKalb keeps its 2026 figure. A buyer therefore sees DeKalb unmarked and the
 * rest marked, which is exactly the distinction that is real.
 *
 * ── The corroboration this rests on ────────────────────────────────────────
 *
 * The survey's DeKalb rows and my independent reading of DeKalb's 2026 sheet
 * agree on the escalation, from two different quantities:
 *
 *     standing charges   $9.92 (2022) → $12.48 (2026)   +5.9% a year
 *     bill at 4,000 gal $66.38 (2022) → $84.08 (2026)   +6.1% a year
 *
 * Two independent numbers landing within 0.3 points a year of each other is
 * what says the survey computes a bill the same way this project does — base
 * charges plus volumetric water plus volumetric sewer, inside-county
 * residential — rather than something that merely has the same units.
 *
 * ── Matching utilities to counties ─────────────────────────────────────────
 *
 * Strictly, and for a reason. The survey lists a city of **Forsyth** and a
 * **Forsyth County**; the city is in Monroe County, eighty miles away. Same for
 * the city of **Jackson**, which is in Butts County. A loose prefix match takes
 * whichever row comes first — my own exploration script did exactly that before
 * this was written. Only labels that name the county as a county are accepted.
 *
 * ── Counties with no sewer row ─────────────────────────────────────────────
 *
 * Nine counties have water but no county sewer utility, and they are the ones
 * phase220's USGS import already showed to be largely on wells and septic —
 * Pike, Morgan, Haralson, Walton, Pickens. That is not a hole in the survey; it
 * is the same fact arriving twice. Those counties get the water bill alone, and
 * `detail` says the sewer half is absent rather than zero.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-efc-water.ts
 *   ... --apply     to write
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { namesCounty } from '../../apps/web/lib/areas/county-names.js';
import { readXlsx } from '../../apps/web/lib/areas/xlsx.js';

const APPLY = process.argv.includes('--apply');

const XLSX = 'https://efc.sog.unc.edu/wp-content/uploads/sites/1172/2019/11/GA-rate-tables-2022.xlsx';
const SOURCE =
  'UNC Environmental Finance Center / GEFA Georgia water and wastewater rate survey, January 2022 — residential bill at 4,000 gallons, inside-county';
const AS_OF = '2022-01-01';
/** The volume the survey and DeKalb's published example both price. */
const BILLED_GALLONS = 4000;
/** Already sourced from the county's own current sheet — do not overwrite. */
const KEEP = new Set(['dekalb']);

/**
 * Counties served by a utility named for a CITY rather than for the county.
 *
 * `namesCounty` rejects city labels on purpose — a city of Forsyth is not
 * Forsyth County. But a few counties have no county-wide utility and are served
 * by their county seat's system, and refusing those leaves a real published
 * bill on the table in favour of a number I invented.
 *
 * The test is not "the city is in the county", it is **how much of the county
 * that utility actually serves** — the same question electricity answers with
 * territory coverage, answered here with the survey's own service-population
 * column against the county's population from the USGS import.
 *
 * Four candidates were located inside a gap county. Measured, only one is a
 * county-wide utility:
 *
 *     Hall        Gainesville  140,000 of 193,535  =  72%   ← kept
 *     Morgan      Madison        5,215 of  18,046  =  29%
 *     Meriwether  Manchester     5,343 of  21,190  =  25%
 *     Dawson      Dawsonville    2,424 of  23,312  =  10%
 *
 * The other three would price a whole county from a utility serving a tenth to
 * a quarter of it. Named individually rather than made general: this is one
 * county, and machinery for one case is machinery to keep working forever.
 */
const CITY_UTILITY: Record<string, { label: string; servesShare: number }> = {
  Hall: { label: 'Gainesville', servesShare: 0.72 },
};

/** Column indices on the residential-bills sheet, from its second header row. */
const COL = { label: 0, serviceType: 3, insideOutside: 4, at4000: 6 } as const;

interface Bill {
  county: string;
  water?: number;
  sewer?: number;
  providers: string[];
  /** Set only when the provider is a city utility, not a county-wide one. */
  servesShare?: number;
}

export function billsByCounty(rows: readonly string[][], counties: readonly string[]): Bill[] {
  const out: Bill[] = [];
  for (const county of counties) {
    const hits = rows.filter(
      (r) =>
        (r[COL.insideOutside] ?? '').trim().toLowerCase() === 'inside' &&
        namesCounty(r[COL.label] ?? '', county),
    );
    const pick = (type: string) => {
      const row = hits.find((r) => (r[COL.serviceType] ?? '').trim() === type);
      const v = row ? Number(row[COL.at4000]) : Number.NaN;
      return Number.isFinite(v) && v > 0 ? v : undefined;
    };
    const providers = [...new Set(hits.map((h) => (h[COL.label] ?? '').trim()))];
    let bill: Bill = { county, water: pick('Water'), sewer: pick('Sewer'), providers };

    // No county-wide water row: fall back to the county-seat utility, but only
    // where it was measured to serve most of the county.
    const city = CITY_UTILITY[county];
    if (bill.water === undefined && city) {
      const cityRows = rows.filter(
        (r) =>
          (r[COL.insideOutside] ?? '').trim().toLowerCase() === 'inside' &&
          (r[COL.label] ?? '').trim().toLowerCase() === city.label.toLowerCase(),
      );
      const cityPick = (type: string) => {
        const row = cityRows.find((r) => (r[COL.serviceType] ?? '').trim() === type);
        const v = row ? Number(row[COL.at4000]) : Number.NaN;
        return Number.isFinite(v) && v > 0 ? v : undefined;
      };
      const water = cityPick('Water');
      if (water !== undefined) {
        bill = {
          county,
          water,
          sewer: cityPick('Sewer'),
          providers: [city.label],
          servesShare: city.servesShare,
        };
      }
    }
    out.push(bill);
  }
  return out;
}

async function main() {
  const local = process.env.EFC_XLSX;
  let buf: Buffer;
  if (local && existsSync(local)) {
    console.log(`Reading ${local}`);
    buf = readFileSync(local);
  } else {
    console.log(`Fetching ${XLSX}`);
    const res = await fetch(XLSX);
    if (!res.ok) {
      console.error(`EFC returned ${res.status}. Nothing written.`);
      process.exit(1);
    }
    buf = Buffer.from(await res.arrayBuffer());
  }

  const shapes = JSON.parse(
    readFileSync(new URL('../../apps/web/data/metro-county-shapes.json', import.meta.url), 'utf8'),
  ) as { counties: { name: string; key: string }[] };

  const sheets = readXlsx(buf);
  const residential = sheets[1];
  if (!residential) throw new Error('the residential-bills sheet is missing');
  const header = residential.rows[1] ?? [];
  if (!/4,000 gallons/.test(header[COL.at4000] ?? '')) {
    throw new Error(
      `column ${COL.at4000} is "${header[COL.at4000]}", not the 4,000-gallon bill — the survey changed shape`,
    );
  }

  const bills = billsByCounty(residential.rows.slice(2), shapes.counties.map((c) => c.name));
  const byName = new Map(shapes.counties.map((c) => [c.name, c.key]));

  console.log(`\n${'county'.padEnd(12)}${'water'.padStart(8)}${'sewer'.padStart(8)}${'total'.padStart(8)}  provider`);
  const rowsOut: Record<string, unknown>[] = [];
  const noWater: string[] = [];
  const noSewer: string[] = [];
  for (const b of bills) {
    const key = byName.get(b.county);
    if (key && KEEP.has(key)) {
      console.log(`${b.county.padEnd(12)}${'—'.padStart(8)}${'—'.padStart(8)}${'kept'.padStart(8)}  already sourced from the county's own 2026 sheet`);
      continue;
    }
    if (b.water === undefined) {
      noWater.push(b.county);
      continue;
    }
    if (b.sewer === undefined) noSewer.push(b.county);
    const total = b.water + (b.sewer ?? 0);
    console.log(
      `${b.county.padEnd(12)}${b.water.toFixed(2).padStart(8)}${(b.sewer?.toFixed(2) ?? '—').padStart(8)}${total.toFixed(2).padStart(8)}  ${b.providers.join('; ').slice(0, 42)}`,
    );
    rowsOut.push({
      area_kind: 'county',
      state: 'GA',
      area_key: key,
      area_name: b.county,
      metric: 'water_monthly_usd',
      value: Math.round(total),
      unit: 'usd_per_month',
      source: SOURCE,
      source_url: XLSX,
      as_of: AS_OF,
      // Sourced, but four years old, and water bills rise about 6% a year.
      // Using it as this month's cost is an estimate — a founded one.
      estimated: true,
      detail: {
        billed_gallons: BILLED_GALLONS,
        water_usd: b.water,
        sewer_usd: b.sewer ?? null,
        has_county_sewer: b.sewer !== undefined,
        providers: b.providers,
        ...(b.servesShare === undefined ? {} : { provider_serves_share: b.servesShare }),
        basis:
          b.servesShare !== undefined
            ? `Water and sewer at 4,000 gallons a month from ${b.providers[0]}, which the survey records as serving about ${Math.round(b.servesShare * 100)}% of this county — there is no county-wide utility here. From the January 2022 GEFA/UNC rate survey, so it is a real published bill but not a current one.`
            : b.sewer === undefined
            ? 'Water only, at 4,000 gallons a month. This county has no county sewer utility in the survey, which matches its low share of homes on public supply — households here are largely on septic, so there is no sewer half to add rather than a sewer charge of zero.'
            : 'Water and sewer at 4,000 gallons a month, the volume the survey and DeKalb’s own published example both price. From the January 2022 GEFA/UNC rate survey, so it is a real published bill but not a current one — bills rise roughly 6% a year, which is why it stays flagged.',
      },
    });
  }

  if (noWater.length > 0) console.log(`\nNo water row, left as they were: ${noWater.join(', ')}`);
  if (noSewer.length > 0) console.log(`Water only (no county sewer utility): ${noSewer.join(', ')}`);
  console.log(`\n${rowsOut.length} counties would be written; ${KEEP.size} kept as already sourced.`);

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
