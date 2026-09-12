import { describe, expect, it } from "vitest";
import { insightLines } from "./persona-lines";

function geo(right: number, left: number) {
	return [{ unitId: "u", level: "city" as const, right, left }];
}

describe("insightLines", () => {
	it("is empty with nothing to read", () => {
		expect(insightLines({ dims: {}, geo: [] })).toEqual([]);
	});

	it("names the most-explored area", () => {
		expect(insightLines({ topArea: "Alpharetta", dims: {}, geo: [] })).toEqual([
			"Most at home in Alpharetta",
		]);
	});

	it("reads the lean, against the most-rejected dim when there is one", () => {
		expect(
			insightLines({ dims: { quiet: 3, nightlife: -1.5, hip: -0.5 }, geo: [] }),
		).toEqual(["Leaning quiet streets over nightlife nearby"]);
		expect(insightLines({ dims: { quiet: 3 }, geo: [] })).toEqual([
			"Leaning quiet streets",
		]);
	});

	it("turns the like ratio into a 1-in-N line", () => {
		expect(insightLines({ dims: {}, geo: geo(4, 8) })).toEqual([
			"You like 1 in 3 places you see",
		]);
		expect(insightLines({ dims: {}, geo: geo(5, 1) })).toEqual([
			"You like almost everything you see",
		]);
	});

	it("withholds the ratio on too few swipes, or no likes", () => {
		expect(insightLines({ dims: {}, geo: geo(1, 1) })).toEqual([]);
		expect(insightLines({ dims: {}, geo: geo(0, 9) })).toEqual([]);
	});
});
