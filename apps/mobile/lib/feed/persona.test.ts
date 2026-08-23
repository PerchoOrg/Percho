import { describe, expect, it } from "vitest";
import {
	DIM_LABELS,
	DIM_NAME_THRESHOLD,
	personaName,
	rankedDims,
} from "./persona";

describe("rankedDims", () => {
	it("orders by weight descending, ties alphabetical", () => {
		const ranked = rankedDims({ trails: 3, family: 3, schools: 5 });
		expect(ranked.map((r) => r.dim)).toEqual(["schools", "family", "trails"]);
	});

	it("drops non-positive and unknown keys", () => {
		const ranked = rankedDims({ trails: 2, quiet: -0.5, bogus: 9, space: 0 });
		expect(ranked.map((r) => r.dim)).toEqual(["trails"]);
	});
});

describe("personaName", () => {
	it("produces the spec's own example from trails + family", () => {
		expect(personaName({ trails: 4, family: 3 })).toBe(
			"Trail-Runner Suburbanite",
		);
	});

	it("returns null with no signals", () => {
		expect(personaName({})).toBeNull();
	});

	it("returns null with only one dim over the threshold", () => {
		expect(
			personaName({ trails: 5, quiet: DIM_NAME_THRESHOLD - 1 }),
		).toBeNull();
	});

	it("needs both dims at the threshold, not just present", () => {
		expect(
			personaName({ trails: DIM_NAME_THRESHOLD, quiet: DIM_NAME_THRESHOLD }),
		).not.toBeNull();
	});

	it("is stable under object key order", () => {
		const a = personaName({ walkable: 3, nightlife: 3 });
		const b = personaName({ nightlife: 3, walkable: 3 });
		expect(a).toBe(b);
	});
});

describe("DIM_LABELS", () => {
	it("covers every dim the name tables cover", () => {
		// Both tables are Record<DimKey, string>; a hole would be a type error,
		// but the label strings themselves must be non-empty for the UI.
		for (const label of Object.values(DIM_LABELS)) {
			expect(label.length).toBeGreaterThan(0);
		}
	});
});
