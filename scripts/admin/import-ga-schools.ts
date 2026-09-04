/**
 * Fill `k12_schools` for Georgia from free official data (phase D, store
 * launch). Owner rule: free data first — and for schools there is no honest
 * paid shortcut anyway: GreatSchools ratings are licensed, Niche is scraped.
 *
 * Sources (all public domain, no key):
 *   CCD  — NCES Common Core of Data school directory, 2023-24
 *          https://nces.ed.gov/ccd/files.asp  → "Directory" flat file
 *          (ccd_sch_029_2324_w_1a_073124.csv, latin-1)
 *   EDGE — NCES school coordinates, 2023-24
 *          https://nces.ed.gov/programs/edge/Geographic/SchoolLocations
 *          (EDGE_GEOCODE_PUBLICSCH_2324.TXT, pipe-delimited, no header)
 *   GOSA — GA Milestones End-of-Grade / End-of-Course school aggregates
 *          https://gosa.georgia.gov/dashboards-data-report-card/downloadable-data
 *          (EOG_2024-25__GA_TST_AGGR_*.csv, EOC_2024-25__GA_TST_AGGR_*.csv)
 *
 * Join keys: CCD.NCESSCH = EDGE col 1; CCD.ST_SCHID ("GA-667-0494") =
 * GOSA SCHOOL_DISTRCT_CD + INSTN_NUMBER.
 *
 * What is written, per school: directory fields, lat/lng (geom is set by the
 * table trigger), `level`, `school_type` ('public' | 'charter'),
 * `test_scores.ga_milestones` = { year, proficientPct, subjects } where
 * proficientPct is the students-tested-weighted mean over subjects of
 * (Proficient + Distinguished)% for ALL students, suppressed cells skipped —
 * the one figure the app shows. No composite "rating":
 * GA's CCRPI single score is not published as a flat file, and inventing one
 * is exactly what the trust pitch says we don't do.
 *
 * The 15 pre-existing GreatSchools rows have no `nces_id`; they are matched
 * by name+city and UPDATED in place (keeping their id, photos and source),
 * so nothing that references them breaks. Everything else is inserted with
 * `source = 'nces'`.
 *
 * Usage (from apps/web, with NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env):
 *   pnpm exec tsx ../../scripts/admin/import-ga-schools.ts --dir /tmp/nces [--apply]
 * DRY RUN BY DEFAULT.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const dirArg = process.argv.indexOf('--dir');
const DIR = dirArg >= 0 ? (process.argv[dirArg + 1] ?? '/tmp/nces') : '/tmp/nces';

/** Quote-aware CSV split. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function readCsv(path: string, encoding: BufferEncoding = 'utf8'): Record<string, string>[] {
  const lines = readFileSync(path, encoding)
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  const header = splitCsv((lines[0] ?? '').replace(/^#/, ''));
  return lines.slice(1).map((l) => {
    const cells = splitCsv(l);
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

function findFile(prefix: string): string {
  const hit = readdirSync(DIR, { recursive: true })
    .map(String)
    .find((f) => f.split('/').pop()?.startsWith(prefix) && /\.(csv|txt)$/i.test(f));
  if (!hit) throw new Error(`no ${prefix}* under ${DIR}`);
  return join(DIR, hit);
}

type Level = 'elementary' | 'middle' | 'high' | 'other';

function levelOf(r: Record<string, string>): Level {
  if (/virtual|cyber|online/i.test(r.SCH_NAME ?? '')) return 'other';
  switch (r.LEVEL) {
    case 'Elementary':
      return 'elementary';
    case 'Middle':
      return 'middle';
    case 'High':
    case 'Secondary':
      return 'high';
    default:
      return 'other';
  }
}

function grade(g: string): string {
  return g === 'PK' ? 'PK' : g === 'KG' ? 'K' : g.replace(/^0/, '');
}

/** "Simpson Elementary School" / "peachtree corners" → match key. */
function nameKey(name: string, city: string): string {
  const n = name
    .toLowerCase()
    // "Susan Stripling Elementary" (GreatSchools) is "Stripling Elementary" in CCD.
    .replace(/\bschool\b|^susan /g, '')
    .replace(/[^a-z0-9]/g, '');
  return `${n}|${city.toLowerCase().replace(/[^a-z]/g, '')}`;
}

interface Milestones {
  year: string;
  proficientPct: number;
  subjects: Record<string, number>;
}

