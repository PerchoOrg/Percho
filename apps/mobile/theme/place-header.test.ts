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

describe("the header is one line", () => {
	/**
	 * Owner, 2026-09-06: 「Make all text in one line, ok? If too big to fit in,
	 * just use smaller size」. Three earlier passes split this across two rows;
	 * this fails if it happens again.
	 */
	it("draws every run inside a single auto-shrinking Text", () => {
		expect(HEADER).toContain("adjustsFontSizeToFit");
		expect(HEADER).toContain("numberOfLines={1}");
		expect(HEADER).toContain("minimumFontScale");
		// A View chevron cannot ride inside a Text that is being scaled, so the
		// chevron has to be a character.
		expect(HEADER).not.toContain("<View style={styles.chevron}");
		// One Pressable: the whole line is the control.
		expect(HEADER.match(/<Pressable/g) ?? []).toHaveLength(1);
	});

	/**
	 * phase182.1 (owner: 「second line is area and city and communities
	 * count」): the count closes EVERY state of the line. A trail with a city
	 * leaf reads that city's unit (`trailUnit`); a metro leaf and the unscoped
	 * fallback read the metro's sum; a scoped fallback reads the scoped unit.
	 */
	it("always closes the line with the leaf's own numbers", () => {
		expect(HEADER).toContain("scopeStatsLine(trailUnit)");
		expect(HEADER).toContain("scopeStatsLine(unit)");
		expect(HEADER).toContain("metroStatsLine(units)");
		// The count is not gated on the fallback any more.
		expect(HEADER).not.toContain("leaf === null && stats");
	});

	/** Unscoped, the metro IS the place — it must not also precede itself. */
	it("does not print the metro twice", () => {
		expect(HEADER).toContain("{scopeName ? (");
		expect(HEADER).toContain("{scopeName ?? SCOPE_ROOT_LABEL}");
	});
});
