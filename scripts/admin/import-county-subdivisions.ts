/**
 * Import recorded-plat SUBDIVISION polygons from a county GIS service.
 *
 * The Nextdoor seeds are a resident's idea of a neighbourhood: 8,679 hand-drawn
 * shapes that leave slivers between them and are often named for a landmark
 * rather than the place a buyer says they live. A county's plat layer is the
 * legal answer — every lot in the metro was subdivided by a recorded plat — and
 * it is public record, free, and comes as polygons. `match_community`
 * (20260907200000) already prefers a subdivision over a neighbourhood, so
 * importing these moves listings onto the more specific boundary with no other
 * change. Owner rule 2026-09-07: subdivision beats Nextdoor on conflict.
 *
 * ── What a plat layer is NOT ───────────────────────────────────────────────
 *
 * Plats are filed per PHASE, so one community is many rows ("KILLIAN WOODS" +
 * "UNIT 2", "UNIT 3"). This groups them by name and stores the phases as one
 * MultiPolygon — a buyer knows "Killian Woods", not "Killian Woods Unit 2".
 * None of the six metro counties carries a builder or developer field, so
 * `communities.builder` is not populated here; builder is a later attribute.
 *
 * ── Never orphan existing content ─────────────────────────────────────────
 *
 * Every Gwinnett community already has a cover photo and most have a
 * description, attributes and POIs. Where a plat name matches an existing
 * community IN THE SAME PLACE (name equal, plat centroid inside the existing
 * polygon), this UPGRADES that row — kind → subdivision, boundary → the plat —
 * instead of inserting a second row for the same neighbourhood, which would
 * win the match and show the buyer a community with no photo. A name that
 * matches somewhere else in the county is a different place and gets its own
 * row.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-county-subdivisions.ts --county gwinnett
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/import-county-subdivisions.ts --county gwinnett --apply
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply. The fetched layer is
 * cached under /tmp so a re-run costs no bandwidth.
 *
 * After --apply, re-run `relink-listings.ts` so listings move to the new
 * polygons.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  type GeoJsonPolygonLike,
  bboxOf,
  pointInBbox,
  pointInPolygon,
} from '../../apps/web/lib/geo/point-in-polygon.js';
import { slugify } from '../../apps/web/lib/utils/slug.js';

/**
 * One county's plat layer. All six metro counties publish ArcGIS REST, so the
 * only thing that varies is the URL, which field holds the name, and how the
 * layer marks a polygon as residential.
 *
 * Verified 2026-09-07; feature counts are that day's.
 */
type CountyLayer = {
  county: string;
  url: string;
  nameField: string;
  /** Values of `codeField` that are somewhere a person lives. */
  residential?: { codeField: string; keep: string[] };
};

const LAYERS: Record<string, CountyLayer> = {
  // 8,796 polygons. The only county that pre-splits name from phase (DEVNAME +
  // DEVDESC), which is why it is the reference implementation.
  gwinnett: {
    county: 'Gwinnett',
    url: 'https://gis3.gwinnettcounty.com/mapvis/rest/services/accela/agis_gwinnett/MapServer/23',
    nameField: 'DEVNAME',
    // Drops APARTMENT (rentals), OFFICE/CONDO, OTHER (commercial centres),
    // Mobilehome and the 138 uncoded rows: 8,796 → 8,492 phases.
    residential: { codeField: 'LCODE', keep: ['SUBDIV', 'TOWNHOME', 'CONDO'] },
  },
};

const APPLY = process.argv.includes('--apply');
const countyArg = process.argv[process.argv.indexOf('--county') + 1];
const LAYER = countyArg ? LAYERS[countyArg] : undefined;
if (!LAYER) {
  console.error(`--county <${Object.keys(LAYERS).join('|')}> required`);
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

type Ring = number[][];
type Feature = { properties: Record<string, unknown>; geometry: GeoJsonPolygonLike | null };

/** Every page of the layer, as GeoJSON in WGS84. Cached under /tmp. */
async function fetchLayer(layer: CountyLayer): Promise<Feature[]> {
  const cache = `/tmp/percho-subdivisions-${layer.county.toLowerCase()}.geojson`;
  if (existsSync(cache)) {
    console.log(`using cached ${cache}`);
    return JSON.parse(readFileSync(cache, 'utf8')).features as Feature[];
  }
  const where = layer.residential
    ? `${layer.residential.codeField} IN (${layer.residential.keep.map((k) => `'${k}'`).join(',')})`
    : '1=1';
  const out: Feature[] = [];
  for (let offset = 0; ; offset += 1000) {
    const url =
      `${layer.url}/query?where=${encodeURIComponent(where)}` +
      `&outFields=${layer.nameField}&returnGeometry=true&outSR=4326&f=geojson` +
      `&resultOffset=${offset}&resultRecordCount=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${layer.county} layer: HTTP ${res.status}`);
    const page = (await res.json()) as { features?: Feature[] };
    if (!page.features) throw new Error(`${layer.county} layer returned no features at ${offset}`);
    out.push(...page.features);
    process.stderr.write(`\rfetched ${out.length}`);
    if (page.features.length < 1000) break;
  }
  process.stderr.write('\n');
  writeFileSync(cache, JSON.stringify({ type: 'FeatureCollection', features: out }));
  return out;
}

