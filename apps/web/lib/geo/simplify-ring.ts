/**
 * GeoJSON → drawable outer rings, simplified for DISPLAY.
 *
 * `communities.boundary` holds the real polygon — Nextdoor seeds and county-GIS
 * subdivisions both — at full source density, multi-KB each. That density is
 * correct for `communities_geom_match` (it decides which community a HOME is
 * in, where being wrong is user-visible) and wrong for a phone map, where the
 * detail is a fraction of a pixel and every vertex is one more thing
 * react-native-maps re-renders on pan.
 *
 * So: same trade the county shape file makes (`build-metro-county-shapes.ts`,
 * ~250 m for metro zoom), one order finer because communities are read at
 * neighbourhood zoom.
 *
 * NEVER feed the output to a point-in-polygon test. A simplified edge moves,
 * and deciding containment on a moved edge is the bug `locate.ts` warns about
 * in its own header.
 */

export type Ring = [number, number][];

/** ~30 m. At a 0.06° viewport on a 390pt phone that is well under a pixel. */
export const DISPLAY_TOLERANCE_DEG = 0.0003;

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
export function simplifyRing(ring: Ring, tolerance: number): Ring {
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

function parseRing(v: unknown): Ring | null {
  if (!Array.isArray(v) || v.length < 4) return null;
  const ring: Ring = [];
  for (const pt of v) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = pt[0];
    const lat = pt[1];
    if (typeof lng !== 'number' || typeof lat !== 'number') continue;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    ring.push([lng, lat]);
  }
  return ring.length >= 4 ? ring : null;
}

/**
 * The OUTER ring of each polygon in a GeoJSON Polygon / MultiPolygon,
 * simplified. Holes are dropped: a subdivision that encloses a park draws the
 * same on a phone either way, and carrying holes doubles the payload for a
 * detail nobody can see at this zoom.
 *
 * Anything unparseable returns `[]` — a community with no drawable shape falls
 * back to its pin, which is what it had before.
 */
export function displayRingsFromGeoJson(
  geo: unknown,
  tolerance = DISPLAY_TOLERANCE_DEG,
): Ring[] {
  if (!geo || typeof geo !== 'object') return [];
  const g = geo as { type?: unknown; coordinates?: unknown };
  const coords = g.coordinates;
  if (!Array.isArray(coords)) return [];

  const outers: unknown[] =
    g.type === 'Polygon'
      ? [coords[0]]
      : g.type === 'MultiPolygon'
        ? coords.map((poly) => (Array.isArray(poly) ? poly[0] : null))
        : [];

  const rings: Ring[] = [];
  for (const raw of outers) {
    const ring = parseRing(raw);
    if (ring) rings.push(simplifyRing(ring, tolerance));
  }
  return rings;
}
