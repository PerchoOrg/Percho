/**
 * Seed `area_metrics` so the lens map has something to draw on day one.
 *
 * **Everything this writes is `estimated: true`.** These are the demo's
 * order-of-magnitude figures, not sourced numbers: the tax rates are typical
 * effective rates rather than a county's adopted millage, the utility figures
 * are a typical bill for the dominant provider rather than a rate card, and
 * the proficiency numbers are approximate district averages. They exist so the
 * UI can be built and reviewed against a realistic distribution, and they
 * render behind a disclosure that says so.
 *
 * The scrapers that replace them, one metric at a time, upsert over the same
 * unique key `(area_kind, state, area_key, metric)` with `estimated: false`
 * and a real `source_url`. A metric is "done" when nothing here still owns it.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/seed-area-metrics.ts
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/seed-area-metrics.ts --apply
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

/**
 * Per county: effective property tax rate (%), district proficiency (%),
 * typical monthly electric / water / trash (USD), and who provides them.
 *
 * `electricProvider` and `trashArrangement` are carried in `detail` because
 * they are the part a buyer reacts to — "you must hire your own hauler" is a
 * different fact from "$28/month", and the second without the first is the
 * kind of half-answer the buyer study complained about.
 */
const SEED = [
  { name: 'Barrow', tax: 0.90, school: 38, electric: 150, water: 60, trash: 25, electricProvider: 'Jackson EMC', trashArrangement: 'private hauler' },
  { name: 'Bartow', tax: 0.74, school: 38, electric: 160, water: 58, trash: 26, electricProvider: 'Georgia Power', trashArrangement: 'private hauler' },
  { name: 'Carroll', tax: 0.85, school: 36, electric: 152, water: 60, trash: 26, electricProvider: 'Carroll EMC', trashArrangement: 'private hauler' },
  { name: 'Cherokee', tax: 0.72, school: 50, electric: 150, water: 70, trash: 25, electricProvider: 'Cobb EMC', trashArrangement: 'private hauler' },
  { name: 'Clayton', tax: 1.03, school: 25, electric: 165, water: 68, trash: 28, electricProvider: 'Georgia Power', trashArrangement: 'private hauler' },
  { name: 'Cobb', tax: 0.72, school: 50, electric: 148, water: 58, trash: 28, electricProvider: 'Cobb EMC', trashArrangement: 'private hauler' },
  { name: 'Coweta', tax: 0.81, school: 46, electric: 148, water: 64, trash: 27, electricProvider: 'Coweta-Fayette EMC', trashArrangement: 'private hauler' },
  { name: 'Dawson', tax: 0.70, school: 44, electric: 145, water: 58, trash: 24, electricProvider: 'Amicalola EMC', trashArrangement: 'private hauler' },
  { name: 'DeKalb', tax: 1.04, school: 33, electric: 165, water: 92, trash: 30, electricProvider: 'Georgia Power', trashArrangement: 'county service, billed on the tax bill' },
  { name: 'Douglas', tax: 0.96, school: 32, electric: 149, water: 70, trash: 30, electricProvider: 'GreyStone Power', trashArrangement: 'private hauler' },
  { name: 'Fayette', tax: 0.88, school: 57, electric: 148, water: 66, trash: 28, electricProvider: 'Coweta-Fayette EMC', trashArrangement: 'private hauler' },
  { name: 'Forsyth', tax: 0.77, school: 62, electric: 142, water: 65, trash: 27, electricProvider: 'Sawnee EMC', trashArrangement: 'private hauler' },
  { name: 'Fulton', tax: 1.02, school: 42, electric: 165, water: 78, trash: 32, electricProvider: 'Georgia Power', trashArrangement: 'varies by city' },
  { name: 'Gwinnett', tax: 0.98, school: 45, electric: 152, water: 72, trash: 22, electricProvider: 'Jackson EMC', trashArrangement: 'county program, assigned hauler' },
  { name: 'Hall', tax: 0.73, school: 40, electric: 150, water: 62, trash: 26, electricProvider: 'Jackson EMC', trashArrangement: 'private hauler' },
  { name: 'Haralson', tax: 0.82, school: 34, electric: 152, water: 58, trash: 25, electricProvider: 'Carroll EMC', trashArrangement: 'private hauler' },
  { name: 'Heard', tax: 0.80, school: 32, electric: 152, water: 56, trash: 25, electricProvider: 'Carroll EMC', trashArrangement: 'private hauler' },
  { name: 'Henry', tax: 0.92, school: 35, electric: 150, water: 72, trash: 30, electricProvider: 'Snapping Shoals EMC', trashArrangement: 'private hauler' },
  { name: 'Jackson', tax: 0.85, school: 44, electric: 148, water: 58, trash: 25, electricProvider: 'Jackson EMC', trashArrangement: 'private hauler' },
  { name: 'Lamar', tax: 0.88, school: 30, electric: 155, water: 58, trash: 26, electricProvider: 'Georgia Power', trashArrangement: 'private hauler' },
  { name: 'Meriwether', tax: 0.86, school: 28, electric: 155, water: 56, trash: 26, electricProvider: 'Georgia Power', trashArrangement: 'private hauler' },
  { name: 'Morgan', tax: 0.78, school: 42, electric: 150, water: 58, trash: 25, electricProvider: 'Walton EMC', trashArrangement: 'private hauler' },
  { name: 'Newton', tax: 0.98, school: 30, electric: 150, water: 66, trash: 28, electricProvider: 'Snapping Shoals EMC', trashArrangement: 'private hauler' },
  { name: 'Paulding', tax: 0.87, school: 38, electric: 149, water: 68, trash: 26, electricProvider: 'GreyStone Power', trashArrangement: 'private hauler' },
  { name: 'Pickens', tax: 0.71, school: 44, electric: 145, water: 56, trash: 24, electricProvider: 'Amicalola EMC', trashArrangement: 'private hauler' },
  { name: 'Pike', tax: 0.83, school: 40, electric: 152, water: 56, trash: 25, electricProvider: 'Southern Rivers Energy', trashArrangement: 'private hauler' },
  { name: 'Rockdale', tax: 1.06, school: 28, electric: 150, water: 70, trash: 28, electricProvider: 'Snapping Shoals EMC', trashArrangement: 'private hauler' },
  { name: 'Spalding', tax: 0.95, school: 28, electric: 155, water: 62, trash: 27, electricProvider: 'Georgia Power', trashArrangement: 'private hauler' },
  { name: 'Walton', tax: 0.79, school: 42, electric: 145, water: 60, trash: 26, electricProvider: 'Walton EMC', trashArrangement: 'private hauler' },
] as const;