/** Shoelace area of a ring, signed. */
function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p = ring[i] as number[];
    const q = ring[j] as number[];
    a += (q[0] as number) * (p[1] as number) - (p[0] as number) * (q[1] as number);
  }
  return a / 2;
}

/**
 * Area-weighted centroid of a set of polygons — the anchor and the point the
 * map flies to. A plain average of the vertices would be dragged around by
 * whichever phase happens to have the most of them.
 */
function centroidOf(polys: Ring[][]): { lat: number; lng: number } | null {
  let cx = 0;
  let cy = 0;
  let total = 0;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring) continue;
    const a = ringArea(ring);
    if (a === 0) continue;
    let x = 0;
    let y = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const p = ring[i] as number[];
      const q = ring[j] as number[];
      const f = (q[0] as number) * (p[1] as number) - (p[0] as number) * (q[1] as number);
      x += ((q[0] as number) + (p[0] as number)) * f;
      y += ((q[1] as number) + (p[1] as number)) * f;
    }
    cx += (x / (6 * a)) * Math.abs(a);
    cy += (y / (6 * a)) * Math.abs(a);
    total += Math.abs(a);
  }
  return total ? { lng: cx / total, lat: cy / total } : null;
}

/** `SWEET BOTTOM PLANTATION` → `Sweet Bottom Plantation`. */
const LOWER_WORDS = new Set(['of', 'at', 'the', 'and', 'on', 'in']);
function titleCase(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && LOWER_WORDS.has(w) ? w : w.replace(/^[a-z]/, (c) => c.toUpperCase())))
    .join(' ');
}

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * Plats for places nobody lives, which the land-use code misses.
 *
 * Gwinnett codes "GWINNETT PLACE COMMERCIAL CENTER" and "NORCROSS SOUTHERN
 * INDUSTRIAL DISTRICT" as LCODE=SUBDIV — the code says "this is a platted
 * development", not "this is housing". 136 of 4,366 names say so themselves.
 * Deliberately conservative: it matches the industrial/retail words only, so
 * "Village at …" and "Towne Center …" residential names survive.
 */
const NOT_A_PLACE_TO_LIVE =
  /\b(COMMERCIAL|BUSINESS PARK|SHOPPING|OFFICE PARK|INDUSTRIAL|RETAIL|WAREHOUSE|CORPORATE)\b/;

type Existing = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  source: string;
  boundary: GeoJsonPolygonLike;
  bbox: [number, number, number, number];
};

async function fetchExisting(county: string): Promise<Existing[]> {
  const out: Existing[] = [];
  for (let from = 0; ; from += 200) {
    const { data, error } = await sb
      .from('communities')
      .select('id, slug, name, city, source, boundary')
      .eq('county', county)
      .not('boundary', 'is', null)
      .order('id')
      .range(from, from + 199);
    if (error) throw new Error(error.message);
    for (const row of data as Omit<Existing, 'bbox'>[]) {
      const bbox = bboxOf(row.boundary);
      if (bbox) out.push({ ...row, bbox });
    }
    if (data.length < 200) break;
  }
  return out;
}

/**
 * Every slug in the table, not just this county's.
 *
 * `communities.slug` is globally unique, and subdivision names repeat across
 * the metro — a Gwinnett "River Club" collided with one that already existed
 * elsewhere and aborted a run mid-way.
 */
async function fetchAllSlugs(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('communities')
      .select('slug')
      .order('slug')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data as { slug: string }[]) out.add(row.slug);
    if (data.length < 1000) break;
  }
  return out;
}

function containing(lat: number, lng: number, rows: Existing[]): Existing | undefined {
  return rows.find((e) => pointInBbox(lng, lat, e.bbox) && pointInPolygon(lng, lat, e.boundary));
}