/** ST_SCHID → milestones summary, from EOG + EOC "All Students / ALL GRADES" rows. */
function loadMilestones(): Map<string, Milestones> {
  const out = new Map<string, Milestones>();
  const tested = new Map<string, number>();
  for (const prefix of ['EOG_', 'EOC_']) {
    let path: string;
    try {
      path = findFile(prefix);
    } catch {
      console.warn(`${prefix}* not found — proficiency skipped for that assessment`);
      continue;
    }
    for (const r of readCsv(path)) {
      if (r.SUBGROUP_NAME !== 'All Students' || r.ACDMC_LVL !== 'ALL GRADES') continue;
      // "TFS" (too few students) suppresses a cell — skip the subject rather
      // than count it as 0%.
      const n = Number.parseInt(r.NUM_TESTED_CNT ?? '', 10);
      const p = Number.parseFloat(r.PROFICIENT_PCT ?? '');
      const d = Number.parseFloat(r.DISTINGUISHED_PCT ?? '');
      if (!Number.isFinite(n) || n < 10 || !Number.isFinite(p) || !Number.isFinite(d)) continue;
      const key = `GA-${r.SCHOOL_DISTRCT_CD}-${r.INSTN_NUMBER}`;
      const cur = out.get(key) ?? {
        year: r.LONG_SCHOOL_YEAR ?? '',
        proficientPct: 0,
        subjects: {},
      };
      cur.subjects[r.TEST_CMPNT_TYP_NM ?? ''] = Math.round((p + d) * 10) / 10;
      tested.set(`${key}|${r.TEST_CMPNT_TYP_NM}`, n);
      out.set(key, cur);
    }
  }
  // Weighted by students tested, so a 98-student Algebra EOC at a middle
  // school does not count the same as its 1,100-student ELA EOG.
  for (const [key, m] of out) {
    let num = 0;
    let den = 0;
    for (const [subject, pct] of Object.entries(m.subjects)) {
      const n = tested.get(`${key}|${subject}`) ?? 0;
      num += pct * n;
      den += n;
    }
    m.proficientPct = den > 0 ? Math.round((num / den) * 10) / 10 : 0;
  }
  return out;
}

interface SchoolRow {
  nces_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: 'GA';
  zip: string | null;
  county: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  school_type: 'public' | 'charter';
  grade_range: string;
  level: Level;
  phone: string | null;
  website: string | null;
  test_scores: Record<string, unknown>;
  source_url: string;
  raw: Record<string, unknown>;
}

function buildRows(): SchoolRow[] {
  const ccd = readCsv(findFile('ccd_sch_029'), 'latin1').filter(
    (r) =>
      r.ST === 'GA' && r.UPDATED_STATUS_TEXT === 'Open' && r.SCH_TYPE_TEXT === 'Regular School',
  );
  const geo = new Map<string, { lat: number; lng: number; county: string }>();
  for (const line of readFileSync(findFile('EDGE_GEOCODE_PUBLICSCH'), 'utf8').split(/\r?\n/)) {
    const c = line.split('|');
    if (c[6] !== 'GA') continue;
    const lat = Number.parseFloat(c[12] ?? '');
    const lng = Number.parseFloat(c[13] ?? '');
    if (Number.isFinite(lat) && Number.isFinite(lng))
      geo.set(c[0] ?? '', { lat, lng, county: c[10] ?? '' });
  }
  const milestones = loadMilestones();

  return ccd.map((r) => {
    const g = geo.get(r.NCESSCH ?? '');
    const m = milestones.get(r.ST_SCHID ?? '');
    return {
      nces_id: r.NCESSCH ?? '',
      name: r.SCH_NAME ?? '',
      address: r.LSTREET1 || null,
      city: r.LCITY || null,
      state: 'GA',
      zip: r.LZIP || null,
      county: g?.county || null,
      district: r.LEA_NAME || null,
      lat: g?.lat ?? null,
      lng: g?.lng ?? null,
      school_type: r.CHARTER_TEXT === 'Yes' ? 'charter' : 'public',
      grade_range: `${grade(r.GSLO ?? '')}-${grade(r.GSHI ?? '')}`,
      level: levelOf(r),
      phone: r.PHONE || null,
      website: r.WEBSITE || null,
      test_scores: m ? { ga_milestones: m } : {},
      source_url: 'https://nces.ed.gov/ccd/files.asp',
      raw: { st_schid: r.ST_SCHID, nces_level: r.LEVEL, charter: r.CHARTER_TEXT },
    };
  });
}

function loadEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from env');
    process.exit(1);
  }
  return { url, key };
}

async function main() {
  const rows = buildRows();
  const withGeo = rows.filter((r) => r.lat !== null).length;
  const withScores = rows.filter((r) => 'ga_milestones' in r.test_scores).length;
  console.log(
    `GA schools: ${rows.length} open regular · ${withGeo} geocoded · ${withScores} with Milestones · ` +
      `${rows.filter((r) => r.school_type === 'charter').length} charter`,
  );

  const { url, key } = loadEnv();
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: existing, error } = await sb
    .from('k12_schools')
    .select('id, nces_id, name, city')
    .is('nces_id', null);
  if (error) throw new Error(error.message);
  const legacy = new Map((existing ?? []).map((e) => [nameKey(e.name, e.city ?? ''), e.id]));

  const updates: { id: string; row: SchoolRow }[] = [];
  const inserts: (SchoolRow & { source: 'nces' })[] = [];
  for (const row of rows) {
    const id = legacy.get(nameKey(row.name, row.city ?? ''));
    if (id) updates.push({ id, row });
    else inserts.push({ ...row, source: 'nces' });
  }
  console.log(`${updates.length} legacy rows to update in place, ${inserts.length} to upsert`);
  for (const u of updates) console.log(`  update ${u.id} ← ${u.row.name}, ${u.row.city}`);
  if (!APPLY) {
    console.log('dry run — pass --apply to write');
    return;
  }

  for (const u of updates) {
    const { error: e } = await sb.from('k12_schools').update(u.row).eq('id', u.id);
    if (e) throw new Error(`update ${u.id}: ${e.message}`);
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const { error: e } = await sb
      .from('k12_schools')
      .upsert(inserts.slice(i, i + 200), { onConflict: 'nces_id' });
    if (e) throw new Error(`upsert @${i}: ${e.message}`);
  }
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
