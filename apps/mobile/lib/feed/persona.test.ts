import { describe, expect, it } from "vitest";
import { DIM_LABELS, STARTER_NAME, personaName, rankedDims } from "./persona";

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

	it("is the starter name with no signals", () => {
		expect(personaName({})).toBe(STARTER_NAME);
		expect(personaName({ quiet: 0, hip: -1 })).toBe(STARTER_NAME);
	});

	it("pairs a lone dim with the neutral noun", () => {
		expect(personaName({ trails: 1 })).toBe("Trail-Runner Buyer");
	});

	it("names from any two positive dims, however light", () => {
		expect(personaName({ trails: 1, quiet: 0.5 })).toBe(
			"Trail-Runner Homebody",
		);
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