async function main() {
  const layer = LAYER as CountyLayer;
  const features = await fetchLayer(layer);

  // Plats are filed per phase; a community is all the phases sharing a name.
  const groups = new Map<string, { raw: string; phases: number; polys: Ring[][] }>();
  const commercial = new Set<string>();
  for (const f of features) {
    if (!f.geometry) continue;
    const raw = String(f.properties[layer.nameField] ?? '').trim();
    if (!raw) continue;
    const key = normalize(raw);
    if (NOT_A_PLACE_TO_LIVE.test(key)) {
      commercial.add(key);
      continue;
    }
    let g = groups.get(key);
    if (!g) {
      g = { raw, phases: 0, polys: [] };
      groups.set(key, g);
    }
    g.phases++;
    if (f.geometry.type === 'Polygon') g.polys.push(f.geometry.coordinates);
    else g.polys.push(...f.geometry.coordinates);
  }

  const existing = await fetchExisting(layer.county);
  const byName = new Map<string, Existing[]>();
  for (const e of existing) {
    const key = normalize(e.name);
    const list = byName.get(key);
    if (list) list.push(e);
    else byName.set(key, [e]);
  }
  const usedSlugs = await fetchAllSlugs();

  type Plan = {
    name: string;
    slug: string;
    city: string | null;
    phases: number;
    centroid: { lat: number; lng: number };
    boundary: { type: 'MultiPolygon'; coordinates: Ring[][] };
    upgradeOf?: Existing;
  };
  const plans: Plan[] = [];
  let noCentroid = 0;
  for (const [key, g] of groups) {
    const centroid = centroidOf(g.polys);
    if (!centroid) {
      noCentroid++;
      continue;
    }
    // The plat layer has no city; the containing Nextdoor polygon does, and it
    // is the same POSTAL city convention the rest of the table uses.
    const inside = containing(centroid.lat, centroid.lng, existing);
    const sameName = byName.get(key);
    // A row this importer already wrote for this name is the same subdivision
    // by construction — re-running refreshes its boundary, which is what makes
    // the script safe to restart after a failure and safe to run again when
    // the county republishes the layer. No geometry test: an area-weighted
    // centroid of disjoint phases can legitimately fall outside them all.
    // Otherwise: same name AND the same place, since a name that repeats
    // elsewhere in the county is a different subdivision.
    const upgradeOf =
      sameName?.find((e) => e.source === 'county_gis') ??
      sameName?.find((e) => pointInPolygon(centroid.lng, centroid.lat, e.boundary));
    const name = titleCase(g.raw);
    let slug = upgradeOf?.slug ?? slugify(name, { fallback: 'subdivision' });
    if (!upgradeOf) {
      let n = 2;
      const base = slug;
      while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
      usedSlugs.add(slug);
    }
    plans.push({
      name,
      slug,
      city: upgradeOf?.city ?? inside?.city ?? null,
      phases: g.phases,
      centroid,
      boundary: { type: 'MultiPolygon', coordinates: g.polys },
      ...(upgradeOf ? { upgradeOf } : {}),
    });
  }

  const refreshes = plans.filter((p) => p.upgradeOf?.source === 'county_gis');
  const upgrades = plans.filter((p) => p.upgradeOf && p.upgradeOf.source !== 'county_gis');
  const inserts = plans.filter((p) => !p.upgradeOf);
  const noCity = plans.filter((p) => !p.city).length;
  console.log(
    `\n${layer.county}: ${features.length} plat polygons → ${plans.length} subdivisions` +
      `${noCentroid ? ` (${noCentroid} with unusable geometry, skipped)` : ''}`,
  );
  console.log(`  ${commercial.size} names dropped as commercial or industrial`);
  console.log(`  ${upgrades.length} upgrade an existing community in place (keeps its photo)`);
  console.log(`  ${inserts.length} are new rows`);
  if (refreshes.length) console.log(`  ${refreshes.length} refresh a row a previous run wrote`);
  console.log(`  ${noCity} have no city — no existing polygon contains their centre`);
  console.log('\nupgrades, first 8:');
  for (const p of upgrades.slice(0, 8)) {
    console.log(`  ${p.upgradeOf?.name} → ${p.name} (${p.phases} phases, slug kept: ${p.slug})`);
  }
  console.log('\nnew rows, first 8:');
  for (const p of inserts.slice(0, 8)) {
    console.log(`  ${p.name} (${p.phases} phases, ${p.city ?? 'no city'})`);
  }

  if (!APPLY) {
    console.log('\n--- dry run, nothing written ---');
    return;
  }

  let done = 0;
  for (const p of plans) {
    const row = {
      name: p.name,
      slug: p.slug,
      city: p.city,
      state: 'GA',
      county: layer.county,
      kind: 'subdivision',
      status: 'active',
      source: 'county_gis',
      boundary: p.boundary,
      boundary_source: 'arcgis',
      lat: p.centroid.lat,
      lng: p.centroid.lng,
    };
    const { error } = p.upgradeOf
      ? await sb
          .from('communities')
          .update({
            kind: row.kind,
            boundary: row.boundary,
            boundary_source: row.boundary_source,
            lat: row.lat,
            lng: row.lng,
          })
          .eq('id', p.upgradeOf.id)
      : await sb.from('communities').insert(row);
    if (error) throw new Error(`${p.slug}: ${error.message}`);
    done++;
    if (done % 200 === 0) process.stderr.write(`\rwrote ${done}/${plans.length}`);
  }
  process.stderr.write('\n');
  console.log(
    `${upgrades.length} upgraded, ${inserts.length} inserted, ${refreshes.length} refreshed.`,
  );
  console.log('Now re-run relink-listings.ts so listings move to the new polygons.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
