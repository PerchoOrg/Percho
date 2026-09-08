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
 * `namesCounty` rejects bare city labels on purpose — a city of Forsyth is not
 * Forsyth County. But a few counties have no county-wide utility and are served
 * by their county seat's system, and refusing those leaves a real published
 * bill on the table in favour of a number I invented.
 *
 * ── The denominator, corrected ─────────────────────────────────────────────
 *
 * phase233 asked what share of the COUNTY'S POPULATION the utility serves, and
 * that is the wrong question. A water bill applies to households that have one;
 * in Lamar County 57% of people are on a private well and will never see this
 * figure at all — which the well-share note beside it already says. Measuring
 * against everyone penalises a county for its wells twice.
 *
 * The question is what share of the county's PUBLIC-SUPPLY population the
 * utility serves. That is the same correction electricity already makes, where
 * coverage is renormalised over the providers that have a rate rather than
 * counting unrated ground against them. The public-supply share comes from the
 * USGS import (phase220).
 *
 *     county      utility        serves   of county   of billed households
 *     Hall        Gainesville   140,000        72%          90%   ← kept
 *     Lamar       Barnesville     6,755        37%          87%   ← added
 *     Morgan      Madison         5,215        29%          67%   ← added
 *     Meriwether  Manchester      5,343        25%          49%
 *     Dawson      Dawsonville     2,424        10%          15%
 *
 * Meriwether sits one point under the bar, and it would be dishonest to lean on
 * that. The reason it is refused is not the threshold: its five surveyed
 * systems charge between $32.40 and $55.10, a seventy per cent spread, so no
 * single one of them represents the county whatever the arithmetic says.
 * Dawson fails on both counts.
 *
 * ── Counties with no single representative system ──────────────────────────
 *
 * Meriwether was refused above because its largest system serves 49% of billed
 * households and its five systems charge between $32.40 and $55.10. Refusing to
 * pick one of them was right. Refusing to use ANY of them was not: **blending
 * all five, weighted by the population each serves, is the same answer
 * electricity already gives** when no provider owns a county — phase219 argued
 * that at length and it applies here unchanged.
 *
 *     water   $38.09   5 systems, 95% of billed households
 *     sewer   $37.67   4 systems, 83%  (Luthersville files no sewer rate)
 *     total   $75.76   against the $56 I had invented — 35% low
 *
 * So an entry is a LIST of labels, and the single-town counties above are the
 * degenerate case of it rather than a separate mechanism. Each component is
 * renormalised over the systems that publish it, which is why sewer is
 * weighted across four and water across five.
 *
 * Named individually rather than made general — four counties, and the shares
 * are recorded above with what they were derived from.
 */
const CITY_UTILITY: Record<string, { labels: string[]; servesShare: number }> = {
  Hall: { labels: ['Gainesville'], servesShare: 0.9 },
  Lamar: { labels: ['Barnesville'], servesShare: 0.87 },
  Morgan: { labels: ['Madison'], servesShare: 0.67 },
  Meriwether: {
    labels: ['Greenville', 'Manchester', 'Woodbury', 'Warm Springs', 'Luthersville'],
    servesShare: 0.95,
  },
};

/** Column indices on the residential-bills sheet, from its second header row. */
const COL = { label: 0, servicePop: 2, serviceType: 3, insideOutside: 4, at4000: 6 } as const;

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
      const systems = city.labels.map((label) => {
        const hits = rows.filter(
          (r) =>
            (r[COL.insideOutside] ?? '').trim().toLowerCase() === 'inside' &&
            (r[COL.label] ?? '').trim().toLowerCase() === label.toLowerCase(),
        );
        const at = (type: string) => {
          const v = Number(hits.find((r) => (r[COL.serviceType] ?? '').trim() === type)?.[COL.at4000]);
          return Number.isFinite(v) && v > 0 ? v : undefined;
        };
        const servicePop = Number(hits[0]?.[COL.servicePop]);
        // NOT `|| 0`. A population that failed to parse would drop the system
        // out of the weighted blend below, silently and indistinguishably from
        // a system that genuinely serves nobody — phase243's shape. Refuse
        // instead: a blend missing one of five systems is a different number
        // and nothing would have said so.
        if (!Number.isFinite(servicePop) || servicePop <= 0) {
          throw new Error(
            `${county}: the survey gives no service population for "${label}", so it cannot be weighted`,
          );
        }
        return { label, servicePop, water: at('Water'), sewer: at('Sewer') };
      });
      // Weighted by the population each system serves, and renormalised per
      // component over the systems that publish it — a utility that files no
      // sewer rate must not drag the sewer average toward zero. Same shape as
      // the electricity blend in `territory.ts`.
      const blend = (key: 'water' | 'sewer') => {
        const have = systems.filter((x) => x[key] !== undefined && x.servicePop > 0);
        const weight = have.reduce((sum, x) => sum + x.servicePop, 0);
        if (weight === 0) return undefined;
        return have.reduce((sum, x) => sum + (x[key] as number) * x.servicePop, 0) / weight;
      };
      const water = blend('water');
      if (water !== undefined) {
        bill = {
          county,
          water: Number(water.toFixed(2)),
          sewer: blend('sewer') === undefined ? undefined : Number((blend('sewer') as number).toFixed(2)),
          providers: systems.filter((x) => x.water !== undefined).map((x) => x.label),
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
        ...(b.servesShare === undefined ? {} : { provider_share_of_billed_households: b.servesShare }),
        basis:
          b.servesShare !== undefined
            ? `Water and sewer at 4,000 gallons a month from ${b.providers.length > 1 ? `${b.providers.length} systems (${b.providers.join(', ')})` : b.providers[0]}, ${b.providers.length > 1 ? `which together serve` : `which serves`} about ${Math.round(b.servesShare * 100)}% of the households in this county that have a water bill at all — there is no county-wide utility here. From the January 2022 GEFA/UNC rate survey, so it is a real published bill but not a current one.`
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
