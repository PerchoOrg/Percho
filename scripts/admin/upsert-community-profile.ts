/**
 * Write `communities.profile` — what a community's explore page says — for
 * one community or for all of them.
 *
 * A profile is computed from what Percho already holds (nearest schools
 * against the state, the city's home value against the metro, the words
 * residents use against their neighbours — `lib/communities/profile-build.ts`)
 * and then overlaid, block by block, with whatever was researched by hand for
 * that community under `scripts/admin/community-profiles/<slug>.json`. This
 * script is the only writer, and it refuses anything
 * `lib/zod/community-profile.ts` does not accept, so the page can trust what
 * it reads.
 *
 * Inputs beside the database, all in `scripts/admin/data/`:
 *   zhvi-ga.json       Zillow's home value index per Georgia city (`import-zhvi.ts`)
 *   city-events.json   dated things per city; the phone drops what has passed
 *
 * Idempotent: every profile is recomputed and only the ones that differ from
 * what is stored are written, so re-run it after a school-score import, a new
 * Zillow month, or an edit to a researched document.
 *
 * Runs with the service role. CLAUDE.md §3 permits that here: this file lives
 * in scripts/admin/ and is invoked by hand.
 *
 * Usage (repo-root .env.local, or the two variables in the environment):
 *   pnpm --filter @percho/web community:profile windward            # one, printed
 *   pnpm --filter @percho/web community:profile windward --apply
 *   pnpm --filter @percho/web community:profile --all
 *   pnpm --filter @percho/web community:profile --all --apply
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import {
  type BuildCommunity,
  type BuildSchool,
  type CountyCosts,
  type SafetyFacts,
  type ZhviExtract,
  buildContext,
  buildProfile,
  mergeProfile,
} from '../../apps/web/lib/communities/profile-build.js';
import { milestones } from '../../apps/web/lib/listings/schools.js';
import {
  type StoredCommunityProfile,
  communityProfileResearchSchema,
  communityProfileSchema,
} from '../../apps/web/lib/zod/community-profile.js';

const here = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const SLUGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** PostgREST caps a read at 1000 rows whatever the range asks for; page everything. */
const PAGE = 1000;
const WRITERS = 8;

type Row = BuildCommunity & { id: string; profile: unknown };

