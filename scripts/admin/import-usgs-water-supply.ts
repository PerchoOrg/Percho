/**
 * How much of each county drinks from a public water system, and how much from
 * a private well.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The water figure has been an unsourced estimate since phase200, and the note
 * blocking it read: "in the outer counties a large share of homes are on WELL
 * AND SEPTIC and pay nothing. A county-level water figure for Pickens or
 * Dawson is the wrong SHAPE, not just imprecise."
 *
 * That was written from intuition and never measured. Measured, it is right in
 * substance and wrong in every example:
 *
 *     Pickens   84% on public water     — the county named as the problem
 *     Dawson    71%                     — the other one
 *     Pike      20%                     — four households in five have a well
 *     Lamar     43%    Morgan  43%      — never mentioned
 *
 * The core metro is effectively all on public supply (Fulton, DeKalb and
 * Gwinnett at 100%, Clayton 99%), so a county water bill is exactly the right
 * shape where most buyers look, and the wrong shape in five counties at the
 * edge. That is a much narrower problem than "water is the wrong shape", and
 * it is one a note on the line can carry.
 *
 * ── The source ─────────────────────────────────────────────────────────────
 *
 * USGS, "Estimated Use of Water in the United States, County-Level Data for
 * 2015" (ver. 2.0, June 2018), the water-use compilation the agency has run
 * every five years since 1950. `PS-TOPop` is the population served by public
 * supply and `DO-SSPop` the self-supplied domestic population — the two halves
 * of the question, published per county, already reconciled against
 * `TP-TotPop`. No joining, no attribution, no double counting.
 *
 * SDWIS was tried first and abandoned. EPA publishes every system's
 * `population_served_count`, but `county_served` is NULL for exactly the
 * largest systems (Cobb County, DeKalb County, Clayton County Water Authority,
 * North Fulton), 828 Georgia community systems have no county at all, and
 * Atlanta is filed against "DeKalb,Fulton" with no split. Summing what remains
 * put Dawson above its own population.
 *
 * ── Vintage ────────────────────────────────────────────────────────────────
 *
 * 2015 is the most recent county-level release; the program's later cycles
 * have not published at this resolution. Eleven years of exurban growth means
 * new subdivisions on public mains, so this UNDERSTATES the public share
 * today — it is a floor, and the direction of its error is known. Recorded
 * with its real `as_of` rather than dressed up as current.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-usgs-water-supply.ts
 *   ... --apply     to write
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

/** The ScienceBase item for the 2015 county-level release. */
const ITEM = 'https://www.sciencebase.gov/catalog/item/5af3311be4b0da30c1b245d8';
const SOURCE =
  'USGS Estimated Use of Water in the United States, county-level data for 2015 (ver. 2.0, June 2018)';
const SOURCE_URL = 'https://doi.org/10.5066/F7TB15V5';
const AS_OF = '2015-12-31';

/** Below this, enough households have no water bill to be worth saying. */
const MOSTLY_PUBLIC = 0.9;

interface Row {
  county: string;
  totalThousands: number;
  publicThousands: number;
  wellThousands: number;
  share: number;
}

