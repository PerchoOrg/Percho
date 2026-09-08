/**
 * One trash figure for every county, because we do not know how it varies.
 *
 * ── What this removes ──────────────────────────────────────────────────────
 *
 * phase200 seeded `trash_monthly_usd` with per-county numbers between $22 and
 * $32. I made all of them up, including the differences between them — and
 * those differences were doing work:
 *
 *     true cost   6 of 29 ranking positions move when trash is flattened
 *     utilities  15 of 29 — more than half the list
 *
 * A buyer reading "Fulton is 11th cheapest for utilities" was reading my
 * fiction. Invented variation is worse than an invented level, because a level
 * shifts every county equally and cancels out of a comparison, while variation
 * manufactures a ranking signal out of nothing and the lens exists to be read
 * as a ranking.
 *
 * This is the ruling phase218 already made about insurance: a component we
 * cannot source is a flat assumption, named as one, not a spread of plausible
 * guesses.
 *
 * ── Why trash is not moved into the code like insurance ────────────────────
 *
 * Insurance is a formula on price and there is no per-county figure to hope
 * for, so it lives in `lenses.ts` as a constant. Trash genuinely does vary
 * between counties — we simply have no source that decomposes it, which
 * `scripts/admin/audit-trash-sources.ts` establishes and reproduces. Keeping it
 * a per-county metric row leaves the path open: when a real source appears, an
 * importer writes real varying values and nothing else has to change.
 *
 * ── The level ──────────────────────────────────────────────────────────────
 *
 * DeKalb County publishes an annual residential sanitation assessment of
 * **$362.30** for weekly garbage, recycling and yard trimmings — $30.19 a
 * month. That is one real published fee from one county, used as the flat
 * assumption for all of them. It is not a statewide average and does not claim
 * to be; it is an anchored number in place of an unanchored one.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-trash-flat.ts
 *   ... --apply     to write
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

/** DeKalb's published annual residential sanitation assessment. */
const DEKALB_ANNUAL_USD = 362.3;
const SOURCE =
  'Percho assumption — DeKalb County’s published residential sanitation assessment ($362.30/year), applied flat because no Georgia source decomposes residential collection by county';
const SOURCE_URL =
  'https://dekalbcountyga.gov/departments/public-works/sanitation/new-residential-service';
const AS_OF = '2026-01-01';

async function main() {
  const shapes = JSON.parse(
    readFileSync(new URL('../../apps/web/data/metro-county-shapes.json', import.meta.url), 'utf8'),
  ) as { counties: { name: string; key: string }[] };

  const monthly = Math.round(DEKALB_ANNUAL_USD / 12);
  console.log(
    `$${DEKALB_ANNUAL_USD.toFixed(2)}/year → $${(DEKALB_ANNUAL_USD / 12).toFixed(2)}/month → $${monthly} for all ${shapes.counties.length} counties.\n`,
  );

  const rowsOut = shapes.counties.map((c) => ({
    area_kind: 'county',
    state: 'GA',
    area_key: c.key,
    area_name: c.name,
    metric: 'trash_monthly_usd',
    value: monthly,
    unit: 'usd_per_month',
    source: SOURCE,
    source_url: SOURCE_URL,
    as_of: AS_OF,
    estimated: true,
    detail: {
      anchor_annual_usd: DEKALB_ANNUAL_USD,
      anchor_county: 'DeKalb',
      basis:
        'One figure for every county. Georgia has no source that separates residential collection charges from commercial and landfill revenue — see scripts/admin/audit-trash-sources.ts, which reproduces that finding from the Census government-finance file. The per-county numbers this replaces were invented, and their DIFFERENCES were moving 6 of 29 positions in the true-cost ranking and 15 of 29 in utilities. A flat assumption shifts every county equally and cancels out of a comparison; invented variation manufactures a ranking signal from nothing.',
    },
  }));

  for (const r of rowsOut.slice(0, 3)) console.log(`  ${r.area_name.padEnd(12)} $${r.value}`);
  console.log(`  … ${rowsOut.length} counties, all $${monthly}`);

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