async function pageAll<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error(`read failed: ${JSON.stringify(error)}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

function json<T>(file: string): T {
  return JSON.parse(readFileSync(join(here, file), 'utf8')) as T;
}

/** Key order is not meaning: jsonb hands a document back with its keys re-ordered. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/** The researched document for a slug, or null. Exits on one that does not fit. */
function research(slug: string): Partial<StoredCommunityProfile> | null {
  const file = join(here, 'community-profiles', `${slug}.json`);
  if (!existsSync(file)) return null;
  const parsed = communityProfileResearchSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    console.error(`${file} does not fit the profile schema:`);
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

async function readCosts(sb: SupabaseClient): Promise<Map<string, CountyCosts>> {
  const metrics = {
    property_tax_rate_pct: 'taxRatePct',
    electric_monthly_usd: 'electric',
    water_monthly_usd: 'water',
    trash_monthly_usd: 'trash',
  } as const;
  const rows = await pageAll<{
    area_key: string;
    metric: string;
    value: number;
    estimated: boolean;
  }>((from, to) =>
    sb
      .from('area_metrics')
      .select('area_key, metric, value, estimated')
      .eq('area_kind', 'county')
      .in('metric', Object.keys(metrics))
      .order('id')
      .range(from, to),
  );
  const costs = new Map<string, CountyCosts>();
  for (const r of rows) {
    const field = metrics[r.metric as keyof typeof metrics];
    if (!field) continue;
    const entry = costs.get(r.area_key) ?? {};
    entry[field] = { value: r.value, estimated: r.estimated };
    costs.set(r.area_key, entry);
  }
  return costs;
}

async function main() {
  if (!ALL && SLUGS.length === 0) {
    console.error('Usage: community:profile <slug> [<slug> …] | --all  [--apply]');
    process.exit(1);
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
  const sb = createClient(url, serviceKey);

  // Ranks are against everyone, so everyone is read even to build one profile.
  const [rows, schoolRows, costs, schoolPois] = await Promise.all([
    pageAll<Row>((from, to) =>
      sb
        .from('communities')
        .select(
          'id, slug, name, builder, city, county, lat, lng, residents_count, attributes, nextdoor_url, website, profile',
        )
        .eq('status', 'active')
        .order('id')
        .range(from, to),
    ),
    pageAll<{
      name: string;
      level: string | null;
      lat: number | null;
      lng: number | null;
      test_scores: unknown;
    }>((from, to) =>
      sb
        .from('k12_schools')
        .select('name, level, lat, lng, test_scores')
        .order('id')
        .range(from, to),
    ),
    readCosts(sb),
    // The schools a community's own place list names — what its film visits.
    pageAll<{ community_id: string; pois: { display_name: string } | null }>((from, to) =>
      sb
        .from('community_pois')
        .select('community_id, pois(display_name)')
        .eq('intent_bucket', 'schools')
        .order('community_id')
        .order('poi_id')
        .range(from, to),
    ),
  ]);
  const named = new Map<string, string[]>();
  for (const p of schoolPois) {
    if (!p.pois?.display_name) continue;
    named.set(p.community_id, [...(named.get(p.community_id) ?? []), p.pois.display_name]);
  }
  const communities = rows.map((c) => {
    const schoolNames = named.get(c.id);
    return schoolNames ? { ...c, schoolNames } : c;
  });

  // A school with no published score has no rank; it is left out of the ranking
  // rather than counted as last.
  const schools: BuildSchool[] = [];
  for (const s of schoolRows) {
    const m = milestones(s.test_scores as Parameters<typeof milestones>[0]);
    if (!m || typeof s.lat !== 'number' || typeof s.lng !== 'number') continue;
    if (s.level !== 'elementary' && s.level !== 'middle' && s.level !== 'high') continue;
    schools.push({ name: s.name, level: s.level, lat: s.lat, lng: s.lng, pct: Math.round(m.pct) });
  }

  const zhvi = json<ZhviExtract>('data/zhvi-ga.json');
  const events = new Map(
    Object.entries(
      json<Record<string, { source: string; events: StoredCommunityProfile['events'] }>>(
        'data/city-events.json',
      ),
    ).map(([city, v]) => [city, { source: v.source, events: v.events ?? [] }]),
  );
  // Looked up per community by `import-community-safety.ts`; absent until
  // someone has run it.
  const safety = existsSync(join(here, 'data/community-safety.json'))
    ? new Map(
        Object.entries(
          json<{ communities: Record<string, SafetyFacts> }>('data/community-safety.json')
            .communities,
        ),
      )
    : undefined;
  const ctx = buildContext({
    communities,
    schools,
    zhvi,
    costs,
    events,
    ...(safety ? { safety } : {}),
    asOf: new Date().toISOString().slice(0, 10),
  });
  console.log(
    `${communities.length} communities, ${schools.length} scored schools, ${zhvi.cities.length} cities (Zillow ${zhvi.asOf}), ${costs.size} counties`,
  );

  const targets = ALL ? communities : communities.filter((c) => SLUGS.includes(c.slug));
  const missing = ALL ? [] : SLUGS.filter((s) => !targets.some((c) => c.slug === s));
  if (missing.length > 0)
    throw new Error(`No active community with slug "${missing.join('", "')}"`);

  const writes: { id: string; slug: string; profile: StoredCommunityProfile | null }[] = [];
  const tally = new Map<string, number>();
  const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);
  let invalid = 0;
  for (const c of targets) {
    const researched = research(c.slug);
    const merged = mergeProfile(buildProfile(c, ctx), researched);
    let profile: StoredCommunityProfile | null = null;
    if (merged) {
      const parsed = communityProfileSchema.safeParse(merged);
      if (!parsed.success) {
        invalid += 1;
        if (invalid <= 10) {
          const issue = parsed.error.issues[0];
          console.warn(`  ${c.slug}: ${issue?.path.join('.')}: ${issue?.message}`);
        }
        continue;
      }
      profile = parsed.data;
    }
    bump(profile ? 'with a profile' : 'nothing to say');
    if (profile) {
      if (researched) bump('researched');
      for (const block of ['ranks', 'homeValue', 'words', 'dues', 'events', 'links'] as const) {
        if (profile[block]) bump(block);
      }
      if (profile.homeValue?.holding) bump('holding cost');
      if (profile.verdict.good.length + profile.verdict.watch.length > 0) bump('verdict');
    }
    // A profile's `asOf` is today; it alone is not a reason to rewrite a row.
    const strip = (p: unknown) =>
      p && typeof p === 'object' ? canonical({ ...p, asOf: undefined }) : canonical(p ?? null);
    if (strip(profile) !== strip(c.profile)) writes.push({ id: c.id, slug: c.slug, profile });
  }

  for (const [k, n] of tally) console.log(`  ${k}: ${n}`);
  if (invalid > 0) console.warn(`  did not fit the schema, left as they are: ${invalid}`);
  console.log(`${writes.length} of ${targets.length} differ from what is stored`);
  if (!ALL) console.log(JSON.stringify(writes[0]?.profile ?? targets[0]?.profile, null, 2));

  if (!APPLY) {
    console.log('\nDRY RUN. Re-run with --apply to write.');
    return;
  }
  // Fail the run on a profile that would not fit rather than write the rest
  // and leave some pages on yesterday's figures unannounced.
  if (invalid > 0) throw new Error(`${invalid} profiles do not fit the schema; nothing written`);

  let done = 0;
  const queue = [...writes];
  await Promise.all(
    Array.from({ length: WRITERS }, async () => {
      for (let w = queue.pop(); w; w = queue.pop()) {
        // `updated_at` is left alone: the row's own content did not change, and
        // 22,730 rows all "updated today" would bury the ones that really were.
        const { error } = await sb
          .from('communities')
          .update({ profile: w.profile })
          .eq('id', w.id);
        if (error) throw new Error(`${w.slug}: ${error.message}`);
        done += 1;
        if (done % 2000 === 0) console.log(`  ${done} written`);
      }
    }),
  );
  console.log(`wrote ${done} profiles`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
