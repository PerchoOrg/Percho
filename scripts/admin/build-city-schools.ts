/**
 * Lists every scored public school with a city's address, each with where it
 * stands in Georgia, and writes `apps/web/lib/cities/city-schools.json` for
 * the city page's Schools sheet (phase372).
 *
 * The page named three schools — the best-ranked at each level from the
 * researched profile — and the owner asked where the rest were (2026-11-22:
 * "学校应该有很多吧 只看到三个"). A city's profile carries the handful a
 * publisher ranked; this is all of them, from `k12_schools`.
 *
 * Standing is the community page's: the share of Georgia's schools at that
 * level a school is within by Georgia Milestones proficiency, rounded UP so
 * the claim is never better than the rank ("Top 38%", never "bottom").
 * "A city's schools" means the schools whose mailing city is the city, plus
 * any within `AROUND_MILES` of its centre — Johns Creek has two schools with
 * a Johns Creek address and a dozen inside it with an Alpharetta or Duluth
 * one. Nearby schools, as everywhere on these pages; not an attendance zone.
 *
 *   pnpm --filter @percho/web city:schools
 *
 * Re-run after a school-score import or when a city is added. Reads only.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { milesBetween } from '../../apps/web/lib/communities/profile-build.js';
import { milestones } from '../../apps/web/lib/listings/schools.js';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, '../../apps/web/lib/cities/city-schools.json');
const PAGE = 1000;
/** A school this close to the city's centre is the city's, whatever its mailing address says. */
const AROUND_MILES = 3.5;
const LEVELS = ['elementary', 'middle', 'high'] as const;
type Level = (typeof LEVELS)[number];

interface SchoolRow {
  name: string;
  level: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  test_scores: unknown;
}

async function main() {
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
  const sb = createClient(url, serviceKey);

  // Standing is against everyone, so everyone is read. Paged: PostgREST caps
  // a read at 1,000 rows whatever range is asked for.
  const rows: SchoolRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('k12_schools')
      .select('name, level, city, lat, lng, test_scores')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read failed: ${JSON.stringify(error)}`);
    rows.push(...((data ?? []) as SchoolRow[]));
    if ((data ?? []).length < PAGE) break;
  }
  const scored = rows.flatMap((s) => {
    const m = milestones(s.test_scores as Parameters<typeof milestones>[0]);
    const level = LEVELS.find((l) => l === s.level);
    return m && level ? [{ ...s, level, pct: Math.round(m.pct) }] : [];
  });
  const byLevel = Object.fromEntries(
    LEVELS.map((l) => [l, scored.filter((s) => s.level === l).map((s) => s.pct)]),
  ) as Record<Level, number[]>;

  const { data: cities, error } = await sb
    .from('cities')
    .select('slug, name, lat, lng')
    .eq('status', 'active');
  if (error) throw new Error(`read failed: ${JSON.stringify(error)}`);

  const out: Record<
    string,
    Array<{ name: string; level: Level; share: number; miles?: number }>
  > = {};
  for (const c of (cities ?? []).sort((a, b) => a.slug.localeCompare(b.slug))) {
    const centre =
      typeof c.lat === 'number' && typeof c.lng === 'number' ? { lat: c.lat, lng: c.lng } : null;
    const mine = scored.filter((s) => {
      if ((s.city ?? '').trim().toLowerCase() === c.name.trim().toLowerCase()) return true;
      return (
        centre !== null &&
        typeof s.lat === 'number' &&
        typeof s.lng === 'number' &&
        milesBetween(centre.lat, centre.lng, s.lat, s.lng) <= AROUND_MILES
      );
    });
    out[c.slug] = mine
      .map((s) => {
        const all = byLevel[s.level];
        const rank = all.filter((v) => v > s.pct).length + 1;
        const share = Math.min(100, Math.max(1, Math.ceil((rank / all.length) * 100)));
        const miles =
          centre !== null && typeof s.lat === 'number' && typeof s.lng === 'number'
            ? Math.round(milesBetween(centre.lat, centre.lng, s.lat, s.lng) * 10) / 10
            : undefined;
        return { name: s.name, level: s.level, share, ...(miles !== undefined ? { miles } : {}) };
      })
      .sort(
        (a, b) =>
          LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) ||
          a.share - b.share ||
          a.name.localeCompare(b.name),
      );
    console.log(`  ${c.slug}: ${out[c.slug]?.length ?? 0} schools`);
  }
  writeFileSync(
    FILE,
    `${JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), measure: 'Georgia Milestones', of: Object.fromEntries(LEVELS.map((l) => [l, byLevel[l].length])), cities: out }, null, 2)}\n`,
  );
  console.log(`${rows.length} schools read, ${scored.length} scored. Wrote ${FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
