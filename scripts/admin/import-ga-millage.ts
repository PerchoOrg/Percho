/**
 * Real property tax rates, from the Georgia Department of Revenue's own
 * annual millage report, into `area_metrics`.
 *
 * ── What this writes, and what it deliberately does NOT ────────────────────
 *
 * It writes `property_tax_millage_statutory_pct`: the adopted rate on fair
 * market value, sourced and exact.
 *
 * It does **not** overwrite `property_tax_rate_pct`, the metric the true-cost
 * lens prices a home with, and the reason is more interesting than it first
 * looks.
 *
 * The obvious objection to the statutory figure is that it is too high:
 * DeKalb's adopted rate is 48.023 mills, i.e. 1.921% of market value, against
 * a widely published "average effective property tax rate" for DeKalb of about
 * 1.1%. That looked like homestead exemptions, and it mostly is not. Georgia's
 * standard homestead exemptions in these counties are $2,000 to $5,000 off the
 * ASSESSED value — on a $500k home, assessed at $200k, a $5,000 exemption is
 * 2.5% of the bill. It cannot explain a 40% gap.
 *
 * What explains most of it is that the published effective rate is a median
 * over ALL owners: taxes actually paid divided by current market value, across
 * a population whose assessed values were set years ago and, under HB 581's
 * floating exemption, are capped against inflation thereafter. A household
 * that bought in 2015 is taxed on a base far below what their house is worth
 * now, and they drag the median down. **A buyer purchasing today is assessed
 * at 40% of what they just paid**, so the statutory rate is much closer to
 * their first-year bill than the median effective rate is.
 *
 * That argues the statutory figure is the RIGHT one for this product. It is
 * still not written to the lens's metric, for one reason that survives the
 * argument: some counties run a large credit rather than an exemption —
 * DeKalb's EHOST credit offsets a substantial share of county tax for a
 * homesteaded property, and it applies to a new buyer immediately. Until that
 * is quantified per county, swapping the lens over would trade a known-round
 * estimate for a precisely-cited number that is wrong in a handful of the
 * densest counties.
 *
 * So: publish the statutory rate for what it honestly is, keep the lens's
 * flagged estimate, and let the county detail show both. Closing this needs
 * per-county credit amounts, or Census ACS B25103 ÷ B25077 — which now
 * requires an API key, i.e. an account signup, which is the owner's call.
 *
 * ── Why 2023 and not 2025 ─────────────────────────────────────────────────
 *
 * DOR publishes this yearly as a PDF and nothing else — verified against the
 * listing page, which offers 2019 through 2025 and not one spreadsheet or CSV
 * among them.
 *
 * The 2024 and 2025 editions cannot be read. **Measured with this repo's own
 * reader on 2026-09-08**, not taken on anyone's word:
 *
 *   2023   51 content streams → 7,006 text items → 1,844 rows → 1,618 parsed,
 *          160 counties. `["DEKALB","ATLANTA","8.520","1.880"]`.
 *   2024   **0 content streams carrying text at all.** Nothing to extract.
 *   2025   53 streams → 49,099 text items → and every one is garbage:
 *          `["L","M","Q","0","J","K"]`.
 *
 * The 2025 file is not encrypted or malformed — it draws text, and the text
 * comes out as meaningless glyph codes. 90 distinct characters starting at
 * `\u0000`, i.e. subset-font glyph INDICES with no mapping back to letters,
 * and **no drawn run longer than six characters** — the document positions
 * nearly every character individually, so there are not even word boundaries
 * to work from. Solving it as a substitution cipher would mean reconstructing
 * words from coordinates first and then breaking not one cipher but one per
 * font subset. That is OCR's job, and OCR guessing a millage rate is the worst
 * possible failure mode for this number.
 *
 * A cheap tell for whoever checks next year: **file size**. The editions that
 * parse are small — 2023 is 123 KB, 2022 86 KB, 2020 83 KB. The ones that do
 * not are large — 2021 8.8 MB, 2024 9.4 MB, 2025 2.4 MB. If the 2026 edition
 * lands at a hundred-odd kilobytes, point `YEAR` and `SOURCE_URL` at it and it
 * will very likely just work.
 *
 * ── Why there is no PDF dependency ─────────────────────────────────────────
 *
 * The file is FlateDecode'd standard Type1 text. Node's own `zlib` inflates
 * the content streams, and the text operators carry an x/y with every string,
 * which is enough to rebuild the table by row. That reading lives in
 * `apps/web/lib/areas/millage-pdf.ts`, with tests, because three separate
 * quirks of these PDFs each cost a county before they were understood — read
 * its header before touching a millage parser again.
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
import { createClient } from '@supabase/supabase-js';
import {
  COUNTYWIDE_DISTRICTS,
  contentStreams,
  countywideMills,
  parseRow,
  rows,
  textItems,
  totalMills,
} from '../../apps/web/lib/areas/millage-pdf.js';
import type { LevyMills } from '../../apps/web/lib/areas/millage-pdf.js';

const APPLY = process.argv.includes('--apply');

const YEAR = 2023;
const SOURCE_URL =
  'https://dor.georgia.gov/document/document/2023-georgia-county-ad-valorem-tax-digest-millage-rates/download';
const SOURCE = `Georgia DOR ${YEAR} County Ad Valorem Tax Digest Millage Rates`;
const AS_OF = `${YEAR}-12-31`;

/** Statewide assessment ratio, O.C.G.A. § 48-5-7. */
const ASSESSMENT_RATIO = 0.4;

