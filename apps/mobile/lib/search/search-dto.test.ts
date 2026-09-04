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
			listings: [],
			communities: [],
		});
		expect(parseSearchResult({ listings: "x" }).listings).toEqual([]);
	});
});
