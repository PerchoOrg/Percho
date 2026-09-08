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
  cleanName,
  isPodOf,
  isSamePlace,
  normalizeName,
  sayable,
  squash,
  titleCaseName,
  unwrap,
} from '../../apps/web/lib/communities/naming.js';
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
  // 8,719 polygons. No land-use code; the junk is names like '1ST FLOOR' and
  // '2ND FLOOR', condo floors recorded as subdivisions, which `cleanName`
  // drops for being under three characters of real name — they are caught by
  // the numeric-name guard instead.
  cobb: {
    county: 'Cobb',
    url: 'https://gis.cobbcounty.gov/gisserver/rest/services/cobbpublic/Parcels/MapServer/2',
    nameField: 'SUBDIVNAME',
  },
  // 6,281 polygons, phase inside the name ('CREEK PARK HILLS UNIT 9').
  dekalb: {
    county: 'DeKalb',
    url: 'https://dcgis.dekalbcountyga.gov/mapping/rest/services/Subdivision/FeatureServer/0',
    nameField: 'SUBDIV_NAME',
  },
  // 3,964 polygons, mostly whole subdivisions already. Its service says the
  // data is for 'your personal use'; owner accepted that wording 2026-09-07.
  fulton: {
    county: 'Fulton',
    url: 'https://services1.arcgis.com/AQDHTHDrZzfsFsB5/arcgis/rest/services/LandBase_Subdivisions/FeatureServer/0',
    nameField: 'SubdivName',
  },
  // 2,743 polygons, phase inside the name.
  forsyth: {
    county: 'Forsyth',
    url: 'https://geo.forsythco.com/gisworkflow/rest/services/Public/Subdivisions/FeatureServer/0',
    nameField: 'CNVYNAME',
  },
  // NOT Cherokee: its polygon layer has 1,011 rows against 94,657 parcels
  // carrying a subdivision name, so it needs a parcel dissolve, not this.
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

function containing(lat: number, lng: number, rows: Existing[]): Existing[] {
  return rows.filter((e) => pointInBbox(lng, lat, e.bbox) && pointInPolygon(lng, lat, e.boundary));
}

/** A boundary's polygon list, whichever GeoJSON shape it arrived in. */
function polysOf(geom: GeoJsonPolygonLike): Ring[][] {
  return geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
}

/** Shoelace area of a MultiPolygon's outer rings, in square degrees — only
 * ever compared against another one at the same latitude. */
