/**
 * Point-in-polygon test for GeoJSON (Multi)Polygon.
 *
 * Phase 83.2 (2026-07-15): used to auto-associate a listing to a seeded
 * community by matching listing lat/lng against the 731 Nextdoor
 * MultiPolygon boundaries stored in `communities.boundary`.
 *
 * Why JS instead of PostGIS: Supabase project doesn't have PostGIS enabled,
 * and enabling it forces the DB into a heavier plan tier. The polygons are
 * small (median 157 vertices, worst-case ~2500) and there are only 731
 * candidates — a linear scan with ray-cast is <5ms and doesn't need
 * infrastructure changes.
 *
 * Ray-casting reference: https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html
 */

export type Ring = number[][]; // [[lng, lat], ...]
export type Polygon = { type: 'Polygon'; coordinates: Ring[] };
export type MultiPolygon = { type: 'MultiPolygon'; coordinates: Ring[][] };
export type GeoJsonPolygonLike = Polygon | MultiPolygon;

/**
 * Ray-cast test: is (lng, lat) inside `ring`?
 * `ring` is a closed linear ring in [lng, lat] order (GeoJSON convention).
 */
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = ring[i] as number[];
    const pj = ring[j] as number[];
    const xi = pi[0] as number;
    const yi = pi[1] as number;
    const xj = pj[0] as number;
    const yj = pj[1] as number;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Is (lng, lat) inside a GeoJSON Polygon or MultiPolygon?
 * Handles inner rings (holes): a point is inside iff it's inside an outer
 * ring AND outside every inner ring of the same polygon.
 */
export function pointInPolygon(lng: number, lat: number, geom: GeoJsonPolygonLike): boolean {
  const polygons: Ring[][] =
    geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const poly of polygons) {
    if (poly.length === 0) continue;
    const outer = poly[0] as Ring;
    if (!pointInRing(lng, lat, outer)) continue;
    let inHole = false;
    for (let k = 1; k < poly.length; k++) {
      if (pointInRing(lng, lat, poly[k] as Ring)) {
        inHole = true;
        break;
      }
    }
    if (inHole) continue;
    return true;
  }
  return false;
}

/**
 * Bounding-box prefilter to skip pointInPolygon for polygons that
 * cheap min/max already reject.
 *
 * Returns [minLng, minLat, maxLng, maxLat] or null for empty geometry.
 */
export function bboxOf(geom: GeoJsonPolygonLike): [number, number, number, number] | null {
  const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const pt of ring) {
        const lng = pt[0] as number;
        const lat = pt[1] as number;
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  if (minLng === Infinity) return null;
  return [minLng, minLat, maxLng, maxLat];
}

export function pointInBbox(
  lng: number,
  lat: number,
  bbox: [number, number, number, number],
): boolean {
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}
