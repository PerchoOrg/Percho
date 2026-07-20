/**
 * Community "logo cover" — generate a data-URI SVG from the community's
 * boundary polygon so nextdoor-seeded neighborhoods (and any community
 * without an uploaded cover) render with a recognizable, unique cover.
 *
 * Design = P3 "Bold Logo" from /tmp/percho-community-demo/covers-v3.html:
 *   - saturated color gradient background (name-hash → 8-palette)
 *   - Chaikin-smoothed white blob = the boundary's silhouette
 *   - "COMMUNITY" eyebrow + community name overlay
 *
 * Pipeline:
 *   1. pick largest outer ring of the (Multi)Polygon
 *   2. arc-length resample to N=24 points → kills tiny cadastral notches
 *   3. Chaikin smoothing 4 iterations → curves back in
 *   4. project to viewBox with padding
 *   5. inline SVG → data URI
 *
 * Aspect-ratio guard: if the boundary bbox is a thin sliver (ratio > 4.0)
 * the polygon reads as a road corridor, not a logo. In that case we fall
 * back to a monogram (first 1-2 initials) on the same gradient — still
 * unique-per-name via color hash but not a broken blob.
 */

export type GeoJSONPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

export type GeoJSONMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: number[][][][];
};

export type BoundaryGeoJSON = GeoJSONPolygon | GeoJSONMultiPolygon;

type Point = [number, number];

const WIDTH = 400;
const HEIGHT = 300;
const PADDING = 65;
const RESAMPLE_POINTS = 24;
const CHAIKIN_ITERATIONS = 4;
const MAX_ASPECT_RATIO = 4.0;

// [bg-from, bg-to, ink] — 8 palettes matching demo P3
const PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#f59e0b', '#b45309', '#fef3c7'], // amber
  ['#3b82f6', '#1d4ed8', '#dbeafe'], // blue
  ['#22c55e', '#15803d', '#dcfce7'], // green
  ['#ec4899', '#be185d', '#fce7f3'], // pink
  ['#6366f1', '#4338ca', '#e0e7ff'], // indigo
  ['#f97316', '#c2410c', '#ffedd5'], // orange
  ['#06b6d4', '#0e7490', '#cffafe'], // cyan
  ['#a855f7', '#7e22ce', '#f3e8ff'], // purple
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickPalette(name: string): readonly [string, string, string] {
  const idx = hashString(name) % PALETTES.length;
  // biome-ignore lint/style/noNonNullAssertion: idx is bounded by PALETTES.length
  return PALETTES[idx]!;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w.charAt(0) : ''))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function toPoint(raw: number[]): Point | null {
  const lng = raw[0];
  const lat = raw[1];
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  return [lng, lat];
}

/** Extract the largest outer ring (by point count) from a Polygon/MultiPolygon. */
function largestOuterRing(b: BoundaryGeoJSON): Point[] | null {
  const polys: number[][][][] = b.type === 'MultiPolygon' ? b.coordinates : [b.coordinates];
  let bestRaw: number[][] | null = null;
  for (const p of polys) {
    const ring = p[0];
    if (!ring || ring.length < 4) continue;
    if (!bestRaw || ring.length > bestRaw.length) bestRaw = ring;
  }
  if (!bestRaw) return null;
  // drop closing duplicate + type-narrow to [number,number]
  const closed = bestRaw.slice(0, -1);
  const pts: Point[] = [];
  for (const raw of closed) {
    const pt = toPoint(raw);
    if (pt) pts.push(pt);
  }
  return pts.length >= 3 ? pts : null;
}

