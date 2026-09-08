/**
 * Which county a point falls in.
 *
 * Saved areas and geo units are CITIES; the lens metrics are per COUNTY,
 * because that is where tax and sanitation are actually set. This bridges the
 * two using the county outlines the lens map already downloaded — no extra
 * request, no new column, no geocoding.
 *
 * ── The accuracy this does and does not have ───────────────────────────────
 *
 * The shapes here are simplified to ~250 m for FILL (see
 * `scripts/admin/build-metro-county-shapes.ts`). A point within ~250 m of a
 * county line can therefore land on the wrong side. That is acceptable for
 * what this is used for — labelling a city row with its county's typical cost
 * — and is NOT acceptable for deciding which county a specific HOME is in,
 * which is why that job belongs to `backfill-community-county.ts` against the
 * unsimplified boundaries instead. Do not reuse this for a listing.
 *
 * A city that straddles a county line (Atlanta is in both Fulton and DeKalb)
 * resolves by its centroid, which is one honest answer to a question that has
 * two. The row says which county it used, so a buyer can see the assumption
 * rather than absorb it.
 */

import type { AreaShape } from "./areas-dto";

/** Ray casting on one ring. `[lng, lat]` throughout, matching the shape file. */
function pointInRing(
	lng: number,
	lat: number,
	ring: readonly [number, number][],
): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const a = ring[i];
		const b = ring[j];
		if (!a || !b) continue;
		const [ax, ay] = a;
		const [bx, by] = b;
		// Half-open on the y interval, so a vertex is not counted twice.
		if (ay > lat !== by > lat) {
			const x = ((bx - ax) * (lat - ay)) / (by - ay) + ax;
			if (lng < x) inside = !inside;
		}
	}
	return inside;
}

/**
 * The county whose outline contains the point, or undefined outside the metro.
 *
 * Undefined is a real answer here, not a failure: the shape file covers the
 * counties we have metrics for, and a city outside it genuinely has no lens
 * number to show. Callers render nothing rather than a zero.
 */
export function countyKeyForPoint(
	lat: number,
	lng: number,
	shapes: readonly AreaShape[],
): string | undefined {
	for (const shape of shapes) {
		for (const ring of shape.rings) {
			if (pointInRing(lng, lat, ring)) return shape.key;
		}
	}
	return undefined;
}
