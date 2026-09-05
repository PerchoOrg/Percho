import { describe, expect, it } from "vitest";
import { type TourSegment, bucketLabel, buildTourGroups } from "./tour-buckets";

/** A film's places, as the wire sends them. */
function seg(name: string, endFraction: number, bucket?: string): TourSegment {
	return { name, endFraction, ...(bucket ? { bucket } : {}) };
}

describe("bucketLabel", () => {
	it("names the buckets the page charts", () => {
		expect(bucketLabel("dining")).toBe("Food");
		expect(bucketLabel("schools")).toBe("Schools");
	});

	it("refuses the two the page will not name", () => {
		expect(bucketLabel("other")).toBeNull();
		expect(bucketLabel("asian_community")).toBeNull();
	});

	it("refuses a bucket it has never seen", () => {
		expect(bucketLabel("speakeasies")).toBeNull();
	});
});

describe("buildTourGroups", () => {
	it("groups a real tour by category, in film order", () => {
		// Peachtree Corners' live tour, 2026-09-05.
		const segments = [
			seg("Norcross High School", 0.11, "schools"),
			seg("Wesleyan School", 0.22, "schools"),
			seg("The Forum", 0.33, "shopping"),
			seg("Town Center", 0.44, "shopping"),
			seg("Trader Joe's", 0.55, "shopping"),
			seg("Jones Bridge Park", 0.66, "outdoor"),
			seg("Pinckneyville Park", 0.77, "outdoor"),
			seg("High Country Outfitters", 0.88, "daily_errands"),
			seg("Corners Connector Trail", 1, "waterfront"),
		];
		const { groups, keyByIndex } = buildTourGroups(segments);

		expect(groups.map((g) => [g.label, g.count])).toEqual([
			["Schools", 2],
			["Shopping", 3],
			["Parks", 2],
			["Errands", 1],
			["Water", 1],
		]);
		expect(groups.map((g) => g.firstSegmentIndex)).toEqual([0, 2, 5, 7, 8]);
		expect(keyByIndex).toHaveLength(segments.length);
		expect(keyByIndex[4]).toBe("shopping");
	});

	it("keeps one group when a category is revisited later in the film", () => {
		// Aberdeen's tour interleaves; a chip must not appear twice.
		const { groups, keyByIndex } = buildTourGroups([
			seg("Clubhouse", 0.25, "amenities"),
			seg("Sharon Elementary", 0.5, "schools"),
			seg("Pool", 0.75, "amenities"),
			seg("Riverwatch Middle", 1, "schools"),
		]);
		expect(groups.map((g) => [g.label, g.count, g.firstSegmentIndex])).toEqual([
			["Amenities", 2, 0],
			["Schools", 2, 1],
		]);
		expect(keyByIndex).toEqual([
			"amenities",
			"schools",
			"amenities",
			"schools",
		]);
	});

	it("folds unnamed buckets into More rather than printing them", () => {
		const { groups, keyByIndex } = buildTourGroups([
			seg("Park", 0.5, "outdoor"),
			seg("Somewhere", 0.75, "other"),
			seg("Unjoined place", 1),
		]);
		expect(groups.map((g) => [g.label, g.count])).toEqual([
			["Parks", 1],
			["More", 2],
		]);
		expect(keyByIndex).toEqual(["outdoor", "more", "more"]);
	});

	it("draws no strip when nothing can be categorised", () => {
		// Every chip would read "More" — chrome that says nothing.
		expect(buildTourGroups([seg("A", 0.5), seg("B", 1)]).groups).toEqual([]);
		expect(
			buildTourGroups([seg("A", 0.5, "other"), seg("B", 1, "other")]).groups,
		).toEqual([]);
	});

	it("draws no strip for a film with no places", () => {
		expect(buildTourGroups([])).toEqual({ groups: [], keyByIndex: [] });
	});
});
