/**
 * What each county's published tax rate leaves out — as data, not just a report.
 *
 * `audit-millage-districts.ts` has printed this since phase202 for a human to
 * rule on, and the ruling has not come because of how the finding was phrased.
 * "Worst case Hall, 0.347 percentage points" is true and reads as trivial.
 * Measured as the thing the map actually shows — see phase240 —
 * **22 of 29 ranking positions change**, and Hall goes from the third cheapest
 * county to own a home in to the sixteenth.
 *
 * So the range goes into the data, where the cost sheet can say it. The figure
 * itself is NOT adjusted: which district levies a home pays depends on whether
 * it is inside a city and, in Jackson, on which of eleven fire sub-districts
 * covers it. Correcting it is a ruling; disclosing it is not.
 *
 * Two metrics rather than one with a range inside `detail`, because `detail` is
 * an importer's scratchpad that nothing may read — phase219.1 — and both ends
 * are needed to say "$70 to $145 depending where".
 *
 * Usage:
 *   MILLAGE_PDF=/path/to/dor.pdf pnpm --filter @percho/web exec tsx \
 *     ../../scripts/admin/import-district-millage.ts
 *   ... --apply     to write
 *
 * The report:
 *   https://dor.georgia.gov/document/document/2023-georgia-county-ad-valorem-tax-digest-millage-rates/download
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { omissionFor } from '../../apps/web/lib/areas/district-millage.js';
import {
  type DistrictRate,
  contentStreams,
  parseRow,
  rows,
  textItems,
} from '../../apps/web/lib/areas/millage-pdf.js';

const APPLY = process.argv.includes('--apply');
const SOURCE =
  'Georgia DOR 2023 County Ad Valorem Tax Digest Millage Rates — county district levies the published rate omits';
const SOURCE_URL =
  'https://dor.georgia.gov/document/document/2023-georgia-county-ad-valorem-tax-digest-millage-rates/download';
const AS_OF = '2023-12-31';

async function main() {
  const local = process.env.MILLAGE_PDF;
  if (!local || !existsSync(local)) {
    console.error(`Set MILLAGE_PDF to a local copy of the DOR report.\nDownload: ${SOURCE_URL}`);
    process.exit(1);
  }
  const shapes = JSON.parse(
    readFileSync(new URL('../../apps/web/data/metro-county-shapes.json', import.meta.url), 'utf8'),
  ) as { counties: { name: string; key: string }[] };

  const parsed = rows(textItems(contentStreams(readFileSync(local))))
    .map(parseRow)
    .filter((r): r is DistrictRate => r !== null);
  if (parsed.length < 500) {
    console.error(`only ${parsed.length} rows parsed — the report changed shape. Nothing written.`);
    process.exit(1);
  }

  const rowsOut: Record<string, unknown>[] = [];
  console.log(`\n${'county'.padEnd(12)}${'floor'.padStart(8)}${'ceiling'.padStart(9)}  levies omitted`);
  for (const county of shapes.counties) {
    const all = parsed.filter((r) => r.county === county.name.toUpperCase());
    const extras = all.filter(
      (r) =>
        r.district.startsWith('COUNTY ') &&
        !/^COUNTY (INCORPORATED|UNINCORPORATED)$/.test(r.district) &&
        !r.district.startsWith('COUNTY SSD') &&
        r.mo + r.bond > 0,
    );
    if (extras.length === 0) continue;
    const o = omissionFor(extras.map((e) => ({ district: e.district, mills: e.mo + e.bond })));
    if (o.highPoints <= 0) continue;
    console.log(
      `${county.name.padEnd(12)}${o.lowPoints.toFixed(3).padStart(8)}${o.highPoints.toFixed(3).padStart(9)}  ${o.levies.length}`,
    );
    const shared = {
      area_kind: 'county',
      state: 'GA',
      area_key: county.key,
      area_name: county.name,
      unit: 'percent',
      source: SOURCE,
      source_url: SOURCE_URL,
      as_of: AS_OF,
      // Sourced from the state's own report, but a RANGE: which levies a home
      // pays is not in the report, so this is not a measurement of one home.
      estimated: true,
      detail: {
        levies: o.levies.map((l) => ({ district: l.district, mills: l.mills, bucket: l.bucket })),
        basis:
          'Percentage points of market value that the published county rate omits, as a range. The floor is what a home outside city limits certainly pays — county-wide and unincorporated-only levies, plus the cheapest of any mutually exclusive sub-district family. The ceiling adds the dearest sub-district and every levy the report does not disambiguate. A levy named for one city counts at neither end. The published figure is deliberately NOT adjusted: which levies apply to a given home is a judgement the report does not answer.',
      },
    };
    rowsOut.push(
      { ...shared, metric: 'district_millage_omitted_min_pct', value: Number(o.lowPoints.toFixed(4)) },
      { ...shared, metric: 'district_millage_omitted_max_pct', value: Number(o.highPoints.toFixed(4)) },
    );
  }

  console.log(`\n${rowsOut.length / 2} of ${shapes.counties.length} counties omit something.`);

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