/** The CSV's first line is the citation; the header is the second. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    out.push(cells);
  }
  return out;
}

async function fetchCsv(): Promise<string> {
  const local = process.env.USGS_CSV;
  if (local && existsSync(local)) {
    console.log(`Reading ${local}`);
    return readFileSync(local, 'utf8');
  }
  console.log(`Fetching the file list from ${ITEM}`);
  const meta = await fetch(`${ITEM}?format=json`);
  if (!meta.ok) throw new Error(`ScienceBase returned ${meta.status}`);
  const item = (await meta.json()) as { files?: { name: string; url: string }[] };
  const csv = item.files?.find((f) => f.name.endsWith('.csv'));
  if (!csv) throw new Error('no csv in the ScienceBase item');
  console.log(`Fetching ${csv.name}`);
  const res = await fetch(csv.url);
  if (!res.ok) throw new Error(`${csv.name} returned ${res.status}`);
  return await res.text();
}

async function main() {
  const shapes = JSON.parse(
    readFileSync(new URL('../../apps/web/data/metro-county-shapes.json', import.meta.url), 'utf8'),
  ) as { counties: { name: string; key: string }[] };
  const wanted = new Map(shapes.counties.map((c) => [c.name.toLowerCase(), c.key]));

  const rows = parseCsv(await fetchCsv());
  const header = rows[1];
  if (!header) throw new Error('no header row');
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`column ${name} missing — the release changed shape`);
    return i;
  };
  const iState = col('STATE');
  const iCounty = col('COUNTY');
  const iTotal = col('TP-TotPop');
  const iPublic = col('PS-TOPop');
  const iWell = col('DO-SSPop');

  const found: Row[] = [];
  for (const r of rows.slice(2)) {
    if (r[iState] !== 'GA') continue;
    const name = (r[iCounty] ?? '').replace(/ County$/i, '').trim();
    if (!wanted.has(name.toLowerCase())) continue;
    const totalThousands = Number(r[iTotal]);
    const publicThousands = Number(r[iPublic]);
    const wellThousands = Number(r[iWell]);
    if (!Number.isFinite(totalThousands) || totalThousands <= 0) continue;
    if (!Number.isFinite(publicThousands)) continue;
    // The release reconciles these itself; a county where they disagree by
    // more than a rounding step means the columns are not what we think.
    if (Math.abs(publicThousands + wellThousands - totalThousands) > totalThousands * 0.05) {
      console.warn(
        `  ${name}: public ${publicThousands} + well ${wellThousands} ≠ total ${totalThousands}`,
      );
    }
    found.push({
      county: name,
      totalThousands,
      publicThousands,
      wellThousands,
      share: publicThousands / totalThousands,
    });
  }

  found.sort((a, b) => a.share - b.share);
  console.log(`\n${'county'.padEnd(12)}${'people'.padStart(9)}${'public'.padStart(9)}${'well'.padStart(8)}${'public'.padStart(9)}`);
  for (const r of found) {
    const flag = r.share < MOSTLY_PUBLIC ? '  ←' : '';
    console.log(
      `${r.county.padEnd(12)}${(r.totalThousands * 1000).toLocaleString().padStart(9)}` +
        `${(r.publicThousands * 1000).toLocaleString().padStart(9)}` +
        `${(r.wellThousands * 1000).toLocaleString().padStart(8)}` +
        `${`${(r.share * 100).toFixed(0)}%`.padStart(9)}${flag}`,
    );
  }
  // Phrased as how many households have NO bill, not as "the bill describes a
  // minority" — at 88% it describes a large majority, and the point is only
  // that the remainder is big enough to mention.
  const partial = found.filter((r) => r.share < MOSTLY_PUBLIC);
  console.log(
    `\n${found.length} of ${shapes.counties.length} counties. ${partial.length} are below ` +
      `${MOSTLY_PUBLIC * 100}% on public water — enough homes on a well to be worth saying:\n  ${partial
        .map((r) => `${r.county} ${(100 - r.share * 100).toFixed(0)}% on wells`)
        .join(', ')}`,
  );

  if (found.length !== shapes.counties.length) {
    const missing = shapes.counties
      .filter((c) => !found.some((f) => f.county.toLowerCase() === c.name.toLowerCase()))
      .map((c) => c.name);
    console.error(`\nMissing: ${missing.join(', ')}. Nothing written.`);
    process.exit(1);
  }

  const rowsOut = found.map((r) => ({
    area_kind: 'county',
    state: 'GA',
    area_key: wanted.get(r.county.toLowerCase()),
    area_name: r.county,
    metric: 'public_water_pct',
    value: Number((r.share * 100).toFixed(1)),
    unit: 'percent',
    source: SOURCE,
    source_url: SOURCE_URL,
    as_of: AS_OF,
    estimated: false,
    detail: {
      population: Math.round(r.totalThousands * 1000),
      public_supply_population: Math.round(r.publicThousands * 1000),
      self_supplied_population: Math.round(r.wellThousands * 1000),
      basis:
        'Share of the county’s population served by a public water system rather than a private well, from the USGS water-use compilation. Says whether a county-level water bill is the right shape for the place: where the share is low, most households have no water bill at all. 2015 is the latest county-level release, and eleven years of exurban growth on public mains means this understates the public share today rather than overstating it.',
    },
  }));

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
