/**
 * Real school proficiency, from the state's own Milestones results, into
 * `area_metrics`.
 *
 * Replaces the estimates `seed-area-metrics.ts` wrote for
 * `school_proficiency_pct`. Schools were the single thing buyers said they
 * look up first about an area they have never visited (8 of 10 in the 2026-09
 * study), which makes a guessed number here the least defensible one we ship.
 *
 * ── Source ─────────────────────────────────────────────────────────────────
 *
 * GOSA / GOEWS publishes Georgia Milestones results as CSV at
 * `download.gosa.ga.gov`. Two files matter: EOG (grades 3–8) and EOC (high
 * school). The filenames embed a generation timestamp and therefore cannot be
 * constructed — the index page is scraped for the newest of each, which is
 * also what makes this re-runnable next summer with no edit.
 *
 * ── What "proficient" means here ───────────────────────────────────────────
 *
 * Georgia reports four achievement levels. **Proficient + Distinguished** are
 * the two that mean a student is at or above grade level, and that pair is
 * what the state itself reports as meeting expectations — so the figure is
 * `PROFICIENT_PCT + DISTINGUISHED_PCT`, not `PROFICIENT_PCT` alone. Using the
 * latter would understate every district in Georgia by roughly the size of its
 * strongest cohort.
 *
 * The district figure is a **weighted mean over test takers**, not a mean of
 * the per-subject percentages. A district that tests 4,000 students in one
 * subject and 200 in another does not have those two count equally, and an
 * unweighted average quietly hands small subjects the same voice as large
 * ones.
 *
 * Only `SUBGROUP_NAME = "All Students"` rows are read, and only the
 * district-aggregate rows (GOSA writes the literal string `ALL` into both
 * `INSTN_NUMBER` and `INSTN_NAME` for those), so nothing is re-aggregated from
 * school rows that the state has already summed.
 *
 * Cells suppressed for small samples carry the literal `TFS` (Too Few
 * Students) rather than being empty; those rows are skipped rather than
 * parsed as zero.
 *
 * ── District is not county ─────────────────────────────────────────────────
 *
 * Most Georgia counties have one county-wide district, and for those the join
 * is exact. Some have an independent CITY system inside them — Atlanta,
 * Marietta, Decatur, Buford and others — whose students are NOT in the county
 * district's numbers. `COUNTY_DISTRICTS` names the county district explicitly
 * for that reason: silently matching on a name prefix would let "Atlanta
 * Public Schools" answer for Fulton, which is wrong in both directions.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-ga-proficiency.ts
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-ga-proficiency.ts --apply
 *
 * DRY RUN BY DEFAULT.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

const INDEX_URL = 'https://download.gosa.ga.gov/';
const SOURCE = 'Georgia Milestones (GOSA), district aggregate, all students';

/**
 * County → the district whose results speak for it.
 *
 * Every entry is the COUNTY district. Where an independent city system exists
 * in the same county its students are simply not counted here, which is the
 * honest reading of "what do the schools a home in this county is likely
 * zoned for do" — a home outside Atlanta city limits is not zoned for APS.
 */
const COUNTY_DISTRICTS: Record<string, string> = {
  Barrow: 'Barrow County',
  Bartow: 'Bartow County',
  Carroll: 'Carroll County',
  Cherokee: 'Cherokee County',
  Clayton: 'Clayton County',
  Cobb: 'Cobb County',
  Coweta: 'Coweta County',
  Dawson: 'Dawson County',
  DeKalb: 'DeKalb County',
  Douglas: 'Douglas County',
  Fayette: 'Fayette County',
  Forsyth: 'Forsyth County',
  Fulton: 'Fulton County',
  Gwinnett: 'Gwinnett County',
  Hall: 'Hall County',
  Haralson: 'Haralson County',
  Heard: 'Heard County',
  Henry: 'Henry County',
  Jackson: 'Jackson County',
  Lamar: 'Lamar County',
  Meriwether: 'Meriwether County',
  Morgan: 'Morgan County',
  Newton: 'Newton County',
  Paulding: 'Paulding County',
  Pickens: 'Pickens County',
  Pike: 'Pike County',
  Rockdale: 'Rockdale County',
  Spalding: 'Griffin-Spalding County',
  Walton: 'Walton County',
};

/** Splits one CSV line, honouring the quotes GOSA wraps every field in. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      out.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

/** The newest file whose name starts with `prefix`, from the index page. */
function newestFile(index: string, prefix: string): string | undefined {
  const matches = [
    ...index.matchAll(new RegExp(`(\\d{4}/${prefix}[A-Za-z_0-9.\\-]*\\.csv)`, 'g')),
  ].map((m) => m[1] as string);
  if (matches.length === 0) return undefined;
  // The leading year directory sorts the editions; the embedded timestamp
  // breaks a tie within one year.
  return [...new Set(matches)].sort().at(-1);
}

interface Tally {
  tested: number;
  proficientWeighted: number;
  subjects: number;
}

