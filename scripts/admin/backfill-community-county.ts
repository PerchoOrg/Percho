/**
 * Set `communities.county` from lat/lng by point-in-polygon against the 159
 * Georgia county boundaries in `data/ga-counties.geojson`. No geocoding API,
 * no spend — runs in a few seconds locally.
 *
 * The boundaries are Census TIGERweb (State_County layer 13, `STATE='13'`,
 * EPSG:4326), Douglas-Peucker-simplified at 3e-4° (~33 m) and rounded to 5
 * decimals to fit in the repo: 442k vertices / 18 MB down to 46k / 0.95 MB.
 * Measured against the unsimplified source over all 8,679 anchors, that
 * costs 3 assignments — communities whose centroid sits within ~33 m of a
 * county line, which straddle it either way.
 *
 * Do NOT go back to plotly/datasets' counties GeoJSON. It is built for
 * choropleth fill (Fulton has 53 vertices there, 4,700 in TIGER) and put
 * 198 of 8,679 communities in the wrong county — Peachtree Corners in
 * Fulton, Dunwoody in Fulton, Marietta in Fulton. County is user-visible
 * (it names school districts and tax rates for a buyer), so it has to come
 * from real boundaries.
 *
 * Idempotent: every row with coordinates is recomputed and only the ones
 * that disagree are written, so re-run it after any community import.
 * Non-Georgia points stay null and are listed.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/backfill-community-county.ts
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/backfill-community-county.ts --apply
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  type GeoJsonPolygonLike,
  bboxOf,
  pointInBbox,
  pointInPolygon,
} from '../../apps/web/lib/geo/point-in-polygon.js';

const APPLY = process.argv.includes('--apply');

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

type County = { name: string; geom: GeoJsonPolygonLike; bbox: [number, number, number, number] };

function loadCounties(): County[] {
  const fc = JSON.parse(
    readFileSync(new URL('./data/ga-counties.geojson', import.meta.url), 'utf8'),
  ) as { features: { properties: { name: string }; geometry: GeoJsonPolygonLike }[] };
  return fc.features.map((f) => {
    const bbox = bboxOf(f.geometry);
    if (!bbox) throw new Error(`county ${f.properties.name} has no geometry`);
    return { name: f.properties.name, geom: f.geometry, bbox };
  });
}

function countyOf(lat: number, lng: number, counties: County[]): string | null {
  for (const c of counties) {
    if (pointInBbox(lng, lat, c.bbox) && pointInPolygon(lng, lat, c.geom)) return c.name;
  }
  return null;
}

async function main() {
  const counties = loadCounties();

  type Row = {
    id: string;
    slug: string;
    city: string | null;
    county: string | null;
    lat: number;
    lng: number;
  };
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('communities')
      .select('id, slug, city, county, lat, lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }

  // Group the rows that need writing by their new county, so the update runs
  // one statement per county rather than one per row.
  const byCounty = new Map<string, string[]>();
  const outside: Row[] = [];
  const changes: string[] = [];
  const total = new Map<string, number>();
  for (const r of rows) {
    const county = countyOf(r.lat, r.lng, counties);
    if (county) total.set(county, (total.get(county) ?? 0) + 1);
    else outside.push(r);
    if (county === r.county) continue;
    changes.push(`  ${r.slug} (${r.city ?? '—'}): ${r.county ?? '—'} → ${county ?? '—'}`);
    if (!county) continue;
    const ids = byCounty.get(county) ?? [];
    ids.push(r.id);
    byCounty.set(county, ids);
  }

  for (const [county, n] of [...total.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${county.padEnd(14)} ${String(n).padStart(5)}`);
  }
  if (changes.length) {
    console.log(`\n${changes.length} rows disagree with the stored county:`);
    for (const c of changes) console.log(c);
  }
  if (outside.length) {
    console.log(`\n${outside.length} not in any Georgia county (left null):`);
    for (const r of outside) console.log(`  ${r.slug}  ${r.lat},${r.lng}`);
  }

  let written = 0;
  if (APPLY) {
    for (const [county, ids] of byCounty) {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error } = await sb.from('communities').update({ county }).in('id', chunk);
        if (error) throw new Error(`update ${county}: ${error.message}`);
        written += chunk.length;
      }
    }
  }

  console.log(
    `\n${rows.length} communities with coordinates · ${total.size} counties · ` +
      `${APPLY ? `${written} updated` : `${changes.length} would change`}`,
  );
  if (!APPLY) console.log('--- dry run, nothing written ---');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
