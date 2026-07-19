/**
 * Geo helpers — Phase 11 (2026-06-12).
 *
 * Two responsibilities:
 *   - `latLngBoundingBox(lat, lng, miles)` → { minLat, maxLat, minLng, maxLng }
 *     usable directly in `where lat between … and lng between …` predicates.
 *     Cheap, indexable, no PostGIS dependency. Slightly over-selects at the
 *     corners (uses square not circle); we filter exact distance in JS.
 *   - `haversineMiles(a, b)` → exact great-circle distance for sorting and
 *     for the "is it really inside the radius" filter.
 *
 * V1 scale assumption: hundreds-to-low-thousands of rows in the bbox.
 * Promote to PostGIS + earth_box() if/when this becomes a hot path.
 */

const EARTH_RADIUS_MI = 3959;

export interface LatLng {
  lat: number;
  lng: number;
}

export function latLngBoundingBox(lat: number, lng: number, miles: number) {
  // 1° latitude ≈ 69 mi. 1° longitude ≈ 69 * cos(lat) mi (shrinks toward poles).
  const dLat = miles / 69;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  // Guard against cos≈0 near the poles (would explode the bbox).
  const dLng = miles / Math.max(0.0001, 69 * Math.abs(cosLat));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}
