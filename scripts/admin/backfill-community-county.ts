/**
 * Fill `communities.county` from lat/lng by point-in-polygon against the 159
 * Georgia county boundaries in `data/ga-counties.geojson` (US Census
 * cartographic boundaries, 500k, via plotly/datasets). No geocoding API, no
 * spend — runs in a few seconds locally.
 *
 * Every community imported so far has county = null (phase188 audit), which
 * is what blocks per-county coverage work (county GIS subdivision imports,
 * the coverage map's county tiles). Non-Georgia points (a handful of seeds
 * across the Alabama/Tennessee line) stay null and are listed.
 *
 * Usage (repo-root .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/backfill-community-county.ts
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/backfill-community-county.ts --apply
 *
 * DRY RUN BY DEFAULT. Nothing is written without --apply. Rows that already
 * have a county are left alone.
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

  type Row = { id: string; slug: string; lat: number; lng: number };
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('communities')
      .select('id, slug, lat, lng')
      .is('county', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }

  const byCounty = new Map<string, string[]>();
  const outside: Row[] = [];
  for (const r of rows) {
    const county = countyOf(r.lat, r.lng, counties);
    if (!county) {
      outside.push(r);
      continue;
    }
    const ids = byCounty.get(county) ?? [];
    ids.push(r.id);
    byCounty.set(county, ids);
  }

  for (const [county, ids] of [...byCounty.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${county.padEnd(14)} ${String(ids.length).padStart(5)}`);
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
    `\n${rows.length} communities without a county · ${byCounty.size} counties matched · ` +
      `${APPLY ? `${written} updated` : `${rows.length - outside.length} would be updated`}`,
  );
  if (!APPLY) console.log('--- dry run, nothing written ---');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