function bbox(pts: Point[]) {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

/** Uniform arc-length resample to `target` points. Closed ring assumed. */
function resample(pts: Point[], target: number): Point[] {
  if (pts.length < 3) return pts;
  const dists: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    dists.push(total);
  }
  // close loop
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  total += Math.hypot(first[0] - last[0], first[1] - last[1]);
  dists.push(total);

  const step = total / target;
  const out: Point[] = [];
  let j = 0;
  for (let i = 0; i < target; i++) {
    const d = i * step;
    while (j < dists.length - 1 && (dists[j + 1] ?? total) < d) j++;
    const a = pts[j % pts.length]!;
    const b = pts[(j + 1) % pts.length]!;
    const dj = dists[j] ?? 0;
    const djn = dists[j + 1] ?? total;
    const seg = djn - dj || 1;
    const t = (d - dj) / seg;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Chaikin corner-cutting on a closed ring. */
function chaikin(pts: Point[], iterations: number): Point[] {
  let cur = pts;
  for (let k = 0; k < iterations; k++) {
    const next: Point[] = [];
    for (let i = 0; i < cur.length; i++) {
      const p1 = cur[i]!;
      const p2 = cur[(i + 1) % cur.length]!;
      next.push([p1[0] * 0.75 + p2[0] * 0.25, p1[1] * 0.75 + p2[1] * 0.25]);
      next.push([p1[0] * 0.25 + p2[0] * 0.75, p1[1] * 0.25 + p2[1] * 0.75]);
    }
    cur = next;
  }
  return cur;
}

function project(
  pts: Point[],
  bb: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  w: number,
  h: number,
  pad: number,
): Point[] {
  const spanLng = bb.maxLng - bb.minLng || 1;
  const spanLat = bb.maxLat - bb.minLat || 1;
  const s = Math.min((w - 2 * pad) / spanLng, (h - 2 * pad) / spanLat);
  const cx = (bb.minLng + bb.maxLng) / 2;
  const cy = (bb.minLat + bb.maxLat) / 2;
  return pts.map(([lng, lat]) => [(lng - cx) * s + w / 2, (cy - lat) * s + h / 2] as Point);
}

function ringToPath(pts: Point[]): string {
  const parts = pts.map((pt) => `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`);
  return `M ${parts.join(' L ')} Z`;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the SVG markup. Exported so callers can inline (RSC) or convert
 * to data URI (client `<img src=…>`).
 */
export function buildCommunityLogoSvg(name: string, boundary: BoundaryGeoJSON | null): string {
  const [c0, c1, ink] = pickPalette(name);
  const nameEsc = xmlEscape(name);

  let blobPath: string | null = null;
  if (boundary) {
    const ring = largestOuterRing(boundary);
    if (ring) {
      const bb = bbox(ring);
      const wSpan = bb.maxLng - bb.minLng;
      const hSpan = bb.maxLat - bb.minLat;
      const ratio = Math.max(wSpan, hSpan) / Math.max(Math.min(wSpan, hSpan), 1e-9);
      if (ratio <= MAX_ASPECT_RATIO) {
        const resampled = resample(ring, RESAMPLE_POINTS);
        const smoothed = chaikin(resampled, CHAIKIN_ITERATIONS);
        const projected = project(smoothed, bb, WIDTH, HEIGHT, PADDING);
        blobPath = ringToPath(projected);
      }
    }
  }

  const bgGradient = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/>
  </linearGradient>`;

  const centerpiece = blobPath
    ? `<path d="${blobPath}" fill="#ffffff" fill-opacity="0.95"/>`
    : `<text x="${WIDTH / 2}" y="${HEIGHT / 2 + 8}" text-anchor="middle"
         font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
         font-size="96" font-weight="800" fill="#ffffff" fill-opacity="0.95">${xmlEscape(initials(name))}</text>`;

  const displayName = nameEsc.length > 38 ? `${nameEsc.slice(0, 36)}…` : nameEsc;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid slice">
  <defs>${bgGradient}</defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  ${centerpiece}
  <text x="20" y="30"
    font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    font-size="11" font-weight="700" letter-spacing="1.5"
    fill="#ffffff" fill-opacity="0.8">COMMUNITY</text>
  <text x="20" y="${HEIGHT - 20}"
    font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    font-size="20" font-weight="800" fill="#ffffff"
    style="text-shadow: 0 1px 3px rgba(0,0,0,0.3)">${displayName}</text>
  <metadata data-ink="${ink}"/>
</svg>`;
}

/** Convert an SVG string to a data URI (utf-8, url-encoded). */
export function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/**
 * Convenience: build the logo cover as a data URI in one call.
 * Returns `null` if we truly can't produce anything (no name).
 */
export function buildCommunityLogoDataUri(
  name: string,
  boundary: BoundaryGeoJSON | null,
): string | null {
  if (!name) return null;
  return svgToDataUri(buildCommunityLogoSvg(name, boundary));
}
