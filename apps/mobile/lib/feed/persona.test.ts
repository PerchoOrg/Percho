import { describe, expect, it } from "vitest";
import { DIM_LABELS, STARTER_NAME, personaName, rankedDims } from "./persona";

describe("rankedDims", () => {
	it("orders by weight descending, ties alphabetical", () => {
		const ranked = rankedDims({ trails: 3, family: 3, quiet: 5 });
		expect(ranked.map((r) => r.dim)).toEqual(["quiet", "family", "trails"]);
	});

	it("drops non-positive, unknown and retired keys", () => {
		const ranked = rankedDims({
			trails: 2,
			quiet: -0.5,
			bogus: 9,
			space: 0,
			schools: 9,
		});
		expect(ranked.map((r) => r.dim)).toEqual(["trails"]);
	});
});

describe("personaName", () => {
	it("names the parks dim by the place, not the household", () => {
		expect(personaName({ trails: 4, family: 3 })).toBe(
			"Trail-Runner Park-Goer",
		);
		expect(personaName({ family: 4, trails: 3 })).toBe("Park-Side Explorer");
	});

	it("never names from schools, even when it leads", () => {
		expect(personaName({ schools: 9, trails: 1 })).toBe("Trail-Runner Buyer");
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
		// All three tables are Record<PersonaDim, string>; a hole would be a
		// type error, but the label strings themselves must be non-empty for
		// the UI, and none may characterise residents (Fair Housing).
		for (const label of Object.values(DIM_LABELS)) {
			expect(label.length).toBeGreaterThan(0);
			expect(label.toLowerCase()).not.toMatch(/family|school/);
		}
	});
});