/** Accumulates one CSV's district-aggregate rows into the running tallies. */
function accumulate(csv: string, into: Map<string, Tally>): number {
  const lines = csv.split('\n');
  const header = splitCsvLine(lines[0] ?? '').map((h) => h.replace(/^#/, ''));
  const idx = (name: string) => header.indexOf(name);
  const iDistrict = idx('SCHOOL_DSTRCT_NM');
  const iInstn = idx('INSTN_NUMBER');
  const iSubgroup = idx('SUBGROUP_NAME');
  const iTested = idx('NUM_TESTED_CNT');
  const iProf = idx('PROFICIENT_PCT');
  const iDist = idx('DISTINGUISHED_PCT');
  if ([iDistrict, iInstn, iSubgroup, iTested, iProf, iDist].some((i) => i < 0)) {
    throw new Error(`GOSA changed the CSV header: ${header.join(',')}`);
  }

  let used = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;
    const f = splitCsvLine(line);
    if (f[iInstn] !== 'ALL') continue;
    if (f[iSubgroup] !== 'All Students') continue;

    const tested = Number(f[iTested]);
    const prof = Number(f[iProf]);
    const dist = Number(f[iDist]);
    // Suppressed cells are the literal "TFS"; Number() gives NaN and the row
    // is dropped rather than counted as a zero-proficiency subject.
    if (!Number.isFinite(tested) || tested <= 0) continue;
    if (!Number.isFinite(prof) || !Number.isFinite(dist)) continue;

    const district = f[iDistrict];
    if (!district) continue;
    const t = into.get(district) ?? {
      tested: 0,
      proficientWeighted: 0,
      subjects: 0,
    };
    t.tested += tested;
    t.proficientWeighted += (prof + dist) * tested;
    t.subjects += 1;
    into.set(district, t);
    used++;
  }
  return used;
}

async function main() {
  const local = process.env.GOSA_EOC && process.env.GOSA_EOG;
  const tallies = new Map<string, Tally>();
  const urls: string[] = [];

  if (local) {
    for (const p of [process.env.GOSA_EOG, process.env.GOSA_EOC]) {
      if (!p || !existsSync(p)) continue;
      console.log(`Reading ${p}`);
      urls.push(p);
      console.log(`  ${accumulate(readFileSync(p, 'utf8'), tallies)} rows used`);
    }
  } else {
    console.log(`Fetching index ${INDEX_URL}`);
    const indexRes = await fetch(INDEX_URL);
    if (!indexRes.ok) {
      console.error(`GOSA index returned ${indexRes.status}. Nothing written.`);
      process.exit(1);
    }
    const index = await indexRes.text();
    for (const prefix of ['EOG_2', 'EOC_2']) {
      const file = newestFile(index, prefix);
      if (!file) {
        console.error(`No ${prefix}* file on the index page.`);
        process.exit(1);
      }
      const url = `${INDEX_URL}${file}`;
      console.log(`Fetching ${url}`);
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`${url} returned ${res.status}. Nothing written.`);
        process.exit(1);
      }
      urls.push(url);
      console.log(`  ${accumulate(await res.text(), tallies)} rows used`);
    }
  }

  /** The school year the files describe, taken from the newest URL. */
  const yearMatch = /(\d{4})-(\d{2})/.exec(urls.join(' '));
  const asOf = yearMatch?.[2] ? `20${yearMatch[2]}-06-30` : '2025-06-30';

  const rowsOut: Record<string, unknown>[] = [];
  const missing: string[] = [];
  for (const [county, district] of Object.entries(COUNTY_DISTRICTS)) {
    const t = tallies.get(district);
    if (!t || t.tested === 0) {
      missing.push(`${county} (no rows for "${district}")`);
      continue;
    }
    const pct = t.proficientWeighted / t.tested;
    rowsOut.push({
      area_kind: 'county',
      state: 'GA',
      area_key: county.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      area_name: county,
      metric: 'school_proficiency_pct',
      value: Number(pct.toFixed(1)),
      unit: 'percent',
      source: SOURCE,
      source_url: urls[0] ?? INDEX_URL,
      as_of: asOf,
      estimated: false,
      detail: {
        district,
        students_tested: t.tested,
        subject_rows: t.subjects,
        basis:
          'Proficient + Distinguished, weighted by students tested across EOG and EOC. County district only — an independent city system in the same county is not included.',
      },
    });
  }

  rowsOut.sort((a, b) => Number(b.value) - Number(a.value));
  console.log(`\n${rowsOut.length} counties, strongest first:`);
  for (const r of rowsOut) {
    const d = r.detail as { students_tested: number };
    console.log(
      `  ${String(r.area_name).padEnd(12)} ${String(r.value).padStart(5)}%  (${d.students_tested.toLocaleString()} tested)`,
    );
  }
  if (missing.length > 0) console.log(`\nNo data: ${missing.join('; ')}`);

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
