/**
 * The header's place strings and numbers — the parts with no `View` in them.
 *
 * Split out of `components/feed/PlaceHeader.tsx` on 2026-09-06 so they can be
 * unit-tested: the mobile vitest suite imports no RN runtime
 * (`vitest.config.ts`), so anything reachable from a `.tsx` that imports
 * `react-native` can only be asserted as source text. These are the numbers on
 * the page — they deserve real tests.
 */
import type { GeoUnit } from "./geo-unit";

/**
 * The root of the scope. Every one of the pool's 109 city units is in metro
 * Atlanta, so this is a fact about the inventory rather than a placeholder —
 * but it IS the one string here that no row supplies, and it is the line to
 * change on the day a second metro launches.
 */
export const SCOPE_ROOT_LABEL = "Atlanta metro";

/** "$594K" — a full `$594,450` crowds the stats line. */
function shortPrice(value: number): string {
	if (value >= 1_000_000) {
		const m = value / 1_000_000;
		return `$${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
	}
	return `$${Math.round(value / 1000)}K`;
}

/**
 * The stats line for a unit, built only from what the unit carries — used here
 * and by `ScopeSheet` for each city's subtitle. A city with no median must
 * produce one clause, not a dangling separator; a city with neither produces
 * null and the line does not render (`every emitted number is real or absent`,
 * see `lib/feed/geo-units.ts`).
 *
 * The approved demo also showed "12 with tours". It has never shipped: the
 * wire has no such number — `city_geo_units` aggregates `community_count` and
 * a median list price, and a per-city count of communities WITH a finished
 * tour would need the view changed.
 */
export function scopeStatsLine(unit: GeoUnit | undefined): string | null {
	if (!unit) return null;
	const parts: string[] = [];
	if (unit.communityCount > 0) {
		parts.push(
			`${unit.communityCount.toLocaleString()} ${
				unit.communityCount === 1 ? "community" : "communities"
			}`,
		);
	}
	const median = unit.stats.medianListPrice;
	if (median) parts.push(`median ${shortPrice(median.value)}`);
	return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The same line for the WHOLE metro — the sum of what the pool carries.
 *
 * The header's first row is the numbers row, and with no city scoped there is
 * no unit to read it from: the row sat empty while the metro's name appeared
 * TWICE, once as the control and once as the title. That is the state the
 * owner was looking at on 2026-09-06 — 「Atlanta metro and community info still
 * not in one line」 — and it is why this exists.
 *
 * Count only, no median: `city_geo_units` carries one per city and on the live
 * wire today ZERO of the 109 units populate it, so a metro median would be a
 * number with nothing behind it.
 */
export function metroStatsLine(units: readonly GeoUnit[]): string | null {
	const total = units.reduce((sum, u) => sum + u.communityCount, 0);
	if (total <= 0) return null;
	return `${total.toLocaleString()} ${total === 1 ? "community" : "communities"}`;
}