function areaOf(polys: Ring[][]): number {
  let a = 0;
  for (const poly of polys) {
    const ring = poly[0];
    if (ring) a += Math.abs(ringArea(ring));
  }
  return a;
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
    const key = cleanName(raw);
    if (!key) {
      commercial.add(normalizeName(raw));
      continue;
    }
    let g = groups.get(key);
    if (!g) {
      g = { raw: key, phases: 0, polys: [] };
      groups.set(key, g);
    }
    g.phases++;
    if (f.geometry.type === 'Polygon') g.polys.push(f.geometry.coordinates);
    else g.polys.push(...f.geometry.coordinates);
  }

  const existing = await fetchExisting(layer.county);
  const byName = new Map<string, Existing[]>();
  for (const e of existing) {
    // Keyed on the CLEANED name so a row this importer wrote before the
    // naming rules changed still matches the plat it came from, instead of
    // being left behind as an orphan while a duplicate is inserted.
    const key = cleanName(e.name) ?? normalizeName(e.name);
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
  const claimed = new Set<string>();
  let noCentroid = 0;
  let folded = 0;
  let fuzzy = 0;
  for (const [key, g] of groups) {
    const centroid = centroidOf(g.polys);
    if (!centroid) {
      noCentroid++;
      continue;
    }
    // Every existing community whose polygon covers this plat's centre. The
    // plat layer has no city; these do, in the same POSTAL city convention the
    // rest of the table uses.
    const covers = containing(centroid.lat, centroid.lng, existing);
    const sameName = byName.get(key);

    // ── (2) A pod named after the place it sits in ──────────────────────────
    // "Neighborhoods of Windward Cove" inside "Windward" is not a second
    // community; it is a slice of one, and the name people say is the one the
    // wrapper points at. The parent's polygon already covers the pod, so the
    // plat is dropped outright rather than stored — a listing here still
    // lands in the parent, under the name its own MLS record uses.
    // Matched on a WORD BOUNDARY, not exact: the wrapper leaves "WINDWARD
    // COVE" behind and the community it belongs to is called "Windward". The
    // boundary is what keeps this honest — "WINDWARD COVE" folds into
    // "Windward", but not into a hypothetical "Wind".
    const inner = unwrap(key);
    const parent = inner && covers.find((e) => isPodOf(inner, e.name));
    if (parent) {
      folded++;
      continue;
    }

    // ── (1) The same place recorded twice, spelled differently ─────────────
    // "SUNVALLEY ESTATES" vs "Sun Valley Estates", "Canterbury Farms" vs
    // "Canterbury". Punctuation-insensitive equality, or one name a prefix of
    // the other while the two shapes are within a factor of two — a genuinely
    // different subdivision inside another is far smaller than its container.
    const platArea = areaOf(g.polys);
    const nearDuplicate = covers.find(
      (e) =>
        e.source !== 'county_gis' &&
        isSamePlace(key, e.name, platArea / Math.max(areaOf(polysOf(e.boundary)), 1e-12)),
    );

    // Order matters. A real community — one somebody named, with a photo on
    // it — is preferred over a row this importer wrote, even though the
    // importer's row matches by construction: after the first import every
    // plat HAS its own row, and checking that first would short-circuit the
    // merge forever. Falling through to the own row last is what keeps a
    // re-run idempotent for plats with no counterpart. A candidate another
    // plat already took is skipped, or the second would overwrite the first.
    const free = (e: Existing | undefined) => (e && !claimed.has(e.id) ? e : undefined);
    const upgradeOf =
      free(
        sameName?.find(
          (e) =>
            e.source !== 'county_gis' && pointInPolygon(centroid.lng, centroid.lat, e.boundary),
        ),
      ) ??
      free(nearDuplicate) ??
      free(sameName?.find((e) => e.source === 'county_gis'));
    if (upgradeOf) claimed.add(upgradeOf.id);
    if (upgradeOf && upgradeOf === nearDuplicate && squash(upgradeOf.name) !== squash(key)) {
      fuzzy++;
    }
    // The merged row keeps its id, slug and photo; the name is whichever of
    // the two spellings reads like the entrance sign.
    const platName = titleCaseName(g.raw);
    const name =
      upgradeOf && upgradeOf.source !== 'county_gis' ? sayable(upgradeOf.name, platName) : platName;
    const inside = covers[0];
    const city = upgradeOf?.city ?? inside?.city ?? null;
    // A numbered slug is a URL nobody can read (owner on `berkeley-park-2`,
    // 2026-09-07). Subdivision names repeat across the metro — there is a
    // Berkeley Park in two counties — so disambiguate with the place, which
    // is the thing that actually differs, and keep the counter as a last
    // resort for two of the same name in one town.
    // A row this importer owns is re-derived in full, so a naming fix lands
    // on the next run. An upgraded Nextdoor row keeps its slug: a shared
    // /community/<slug> link points at it.
    const ownRow = upgradeOf?.source === 'county_gis';
    if (upgradeOf && ownRow) usedSlugs.delete(upgradeOf.slug);
    let slug = ownRow ? undefined : upgradeOf?.slug;
    if (!slug) {
      const base = slugify(name, { fallback: 'subdivision' });
      const tries = [
        base,
        city ? `${base}-${slugify(city)}` : '',
        `${base}-${slugify(layer.county)}`,
      ].filter(Boolean);
      slug = tries.find((s) => !usedSlugs.has(s));
      if (!slug) {
        let n = 2;
        const last = tries[tries.length - 1] as string;
        slug = `${last}-${n}`;
        while (usedSlugs.has(slug)) slug = `${last}-${++n}`;
      }
      usedSlugs.add(slug);
    }
    plans.push({
      name,
      slug,
      city,
      phases: g.phases,
      centroid,
      boundary: { type: 'MultiPolygon', coordinates: g.polys },
      ...(upgradeOf ? { upgradeOf } : {}),
    });
  }

  // Rows this importer owns that the layer no longer yields — a plat that was
  // withdrawn, or (more often) a name the cleaning rules now reject. Left in
  // place they would keep matching listings to a community with no plat behind
  // it, so the import is declarative: after a run, this county's county_gis
  // rows are exactly what the layer says.
  const stale = existing.filter((e) => e.source === 'county_gis' && !claimed.has(e.id));

  const refreshes = plans.filter((p) => p.upgradeOf?.source === 'county_gis');
  const upgrades = plans.filter((p) => p.upgradeOf && p.upgradeOf.source !== 'county_gis');
  const inserts = plans.filter((p) => !p.upgradeOf);
  const noCity = plans.filter((p) => !p.city).length;
  console.log(
    `\n${layer.county}: ${features.length} plat polygons → ${plans.length} subdivisions` +
      `${noCentroid ? ` (${noCentroid} with unusable geometry, skipped)` : ''}`,
  );
  console.log(`  ${commercial.size} names dropped as commercial or industrial`);
  if (folded) console.log(`  ${folded} pods folded into the community they are named after`);
  if (fuzzy) console.log(`  ${fuzzy} merged into a differently-spelled existing community`);
  console.log(`  ${upgrades.length} upgrade an existing community in place (keeps its photo)`);
  console.log(`  ${inserts.length} are new rows`);
  if (refreshes.length) console.log(`  ${refreshes.length} refresh a row a previous run wrote`);
  if (stale.length)
    console.log(`  ${stale.length} rows a previous run wrote are no longer in the layer`);
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

  // One request per row is ~4 rows/second against PostgREST, which is hours
  // for a county. Batch instead — but a batch must carry EVERY not-null
  // column, because PostgREST turns a bulk upsert into one INSERT ... ON
  // CONFLICT and the not-null check runs on the tuple before the conflict is
  // resolved. A partial-column upsert fails even when every row exists.
  //
  // So an update carries the full row too, and the fields that must survive an
  // upgrade — an existing community's name, slug, city and its `source`, which
  // is what marks it as somebody else's row — are read back off the row rather
  // than re-derived.
  const rowOf = (p: Plan) => {
    const e = p.upgradeOf;
    const own = !e || e.source === 'county_gis';
    return {
      ...(e ? { id: e.id } : {}),
      // `p.name` already holds the merged choice; only the slug and city are
      // read back, because a shared /community/<slug> link hangs off them.
      name: p.name,
      slug: own ? p.slug : (e as Existing).slug,
      city: own ? p.city : e.city,
      state: 'GA',
      county: layer.county,
      kind: 'subdivision',
      status: 'active',
      source: e ? e.source : 'county_gis',
      boundary: p.boundary,
      boundary_source: 'arcgis',
      lat: p.centroid.lat,
      lng: p.centroid.lng,
    };
  };
  const updates = plans.filter((p) => p.upgradeOf).map(rowOf);
  const fresh = inserts.map(rowOf);

  let done = 0;
  const total = updates.length + fresh.length;
  const write = async (rows: object[], mode: 'upsert' | 'insert') => {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } =
        mode === 'upsert'
          ? await sb.from('communities').upsert(chunk)
          : await sb.from('communities').insert(chunk);
      if (error) throw new Error(`${mode} batch at ${i}: ${error.message}`);
      done += chunk.length;
      process.stderr.write(`\rwrote ${done}/${total}`);
    }
  };
  await write(updates, 'upsert');
  await write(fresh, 'insert');
  process.stderr.write('\n');

  // Never delete a row a listing points at — that would null the listing's
  // community. Deactivate it instead: `match_community` only considers active
  // rows, so the next `relink-listings` moves the listing onto whichever plat
  // replaced this one, and the run after that finds the row unheld and
  // removes it. Two runs, no orphaned listing, nothing irreversible in
  // between.
  let removed = 0;
  let parked = 0;
  for (const e of stale) {
    const { count } = await sb
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', e.id);
    if (count && count > 0) {
      const { error } = await sb.from('communities').update({ status: 'inactive' }).eq('id', e.id);
      if (error) throw new Error(`deactivate ${e.slug}: ${error.message}`);
      parked++;
      console.log(
        `  parked ${e.slug} — ${count} listing(s) still point at it; run relink then re-run`,
      );
      continue;
    }
    const { error } = await sb.from('communities').delete().eq('id', e.id);
    if (error) throw new Error(`delete ${e.slug}: ${error.message}`);
    removed++;
  }
  console.log(
    `${upgrades.length} upgraded, ${inserts.length} inserted, ${refreshes.length} refreshed, ` +
      `${removed} stale removed${parked ? `, ${parked} parked` : ''}.`,
  );
  console.log('Now re-run relink-listings.ts so listings move to the new polygons.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
