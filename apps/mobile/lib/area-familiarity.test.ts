import { describe, expect, it } from "vitest";
import {
	COVERAGE_SATURATION,
	familiarityFor,
	unknownDimsLabel,
} from "./area-familiarity";

function geo(unitId: string, right: number, left: number) {
	return [{ unitId, level: "city" as const, right, left }];
}

describe("familiarityFor", () => {
	it("returns 0 for an unseen unit", () => {
		const f = familiarityFor({ geo: [], dims: {} }, "city:atlanta-ga");
		expect(f.score).toBe(0);
		expect(f.cardsSeen).toBe(0);
		expect(f.knownDims).toEqual([]);
	});

	it("saturates coverage at 25 cards", () => {
		const f = familiarityFor(
			{ geo: geo("city:decatur-ga", 30, 0), dims: {} },
			"city:decatur-ga",
		);
		expect(f.coverage).toBe(40);
		expect(f.cardsSeen).toBe(30);
	});

	it("caps coverage at the saturation denominator", () => {
		const f = familiarityFor(
			{ geo: geo("city:decatur-ga", COVERAGE_SATURATION, 0), dims: {} },
			"city:decatur-ga",
			COVERAGE_SATURATION,
		);
		expect(f.coverage).toBe(40);
	});

	it("a 50/50 like/pass split yields zero decisiveness", () => {
		const f = familiarityFor(
			{ geo: geo("city:decatur-ga", 10, 10), dims: {} },
			"city:decatur-ga",
		);
		expect(f.decisiveness).toBe(0);
	});

	it("a decisive like rate yields full decisiveness", () => {
		const f = familiarityFor(
			{ geo: geo("city:decatur-ga", 20, 0), dims: {} },
			"city:decatur-ga",
		);
		expect(f.decisiveness).toBe(30);
	});

	it("a known pillar dim adds 7.5 points and is excluded from the gap", () => {
		const f = familiarityFor(
			{ geo: geo("city:decatur-ga", 20, 0), dims: { schools: 2 } },
			"city:decatur-ga",
		);
		expect(f.dimensions).toBe(7.5);
		expect(f.knownDims).toEqual(["schools"]);
		expect(f.unknownDims).toHaveLength(3);
		// 20/25 cards → 32 coverage + 30 decisiveness + 7.5 dims = 69.5 → 70
		expect(f.score).toBe(70);
	});

	it("a dim with a single signal is NOT known (≥2 required)", () => {
		const f = familiarityFor(
			{ geo: geo("city:decatur-ga", 20, 0), dims: { family: 1 } },
			"city:decatur-ga",
		);
		expect(f.knownDims).toEqual([]);
	});

	it("all four pillars known leaves nothing unknown", () => {
		const f = familiarityFor(
			{
				geo: geo("city:decatur-ga", 25, 0),
				dims: { family: 2, schools: 2, walkable: 2, space: 2 },
			},
			"city:decatur-ga",
		);
		expect(f.knownDims).toHaveLength(4);
		expect(f.unknownDims).toEqual([]);
		expect(f.dimensions).toBe(30);
		// 25/25 cards → 40 coverage + 30 decisiveness + 30 dims = 100
		expect(f.score).toBe(100);
	});
});

describe("unknownDimsLabel", () => {
	it("names the gaps in buyer-facing vocabulary", () => {
		expect(unknownDimsLabel(["family", "schools"])).toBe(
			"safety & schools still unknown",
		);
	});
	it("handles the known-all case", () => {
		expect(unknownDimsLabel([])).toBe("all four pillars known");
	});
});