/** The period these estimates describe. Deliberately the close of the last
 *  full tax year, so a scraper's real `as_of` sorts after it. */
const AS_OF = '2024-12-31';
const SOURCE = 'Percho estimate — pending sourced data (phase200)';

interface Upsert {
  area_kind: 'county';
  state: 'GA';
  area_key: string;
  area_name: string;
  metric: string;
  value: number;
  unit: string;
  source: string;
  as_of: string;
  estimated: true;
  detail: Record<string, string> | null;
}

const rows: Upsert[] = [];
for (const c of SEED) {
  const key = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const base = {
    area_kind: 'county',
    state: 'GA',
    area_key: key,
    area_name: c.name,
    source: SOURCE,
    as_of: AS_OF,
    estimated: true,
  } as const;
  rows.push(
    { ...base, metric: 'property_tax_rate_pct', value: c.tax, unit: 'percent', detail: null },
    { ...base, metric: 'school_proficiency_pct', value: c.school, unit: 'percent', detail: null },
    {
      ...base,
      metric: 'electric_monthly_usd',
      value: c.electric,
      unit: 'usd_per_month',
      detail: { provider: c.electricProvider },
    },
    { ...base, metric: 'water_monthly_usd', value: c.water, unit: 'usd_per_month', detail: null },
    {
      ...base,
      metric: 'trash_monthly_usd',
      value: c.trash,
      unit: 'usd_per_month',
      detail: { arrangement: c.trashArrangement },
    },
  );
}

async function main() {
  console.log(`${SEED.length} counties → ${rows.length} metric rows, all estimated.`);

  if (!APPLY) {
    console.log('\nDRY RUN. Re-run with --apply to write.');
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${r.area_name} ${r.metric} = ${r.value} ${r.unit}`);
    }
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
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error, count } = await supabase
    .from('area_metrics')
    .upsert(rows, { onConflict: 'area_kind,state,area_key,metric', count: 'exact' });

  if (error) {
    console.error(`upsert failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Wrote ${count ?? rows.length} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
