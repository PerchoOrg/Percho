/**
 * Merge one community row into another.
 *
 * Nextdoor is the seed for 731 of these rows and it carves an area up its own
 * way, which does not always agree with the MLS. Windward is the case this was
 * written for (2026-09-03): Nextdoor has `windward` (4,589 residents) and
 * `lakewindward` (1,327) as separate neighbourhoods, FMLS calls the whole area
 * subdivision WINDWARD, and the owner's call was to follow FMLS. Expect more of
 * these, hence a script rather than a one-off.
 *
 * WHAT MOVES: every row that points at the source community — listings, POI
 * links, photo sources, tour runs, assemblies, generated videos, leads — is
 * repointed at the target.
 *
 * WHAT MERGES: the BOUNDARY, and this is the part that is easy to get wrong.
 * `lib/geo/find-community.ts` associates a listing by point-in-polygon, so
 * repointing a listing without taking the source's polygon with it leaves a
 * `community_id` that the next auto-association will contradict — the target's
 * polygon does not contain the address, which is precisely why the listing was
 * in the source to begin with. The two polygons are unioned as a MultiPolygon.
 * That is exact when they are disjoint or merely touching, which is the case
 * for two Nextdoor neighbourhoods; it does NOT dissolve a shared border, so a
 * genuinely overlapping pair would keep a seam. Point-in-polygon is unaffected
 * either way — a point inside either ring is inside the union.
 *
 * WHAT IS NOT DELETED: the source row. It is set `status='inactive'` and keeps
 * its own boundary, so the merge is one UPDATE away from being undone. Deleting
 * communities is not this script's job.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/merge-communities.ts <from-slug> <into-slug>
 *   …                                                                          <from-slug> <into-slug> --apply
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const [fromSlug, intoSlug] = args.filter((a) => !a.startsWith('--'));
if (!fromSlug || !intoSlug) {
  console.error('usage: merge-communities <from-slug> <into-slug> [--apply]');
  process.exit(1);
}
if (fromSlug === intoSlug) {
  console.error('from and into are the same community');
  process.exit(1);
}

function envPath(): string {
  const explicit = process.env.PERCHO_ENV_FILE;
  if (explicit) return explicit;
  for (const c of [
    new URL('../../.env.local', import.meta.url).pathname,
    `${process.env.HOME}/Workspace/Percho/.env.local`,
  ]) {
    if (existsSync(c)) return c;
  }
  throw new Error('no .env.local found; set PERCHO_ENV_FILE');
}

const env = Object.fromEntries(
  readFileSync(envPath(), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ''),
      ];
    }),
);

// biome-ignore lint/suspicious/noExplicitAny: an admin script, not app code.
const sb: any = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * Every table with a `community_id`, and how a row is addressed for the update.
 * `community_pois` is keyed by (community_id, poi_id) rather than an id, which
 * also means a POI both communities already link to would collide — those are
 * left on the source rather than failing the run.
 */
const TABLES = [
  'listings',
  'community_videos',
  'community_photo_sources',
  'community_tour_runs',
  'tour_assemblies',
  'ai_tour_videos',
  'generated_videos',
  'photo_clips',
  'leads',
] as const;

type Ring = number[][];
interface GeoPolygon {
  type: 'Polygon';
  coordinates: Ring[];
}
interface GeoMultiPolygon {
  type: 'MultiPolygon';
  coordinates: Ring[][];
}
type Geom = GeoPolygon | GeoMultiPolygon;

/** Both boundaries as one MultiPolygon. See the header on what this does not do. */
function unionBoundary(a: Geom | null, b: Geom | null): Geom | null {
  const partsOf = (g: Geom | null): Ring[][] =>
    !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const coordinates = [...partsOf(a), ...partsOf(b)];
  if (coordinates.length === 0) return null;
  return { type: 'MultiPolygon', coordinates };
}

async function main() {
  const { data: rows } = await sb
    .from('communities')
    .select('id, slug, name, city, state, status, boundary')
    .in('slug', [fromSlug, intoSlug]);
  const from = (rows ?? []).find((r: { slug: string }) => r.slug === fromSlug);
  const into = (rows ?? []).find((r: { slug: string }) => r.slug === intoSlug);
  if (!from) throw new Error(`no community with slug "${fromSlug}"`);
  if (!into) throw new Error(`no community with slug "${intoSlug}"`);

  console.log(`${from.name} (${from.slug}) → ${into.name} (${into.slug})`);

  // What points at the source, counted before anything moves.
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const { count, error } = await sb
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('community_id', from.id);
    // A table that does not exist in this database is not an error worth
    // stopping for; the list is deliberately broader than any one schema.
    if (!error) counts[table] = count ?? 0;
  }
  const { data: fromLinks } = await sb
    .from('community_pois')
    .select('poi_id')
    .eq('community_id', from.id);
  const { data: intoLinks } = await sb
    .from('community_pois')
    .select('poi_id')
    .eq('community_id', into.id);
  const held = new Set((intoLinks ?? []).map((r: { poi_id: string }) => r.poi_id));
  const movable = (fromLinks ?? []).filter((r: { poi_id: string }) => !held.has(r.poi_id));
  const collide = (fromLinks ?? []).length - movable.length;

  for (const [t, n] of Object.entries(counts)) if (n > 0) console.log(`  ${t}: ${n}`);
  console.log(`  community_pois: ${movable.length} to move, ${collide} already on the target`);

  const boundary = unionBoundary(from.boundary, into.boundary);
  const ringCount = (g: Geom | null) =>
    !g ? 0 : g.type === 'Polygon' ? g.coordinates.length : g.coordinates.length;
  console.log(
    `  boundary: ${ringCount(into.boundary)} + ${ringCount(from.boundary)} → ` +
      `${ringCount(boundary)} rings`,
  );

  if (!APPLY) {
    console.log('\n--- dry run, nothing written ---');
    return;
  }

  for (const [table, n] of Object.entries(counts)) {
    if (n === 0) continue;
    const { error } = await sb
      .from(table)
      .update({ community_id: into.id })
      .eq('community_id', from.id);
    if (error) throw new Error(`${table} repoint failed: ${error.message}`);
    console.log(`  ${table}: ${n} moved`);
  }

  for (const link of movable) {
    const { error } = await sb
      .from('community_pois')
      .update({ community_id: into.id })
      .eq('community_id', from.id)
      .eq('poi_id', link.poi_id);
    if (error) throw new Error(`community_pois repoint failed: ${error.message}`);
  }
  console.log(`  community_pois: ${movable.length} moved, ${collide} left on the source`);

  const { error: bErr } = await sb.from('communities').update({ boundary }).eq('id', into.id);
  if (bErr) throw new Error(`boundary union failed: ${bErr.message}`);

  const { error: sErr } = await sb
    .from('communities')
    .update({ status: 'inactive' })
    .eq('id', from.id);
  if (sErr) throw new Error(`source deactivation failed: ${sErr.message}`);

  console.log(`\ndone: ${from.slug} is inactive, ${into.slug} carries both boundaries`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
