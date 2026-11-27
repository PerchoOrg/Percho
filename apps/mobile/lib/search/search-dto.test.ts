import { describe, expect, it } from "vitest";
import { parseSearchResult } from "./search-dto";

describe("parseSearchResult", () => {
	it("keeps well-formed rows and drops the rest", () => {
		const r = parseSearchResult({
			listings: [
				{
					id: "a",
					slug: "a",
					address: "1 St",
					city: "Duluth",
					price: 1,
					lat: 1,
					lng: 2,
				},
				{ id: "b" },
				null,
			],
			communities: [
				{ id: "c", slug: "c", name: "Windward", city: "Alpharetta" },
				"junk",
			],
		});
		expect(r.listings.map((l) => l.id)).toEqual(["a"]);
		expect(r.listings[0]?.state).toBe("GA");
		expect(r.listings[0]?.lng).toBe(2);
		expect(r.communities.map((c) => c.slug)).toEqual(["c"]);
	});

	it("tolerates a bare or empty body", () => {
		expect(parseSearchResult(undefined)).toEqual({
			cities: [],
			schools: [],
			listings: [],
			communities: [],
		});
		expect(parseSearchResult({ listings: "x" }).listings).toEqual([]);
	});

	it("reads cities (phase409) and drops a city without a slug", () => {
		const r = parseSearchResult({
			cities: [
				{
					slug: "peachtree-corners-ga",
					name: "Peachtree Corners",
					county: "Gwinnett",
				},
				{ name: "No slug" },
			],
		});
		expect(r.cities.map((c) => c.slug)).toEqual(["peachtree-corners-ga"]);
		expect(r.cities[0]?.state).toBe("GA");
	});

	it("reads schools (phase410) and drops one without a point", () => {
		const r = parseSearchResult({
			schools: [
				{
					id: "s1",
					name: "Lambert High School",
					level: "high",
					zip: "30024",
					lat: 34.1,
					lng: -84.1,
				},
				{ id: "s2", name: "No point" },
			],
		});
		expect(r.schools.map((x) => x.id)).toEqual(["s1"]);
		expect(r.schools[0]?.zip).toBe("30024");
	});
});
