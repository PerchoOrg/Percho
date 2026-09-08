/**
 * Build `apps/web/data/metro-county-shapes.json` — the county outlines the
 * search tab's lens map fills.
 *
 * Source is `data/ga-counties.geojson`, the same TIGER boundaries
 * `backfill-community-county.ts` uses. That file is simplified for
 * point-in-polygon (~33 m, 46k vertices) because it decides which county a
 * home is IN, and being wrong there is user-visible. This file is for FILL at
 * metro zoom on a phone, where a 33 m detail is a fraction of a pixel and
 * every vertex is one more thing react-native-maps re-renders on pan. So it
 * gets simplified much harder and shipped separately rather than reused.
 *
 * Do not point this at plotly/datasets' county GeoJSON — see the header of
 * `backfill-community-county.ts` for why that one is wrong for Georgia.
 *
 * Usage:
 *   pnpm --filter @percho/web exec tsx ../../scripts/admin/build-metro-county-shapes.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';

/**
 * The counties the lens map covers: the 11-county Atlanta Regional Commission
 * area plus the commuter ring buyers actually shop in. Widen it by adding a
 * name — every county in the source file is available.
 */
const METRO_COUNTIES = [
  'Barrow', 'Bartow', 'Carroll', 'Cherokee', 'Clayton', 'Cobb', 'Coweta',
  'Dawson', 'DeKalb', 'Douglas', 'Fayette', 'Forsyth', 'Fulton', 'Gwinnett',
  'Hall', 'Haralson', 'Heard', 'Henry', 'Jackson', 'Lamar', 'Meriwether',
  'Morgan', 'Newton', 'Paulding', 'Pickens', 'Pike', 'Rockdale', 'Spalding',
  'Walton',
];

/** ~250 m. Coarse enough to halve the vertex count, fine enough that the
 *  familiar shapes (Fulton's tail, DeKalb's notch) still read as themselves. */
const TOLERANCE_DEG = 0.0025;

type Ring = [number, number][];
type Geometry =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] };
interface Feature {
  type: 'Feature';
  properties: { name: string };
  geometry: Geometry;
}

/** Perpendicular distance from p to the segment ab, in degrees. */
function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker. Iterative so a 4,700-vertex ring cannot blow the stack. */
function simplify(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 3) return ring;
  const keep = new Array<boolean>(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const span = stack.pop();
    if (!span) break;
    const [first, last] = span;
    let maxDist = 0;
    let index = -1;
    const a = ring[first];
    const b = ring[last];
    if (!a || !b) continue;
    for (let i = first + 1; i < last; i++) {
      const p = ring[i];
      if (!p) continue;
      const dist = segmentDistance(p, a, b);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  // A ring that simplified below a triangle is not a shape any more; keep the
  // original rather than emit something that renders as a line.
  return out.length >= 4 ? out : ring;
}

function simplifyGeometry(geom: Geometry): Geometry {
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geom.coordinates.map((r) => simplify(r, TOLERANCE_DEG)) };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geom.coordinates.map((poly) => poly.map((r) => simplify(r, TOLERANCE_DEG))),
  };
}

function ringsOf(geom: Geometry): Ring[] {
  return geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
}

function countVertices(geom: Geometry): number {
  return ringsOf(geom).reduce((n, r) => n + r.length, 0);
}

/** Bounding-box centre — where the county's label sits. Good enough for the
 *  compact counties; the core ones are overridden in the client. */
function centreOf(geom: Geometry): [number, number] {
  let minX = 180;
  let minY = 90;
  let maxX = -180;
  let maxY = -90;
  for (const ring of ringsOf(geom)) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [
    Number(((minX + maxX) / 2).toFixed(4)),
    Number(((minY + maxY) / 2).toFixed(4)),
  ];
}

const source = JSON.parse(
  readFileSync(new URL('./data/ga-counties.geojson', import.meta.url), 'utf8'),
) as { features: Feature[] };

const wanted = new Set(METRO_COUNTIES);
const picked = source.features.filter((f) => wanted.has(f.properties.name));
const missing = METRO_COUNTIES.filter((n) => !picked.some((f) => f.properties.name === n));
if (missing.length > 0) {
  console.error(`No boundary in the source for: ${missing.join(', ')}`);
  process.exit(1);
}

let before = 0;
let after = 0;
const shapes = picked
  .map((f) => {
    const geometry = simplifyGeometry(f.geometry);
    before += countVertices(f.geometry);
    after += countVertices(geometry);
    return {
      name: f.properties.name,
      key: f.properties.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      centre: centreOf(geometry),
      // Rounded to 4 decimals (~11 m) — finer than the tolerance we just
      // simplified at, so it costs nothing and halves the file.
      rings: ringsOf(geometry).map((r) =>
        r.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]),
      ),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const out = {
  state: 'GA',
  toleranceDeg: TOLERANCE_DEG,
  source: 'US Census TIGERweb State_County, via scripts/admin/data/ga-counties.geojson',
  counties: shapes,
};

const path = new URL('../../apps/web/data/metro-county-shapes.json', import.meta.url);
writeFileSync(path, `${JSON.stringify(out)}\n`);

const bytes = Buffer.byteLength(JSON.stringify(out));
console.log(
  `${shapes.length} counties · ${before.toLocaleString()} → ${after.toLocaleString()} vertices · ${(bytes / 1024).toFixed(0)} KB`,
);
