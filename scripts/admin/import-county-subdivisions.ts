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
 * Gwinnett codes "GWINNETT PLACE COMMERCIAL CENTER" and "KILLIAN HILL OFFICE
 * CONDOMINIUMS" as LCODE=SUBDIV — the code says "this is a platted
 * development", not "this is housing". `LP` is a limited partnership, i.e.
 * the developer entity got recorded as the plat name ("GWINRAY LP").
 * Deliberately conservative: it matches the industrial/retail/office words
 * only, so "Village at …" and "Towne Center …" residential names survive.
 */
const NOT_A_PLACE_TO_LIVE =
  /\b(COMMERCIAL|BUSINESS PARK|SHOPPING|OFFICE|PROFESSIONAL|PRFSNL|INDUSTRIAL|RETAIL|WAREHOUSE|CORPORATE|STORAGE|FLOORS?|BANK|PROPERTY OF|APTS?|APARTMENTS?|LP|INC|LLC|LTD|CORP)\b/;

/**
 * A plat recorded under a person's name — one owner splitting one parcel, not
 * a community. DeKalb is full of them ("ROBERT Q. CASSELS", "GARY E. &
 * TERESAM. KENNEDY"). The tell is a middle initial: a letter, a full stop, a
 * space. "N.DRUID WOODS" survives because its full stop has no space after
 * it, which is the difference between an abbreviation and an initial.
 */
const A_PERSONS_NAME = /\b[A-Z]\.\s|^[A-Z]\.\s?[A-Z]\./;

/**
 * Phase and plat-ese suffixes, stripped off the END of a plat name.
 *
 * Owner, 2026-09-07: 「我不要期数」. Gwinnett keeps the phase in its own column,
 * but DeKalb and Forsyth bury it in the name — "CREEK PARK HILLS UNIT 9",
 * "Woodlands At Riverstone Plantation Phase 3" — and those are the same
 * community as their other phases, not separate ones. `S/D`, `SUB` and the
 * condominium suffixes are the recorder's vocabulary, not the buyer's:
 * nobody says they live in Apple Valley Condominiums.
 *
 * Applied repeatedly and in both orders, because a name can carry two of
 * them ("GLENLEAF A CONDOMINIUM PHASE 2").
 */
const SUFFIXES = [
  // "UNIT 5", "SEC.3", "UNIT#1", "UNIT-1", "NO.9", "PHASE 4 & 5", "PH 2A" —
  // the number is joined to the word by a space, a dot, a hash or a hyphen
  // depending on who typed the plat in, and DeKalb alone has all four.
  /\s*\b(?:UNITS?|PHASES?|PH|SECTIONS?|SEC|PODS?|PARCELS?|TRACTS?|REVISIONS?|REV|NO)\b[\s.#-]*[0-9IVX]+[A-Z]?(?:\s*(?:&|AND|-)\s*[0-9IVX]+[A-Z]?)*$/,
  // "PHASES 1,2,3", "BLK2,3" — a list of phases, comma- or ampersand-joined,
  // with or without a space before the number.
  /\s*\b(?:PHASES?|UNITS?|BLKS?|BLOCKS?|SECTIONS?|LOTS?)\b[\s.#-]*[0-9]+(?:\s*[,&]\s*[0-9]+)*[A-Z]?$/,
  /\s*#\s*[0-9]+$/,
  // A bare trailing roman numeral is a phase everywhere in this data
  // ("OAKS ON WOODLAWN II"); a lone "I" is not, so it is left out.
  /\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/,
  /\s+(?:A\s+)?CONDOMINIUMS?(?:\s+ASSOC(?:IATION)?)?$/,
  /\s+(?:SUBDIVISION|SUB)$/,
  // Forsyth labels its pods with letters, not numbers ("POD S3 C"), and
  // parenthesises the marketing name after them ("(SEVEN OAKS PHASE 2)").
  /\s*\([^)]*\)$/,
  /\s*\bPODS?\b\s*[A-Z0-9][A-Z0-9-]*(?:\s+[A-Z])?$/,
  /\s*\/\s*(?:TWNHS|TH|SFR|CONDOS?)$/,
];

/**
 * The plat name as a person would say it, or null if it names no home.
 *
 * Runs on the RAW name so the grouping key is the cleaned form — which is the
 * point: "CREEK PARK HILLS UNIT 9" and "CREEK PARK HILLS UNIT 10" have to
 * collapse into one community before their polygons are unioned.
 */
function cleanName(raw: string): string | null {
  let s = normalize(raw);
  if (!s || NOT_A_PLACE_TO_LIVE.test(s) || A_PERSONS_NAME.test(s)) return null;
  // DeKalb writes "CREEK PARK HILLS S/D UNIT 5" — the recorder's abbreviation
  // for "subdivision" sits in the middle, not at the end.
  s = s
    .replace(/\bS\s*\/\s*D\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let pass = 0; pass < 5; pass++) {
    const before = s;
    // Plat names arrive with trailing debris — "GLYNBROOK UNIT 2,",
    // "BRIARCLIFF WOODS EAST #6 &" — which has to come off before and after
    // each suffix strip, or the suffix no longer sits at the end.
    s = s.replace(/[\s,&.\-#]+$/, '');
    for (const re of SUFFIXES) s = s.replace(re, '');
    if (s === before) break;
  }
  s = s.trim();
  // A name that was nothing but its suffix, or a bare plat-book reference.
  return s.length < 3 ? null : s;
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
    const key = cleanName(raw);
    if (!key) {
      commercial.add(normalize(raw));
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
    const key = cleanName(e.name) ?? normalize(e.name);
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
  const claimed = new Set(plans.map((p) => p.upgradeOf?.id).filter(Boolean));
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
      name: own ? p.name : e.name,
      slug: own ? p.slug : e.slug,
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
