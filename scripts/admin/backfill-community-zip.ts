/**
 * Fills `communities.zip` from each community's point and the Census ZIP
 * Code Tabulation Areas (phase410).
 *
 * Search answers a ZIP (owner 2026-11-27: 「zip搜要支持」), and not one
 * community row carried a ZIP: the column was in the schema from the start
 * and nothing ever wrote it. A community's ZIP here is the ZCTA its point
 * (`lat`/`lng`) falls in — the Census's own polygons for the 2020 ZIPs,
 * read from TIGERweb, which is free and needs no key. A ZCTA is the Census's
 * drawing of a ZIP, close to but not exactly the Postal Service's routes;
 * for "which communities are in 30024" that is the right precision.
 *
 * Only rows with no ZIP and a point are written, so a re-run fills what is
 * new and never overwrites. Free; ~150 polygons, then one update per ZIP
 * per 200 rows.
 *
 * Runs with the service role. CLAUDE.md §3 permits that here: this file lives
 * in scripts/admin/ and is invoked by hand.
 *
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/backfill-community-zip.ts [--dry]
 */
import { createClient } from '@supabase/supabase-js';

const ZCTA_LAYER =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/7/query';
const PAGE = 1000;
const CHUNK = 200;

type Ring = Array<[number, number]>;
interface Zcta {
  zip: string;
  rings: Ring[];
  box: { minX: number; minY: number; maxX: number; maxY: number };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Source .env.local first.`);
  return v;
}

/** Even-odd ray casting over every ring, so holes count as outside. */
function inside(x: number, y: number, rings: Ring[]): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] ?? [0, 0];
      const [xj, yj] = ring[j] ?? [0, 0];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

async function zctasIn(box: Zcta['box']): Promise<Zcta[]> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${box.minX},${box.minY},${box.maxX},${box.maxY}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'ZCTA5',
    returnGeometry: 'true',
    geometryPrecision: '5',
    f: 'json',
  });
  const res = await fetch(`${ZCTA_LAYER}?${params}`);
  if (!res.ok) throw new Error(`TIGERweb answered ${res.status}`);
  const body = (await res.json()) as {
    features?: Array<{ attributes: { ZCTA5: string }; geometry: { rings: Ring[] } }>;
    error?: { message: string };
  };
  if (body.error || !body.features)
    throw new Error(`TIGERweb: ${body.error?.message ?? 'no features'}`);
  return body.features.map((f) => {
    const pts = f.geometry.rings.flat();
    return {
      zip: f.attributes.ZCTA5,
      rings: f.geometry.rings,
      box: {
        minX: Math.min(...pts.map((p) => p[0])),
        minY: Math.min(...pts.map((p) => p[1])),
        maxX: Math.max(...pts.map((p) => p[0])),
        maxY: Math.max(...pts.map((p) => p[1])),
      },
    };
  });
}

async function main() {
  const dry = process.argv.includes('--dry');
  const sb = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  // Paged: PostgREST caps a read at 1000 rows whatever `.range()` asks.
  const rows: Array<{ id: string; lat: number; lng: number }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('communities')
      .select('id, lat, lng')
      .is('zip', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`communities read failed: ${error.message}`);
    for (const r of data ?? []) {
      if (r.lat != null && r.lng != null) rows.push({ id: r.id, lat: r.lat, lng: r.lng });
    }
    if ((data ?? []).length < PAGE) break;
  }
  if (rows.length === 0) {
    console.log('Every community with a point already has a ZIP.');
    return;
  }

  // Tiles of half a degree, so no single TIGERweb answer gets large.
  const tiles = new Map<string, Zcta['box']>();
  for (const r of rows) {
    const x = Math.floor(r.lng * 2) / 2;
    const y = Math.floor(r.lat * 2) / 2;
    tiles.set(`${x},${y}`, { minX: x, minY: y, maxX: x + 0.5, maxY: y + 0.5 });
  }
  const zctas = new Map<string, Zcta>();
  for (const box of tiles.values()) {
    for (const z of await zctasIn(box)) zctas.set(z.zip, z);
  }
  console.log(
    `${rows.length} communities without a ZIP; ${zctas.size} ZCTAs over ${tiles.size} tiles.`,
  );

  const byZip = new Map<string, string[]>();
  let missed = 0;
  for (const r of rows) {
    const z = [...zctas.values()].find(
      (c) =>
        r.lng >= c.box.minX &&
        r.lng <= c.box.maxX &&
        r.lat >= c.box.minY &&
        r.lat <= c.box.maxY &&
        inside(r.lng, r.lat, c.rings),
    );
    if (!z) {
      missed += 1;
      continue;
    }
    byZip.set(z.zip, [...(byZip.get(z.zip) ?? []), r.id]);
  }
  console.log(
    `${rows.length - missed} placed in ${byZip.size} ZIPs; ${missed} in no ZCTA (left empty).`,
  );
  if (dry) return;

  let written = 0;
  for (const [zip, ids] of byZip) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { error } = await sb
        .from('communities')
        .update({ zip })
        .in('id', chunk)
        .is('zip', null);
      if (error) throw new Error(`update ${zip} failed: ${error.message}`);
      written += chunk.length;
    }
  }
  console.log(`Wrote a ZIP on ${written} communities.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