/** Below this, the edition is unreadable rather than merely different — the
 *  2023 edition yields 1,618. See the header. */
const MIN_PARSED_ROWS = 500;

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

  // An edition whose glyphs have no mapping back to letters yields a handful
  // of rows of nonsense rather than an error, and with --apply that would
  // quietly write nothing while reporting success. The 2023 edition parses
  // 1,618 rows; anything under a few hundred means the file changed shape.
  if (parsed.length < MIN_PARSED_ROWS) {
    console.error(
      `\nOnly ${parsed.length} rows parsed — expected at least ${MIN_PARSED_ROWS}.\n` +
        'This edition is almost certainly one of the unreadable ones: its text\n' +
        'draws as subset-font glyph indices with no mapping back to letters.\n' +
        'See this script’s header for how to tell, and for the file-size tell.\n' +
        'Nothing written.',
    );
    process.exit(1);
  }

  // Sum the county-wide districts. A county missing its UNINCORPORATED or
  // SCHOOL line is reported rather than published at a partial rate — a low
  // number here would read as a cheap county.
  const byCounty = new Map<string, Map<string, LevyMills>>();
  for (const county of METRO_COUNTIES) {
    const parts = countywideMills(parsed, county);
    if (parts.size > 0) byCounty.set(county, parts);
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
    const mills = totalMills(parts);
    const effectivePct = (mills * ASSESSMENT_RATIO) / 10;
    const countyLevy = parts.get('COUNTY UNINCORPORATED');
    const schoolLevy = parts.get('SCHOOL');
    const name = county
      .split(/\s+/)
      .map((w) => w[0] + w.slice(1).toLowerCase())
      .join(' ')
      // The report spells it DEKALB; the shape file and every UI string say
      // DeKalb, and the key must match or the join silently drops the county.
      .replace(/^Dekalb$/, 'DeKalb');
    const base = {
      area_kind: 'county',
      state: 'GA',
      area_key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      area_name: name,
      source: SOURCE,
      source_url: SOURCE_URL,
      as_of: AS_OF,
      estimated: false,
    } as const;

    rowsOut.push({
      ...base,
      metric: 'property_tax_millage_statutory_pct',
      value: Number(effectivePct.toFixed(3)),
      unit: 'percent',
      detail: {
        total_mills: Number(mills.toFixed(3)),
        assessment_ratio: ASSESSMENT_RATIO,
        basis:
          'Adopted rate on fair market value for an UNINCORPORATED home: county + school + state levies. Before homestead exemptions, and it omits the fire, EMS, police and recreation districts most counties levy separately — run scripts/admin/audit-millage-districts.ts for the size of that gap per county. A home inside a city is NOT simply this plus the city rate: the county levies a lower rate inside city limits, so a city home can pay less than its unincorporated neighbour.',
      },
    });

    // The four levies as their own rows. An exemption reduces an M&O base and
    // by law never touches bond millage, so a client that only had the total
    // could not compute a homesteaded bill — which is the whole point of
    // `@percho/shared/property-tax`.
    const levies: [string, number][] = [
      ['county_mo_mills', countyLevy?.mo ?? 0],
      ['county_bond_mills', countyLevy?.bond ?? 0],
      ['school_mo_mills', schoolLevy?.mo ?? 0],
      ['school_bond_mills', schoolLevy?.bond ?? 0],
    ];
    for (const [metric, value] of levies) {
      rowsOut.push({
        ...base,
        metric,
        value: Number(value.toFixed(3)),
        unit: 'mills',
        detail: null,
      });
    }
  }

  const rateRows = rowsOut.filter((r) => r.metric === 'property_tax_millage_statutory_pct');
  console.log(`\n${rateRows.length} counties with a complete county-wide rate:`);
  for (const r of rateRows) {
    console.log(
      `  ${String(r.area_name).padEnd(12)} ${String(r.value).padStart(6)}%  (${(r.detail as { total_mills: number }).total_mills} mills)`,
    );
  }
  console.log(`\n${rowsOut.length} rows total, including the four levies per county.`);
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
