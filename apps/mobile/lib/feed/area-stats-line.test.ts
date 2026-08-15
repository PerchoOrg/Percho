/**
 * `communityLine` — the city card's ONE fact row. The owner's rule: only
 * meaningful data, and singular/plural must never render `1 communities`.
 *
 * Was `statsLine`, which also rendered `· N homes` from `stats.activeListings`.
 * The owner deleted that half on 2026-08-17 (the city card now shows name +
 * community count + Explore, nothing else), so the `homes` cases went with it.
 * The active-listing count is a number that moves week to week and says
 * nothing about the city.
 */
import { describe, expect, it } from "vitest";
import type { AreaCardV3 } from "./card-types";

function card(over: Partial<AreaCardV3["unit"]>): AreaCardV3 {
	return {
		kind: "area",
		id: "area-x",
		unit: {
			id: "city:x-ga",
			level: "city",
			name: "X",
			state: "GA",
			centroid: { lat: 1, lng: 1 },
			communityCount: 0,
			sampleCommunityNames: [],
			stats: {},
			...over,
		},
	};
}

// `AreaFace` imports react-native, which this suite deliberately excludes
// (see vitest.config.ts), so the function is mirrored here rather than
// imported. Keep this body byte-identical to `communityLine` in AreaFace.tsx.
function communityLine(c: AreaCardV3): string | undefined {
	const { communityCount } = c.unit;
	if (communityCount <= 0) return undefined;
	return communityCount === 1 ? "1 community" : `${communityCount} communities`;
}

describe("city community line", () => {
	it("pluralizes communities", () => {
		expect(communityLine(card({ communityCount: 8 }))).toBe("8 communities");
	});
	it("singular community", () => {
		expect(communityLine(card({ communityCount: 1 }))).toBe("1 community");
	});
	it("renders nothing when the city has no communities", () => {
		// No placeholder, no `0 communities` — the card falls back to name +
		// Explore alone (AreaFace's `ctaBottomRow` branch).
		expect(communityLine(card({ communityCount: 0 }))).toBeUndefined();
	});
	it("ignores the active-listing count entirely", () => {
		// The `· N homes` half was deleted 2026-08-17. A city with listings but
		// no communities must still render NO line — if this starts returning a
		// string, the homes row has crept back onto the card.
		expect(
			communityLine(card({ communityCount: 0, stats: { activeListings: 124 } })),
		).toBeUndefined();
	});
});
