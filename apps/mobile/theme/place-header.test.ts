/**
 * The feed header's numbers row (phase181.5).
 *
 * ── The bug this pins ───────────────────────────────────────────────────────
 *
 * With no city scoped the row had nothing to print — `scopeStatsLine` reads a
 * unit and there is no unit for "the whole metro" — while the TITLE below fell
 * back to the metro's name. So the page rendered:
 *
 *     Atlanta Metro          ← the control
 *     Atlanta Metro          ← the title
 *
 * the same words twice and not a number in sight, which is what the owner was
 * looking at when he wrote 「Atlanta metro and community info still not in one
 * line」 on 2026-09-06.
 *
 * The component is read as source here rather than rendered: the mobile vitest
 * suite is deliberately react-native-free (see `vitest.config.ts`), so the
 * numbers themselves are unit-tested and the wiring is asserted as text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GeoUnit } from "../lib/feed/geo-unit";
import { metroStatsLine, scopeStatsLine } from "../lib/feed/place-stats";

const HEADER = readFileSync("components/feed/PlaceHeader.tsx", "utf8");

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

describe("the header never says the same place twice", () => {
	it("shows the metro control only when a city is scoped", () => {
		// Unscoped, the metro IS the title; the row above it must not repeat it.
		expect(HEADER).toContain("{scopeName ? (");
		expect(HEADER).toContain("styles.metroLabel");
	});

	it("falls back to the metro's numbers when nothing is scoped", () => {
		expect(HEADER).toContain(
			"scopeName ? scopeStatsLine(unit) : metroStatsLine(units)",
		);
	});
});
