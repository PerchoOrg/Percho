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
  contentStreams,
  parseRow,
  rows,
  textItems,
} from '../../apps/web/lib/areas/millage-pdf.js';

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
