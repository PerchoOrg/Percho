/**
 * The feed header's place numbers (phase181.5).
 *
 * ── The bug these pin ───────────────────────────────────────────────────────
 *
 * With no city scoped the header's numbers row had nothing to print —
 * `scopeStatsLine` reads a unit and there is no unit for "the whole metro" —
 * while the TITLE below fell back to the metro's name. So the page rendered:
 *
 *     Atlanta Metro          ← the control
 *     Atlanta Metro          ← the title
 *
 * the same words twice and not a number in sight, which is what the owner was
 * looking at when he wrote 「Atlanta metro and community info still not in one
 * line」 on 2026-09-06.
 *
 * These lived in `theme/place-header.test.ts` while `PlaceHeader` was the only
 * caller, alongside source assertions about that component. phase183 replaced
 * it with `FeedHeader`, whose header carries no numbers (the handoff removes
 * the community count by name), so the file moved next to the module it
 * actually tests. `scopeStatsLine` still dresses every city row in
 * `ScopeSheet`; `metroStatsLine` has no caller today and is kept because the
 * metro's count is one prop away from returning if the owner asks for it.
 */
import { describe, expect, it } from "vitest";
import type { GeoUnit } from "./geo-unit";
import { metroStatsLine, scopeStatsLine } from "./place-stats";

function unit(over: Partial<GeoUnit> = {}): GeoUnit {
	return {
		id: "city:dallas-ga",
		level: "city",
		name: "Dallas",
		state: "GA",
		centroid: { lat: 33.9, lng: -84.8 },
		heroUrl: "https://example.test/c.jpg",
		communityCount: 188,
		sampleCommunityNames: [],
		stats: {},
		...over,
	} as GeoUnit;
}

describe("metroStatsLine", () => {
	it("sums the pool's communities", () => {
		expect(
			metroStatsLine([
				unit({ communityCount: 731 }),
				unit({ communityCount: 188 }),
			]),
		).toBe("919 communities");
	});

	it("does not pluralise one community", () => {
		expect(metroStatsLine([unit({ communityCount: 1 })])).toBe("1 community");
	});

	it("is absent rather than zero", () => {
		// "0 communities" under the metro's name would be a worse first frame
		// than no line at all — and it is what an empty pool would print.
		expect(metroStatsLine([])).toBeNull();
		expect(metroStatsLine([unit({ communityCount: 0 })])).toBeNull();
	});

	/**
	 * Live wire, 2026-09-06: 109 city units, ZERO with a `medianListPrice`. So
	 * the scoped line renders a count alone today — the median clause is real
	 * code for a column that is real but unpopulated, not decoration.
	 */
	it("scoped: count alone when the city has no median", () => {
		expect(scopeStatsLine(unit())).toBe("188 communities");
		expect(
			scopeStatsLine(
				unit({ stats: { medianListPrice: { value: 594_000 } } } as never),
			),
		).toBe("188 communities · median $594K");
	});
});
