/**
 * Which utility serves a county, by area rather than by guess.
 *
 * ── Why this is not a lookup table ─────────────────────────────────────────
 *
 * Electric service territories in Georgia do not follow county lines at all.
 * They were drawn by who electrified which farms in the 1930s, so Cherokee is
 * split between Cobb EMC, Sawnee EMC and Amicalola, and Fulton has Georgia
 * Power across most of it with a Sawnee corner in the north. Writing "Cherokee
 * → Cobb EMC" in a constant is a guess dressed as data, and it is the guess
 * the seeded estimates already made.
 *
 * So the provider is found by AREA: sample the county on a grid, ask which
 * territory contains each point, and report the shares. A county whose largest
 * provider covers 55% of it is a materially different fact from one where it
 * covers 98%, and the caller can say so instead of pretending to a single
 * answer.
 *
 * ── Why sampling and not a real polygon intersection ──────────────────────
 *
 * A true area intersection needs a clipping library and exact arithmetic over
 * multipolygons with holes; the territories file has 94 features and some of
 * them are enormously detailed. A grid at ~1 km spacing gives a few thousand
 * points per county, which resolves a share to well under a percentage point —
 * far finer than the question ("who serves most of this county, and is it
 * close?") can use. The cost of being wrong here is naming the second-largest
 * provider in a county that is nearly split, and the returned share makes that
 * visible rather than hidden.
 *
 * Points are counted in the county's own polygon first, so a county's shape —
 * not its bounding box — is what gets sampled. Bounding boxes overlap wildly
 * in a state with counties this irregular.
 */

/** `[lng, lat]`, matching every other geometry in this codebase. */
export type Position = [number, number];

export interface PolygonLike {
  type: 'Polygon' | 'MultiPolygon';
  /** Polygon: ring[]. MultiPolygon: polygon[] of ring[]. */
  coordinates: Position[][] | Position[][][];
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Each polygon of a geometry, as its list of rings (outer first, then holes). */
export function polygonsOf(geom: PolygonLike): Position[][][] {
  return geom.type === 'Polygon'
    ? [geom.coordinates as Position[][]]
    : (geom.coordinates as Position[][][]);
}

export function bboxOf(geom: PolygonLike): BBox {
  let minX = 180;
  let minY = 90;
  let maxX = -180;
  let maxY = -90;
  for (const poly of polygonsOf(geom)) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

export function inBBox(x: number, y: number, b: BBox): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}

/** Ray casting, half-open on y so a vertex is not counted twice. */
function inRing(x: number, y: number, ring: readonly Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [ax, ay] = a;
    const [bx, by] = b;
    if (ay > y !== by > y) {
      const cross = ((bx - ax) * (y - ay)) / (by - ay) + ax;
      if (x < cross) inside = !inside;
    }
  }
  return inside;
}

/**
 * Inside the geometry, holes excluded.
 *
 * A ring after the first in one polygon is a HOLE. Ignoring that would put a
 * point in the middle of a municipal utility's island — a city that runs its
 * own power inside a co-op's territory, which is common — in the co-op.
 */
export function inGeometry(x: number, y: number, geom: PolygonLike): boolean {
  for (const poly of polygonsOf(geom)) {
    const outer = poly[0];
    if (!outer || !inRing(x, y, outer)) continue;
    let inHole = false;
    for (let i = 1; i < poly.length; i++) {
      const hole = poly[i];
      if (hole && inRing(x, y, hole)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

export interface Territory<T> {
  value: T;
  geometry: PolygonLike;
  bbox: BBox;
}

export interface TerritoryShare<T> {
  value: T;
  /** Fraction of the county's sampled points this territory covers, 0–1. */
  share: number;
}

export interface CoverageResult<T> {
  /** Shares, largest first. Empty when the county is not covered at all. */
  shares: TerritoryShare<T>[];
  /** Sampled points that fell inside the county. */
  sampled: number;
  /** Points inside the county that no territory claimed. */
  unclaimed: number;
}

/** Prepare territories once, so the bbox is not recomputed per point. */
export function prepare<T>(items: readonly { value: T; geometry: PolygonLike }[]): Territory<T>[] {
  return items.map((i) => ({ ...i, bbox: bboxOf(i.geometry) }));
}

/**
 * How each territory covers one area, by grid sampling.
 *
 * `steps` is the grid resolution across the area's bounding box; 60 gives
 * roughly a kilometre in a metro-Atlanta county and a few thousand interior
 * points, which is far more than the answer needs.
 */
export function coverage<T>(
  area: PolygonLike,
  territories: readonly Territory<T>[],
  steps = 60,
): CoverageResult<T> {
  const b = bboxOf(area);
  const dx = (b.maxX - b.minX) / steps;
  const dy = (b.maxY - b.minY) / steps;
  const counts = new Map<T, number>();
  let sampled = 0;
  let unclaimed = 0;

  for (let i = 0; i <= steps; i++) {
    // Half-step offsets keep samples off the county's own boundary, where a
    // point is ambiguous and ray casting is least stable.
    const x = b.minX + (i + 0.5) * dx;
    for (let j = 0; j <= steps; j++) {
      const y = b.minY + (j + 0.5) * dy;
      if (!inGeometry(x, y, area)) continue;
      sampled++;
      let hit: T | undefined;
      for (const t of territories) {
        if (!inBBox(x, y, t.bbox)) continue;
        if (inGeometry(x, y, t.geometry)) {
          hit = t.value;
          break;
        }
      }
      if (hit === undefined) unclaimed++;
      else counts.set(hit, (counts.get(hit) ?? 0) + 1);
    }
  }

  const shares = [...counts.entries()]
    .map(([value, n]) => ({ value, share: sampled > 0 ? n / sampled : 0 }))
    .sort((a, b2) => b2.share - a.share);
  return { shares, sampled, unclaimed };
}

/**
 * The provider to name for an area, and whether naming one is honest.
 *
 * `undefined` when nothing covers a majority: a county genuinely split three
 * ways has no "the" provider, and inventing one would put a rate on a bill for
 * a utility half the county does not buy from.
 */
export function dominant<T>(
  result: CoverageResult<T>,
  minShare = 0.5,
): TerritoryShare<T> | undefined {
  const top = result.shares[0];
  return top && top.share >= minShare ? top : undefined;
}
