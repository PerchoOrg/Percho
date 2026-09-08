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

/**
 * Which of the buyer's saved cities sit in each county, by county key.
 *
 * The lens map ranks COUNTIES; a buyer saves CITIES. So a county cannot be
 * marked "saved" — they never saved Cherokee, they saved Woodstock — and the
 * honest thing to show is the city itself. `Cherokee · Woodstock, saved` tells
 * them where they already stand on a map of 29 otherwise identical outlines.
 *
 * Names come back in the order the units are given, and a county with none is
 * simply absent rather than mapped to an empty array, so callers can test
 * presence with a lookup.
 */
export function savedCitiesByCounty(
	savedUnitIds: readonly string[],
	units: readonly {
		id: string;
		name: string;
		centroid: { lat: number; lng: number };
	}[],
	shapes: readonly AreaShape[],
): Map<string, string[]> {
	const wanted = new Set(savedUnitIds);
	const out = new Map<string, string[]>();
	for (const u of units) {
		if (!wanted.has(u.id)) continue;
		const key = countyKeyForPoint(u.centroid.lat, u.centroid.lng, shapes);
		// Undefined is a real answer: a saved city outside the covered metro
		// has no county row to sit under. See `countyKeyForPoint`.
		if (!key) continue;
		const list = out.get(key);
		if (list) list.push(u.name);
		else out.set(key, [u.name]);
	}
	return out;
}

/**
 * "Woodstock, saved" / "Woodstock and Canton, saved" — or nothing.
 *
 * Kept beside the resolution so the two cannot drift, and phrased as the
 * cities rather than the county for the reason above.
 */
export function savedCityNote(
	names: readonly string[] | undefined,
): string | undefined {
	if (!names || names.length === 0) return undefined;
	if (names.length === 1) return `${names[0]}, saved`;
	if (names.length === 2) return `${names[0]} and ${names[1]}, saved`;
	return `${names[0]} and ${names.length - 1} more, saved`;
}
