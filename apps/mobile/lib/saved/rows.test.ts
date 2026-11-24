import { describe, expect, it } from "vitest";
import { areaUnitId, communityFact, formatPrice, specsLine } from "./rows";

describe("formatPrice", () => {
	it("formats with grouping and a dollar sign", () => {
		expect(formatPrice(685000)).toBe("$685,000");
	});

	it("returns undefined for absent or non-positive values", () => {
		expect(formatPrice(undefined)).toBeUndefined();
		expect(formatPrice(0)).toBeUndefined();
		expect(formatPrice(Number.NaN)).toBeUndefined();
	});
});

describe("specsLine", () => {
	it("joins the parts it has", () => {
		expect(specsLine(4, 3, 2853)).toBe("4 bd · 3 ba · 2,853 sqft");
		expect(specsLine(4, undefined, undefined)).toBe("4 bd");
	});

	it("returns undefined when nothing is known", () => {
		expect(specsLine(undefined, undefined, undefined)).toBeUndefined();
	});
});

describe("areaUnitId", () => {
	it("strips the area card prefix", () => {
		expect(areaUnitId("area-city:decatur-ga")).toBe("city:decatur-ga");
	});

	it("passes a bare unit id through", () => {
		expect(areaUnitId("city:decatur-ga")).toBe("city:decatur-ga");
	});
});

describe("communityFact", () => {
	const school = (label: string, rank: string) => ({
		group: "Schools",
		label,
		rank,
		of: "of 1,000 in GA",
		percentile: 50,
	});
	const profile = {
		asOf: "2026-11-01",
		verdict: { good: [], watch: [] },
		sources: [],
	};

	it("words the schools as a range and adds the home value", () => {
		expect(
			communityFact({
				...profile,
				ranks: { rows: [school("Elementary", "#120"), school("High", "#452")] },
				homeValue: {
					area: "ZIP 30005",
					display: "$747K",
					change: "",
					headline: "",
					baseline: "",
					series: [],
				},
			}),
		).toBe("Schools Top 12–46% · $747K");
	});

	it("prints one share when the levels agree", () => {
		expect(
			communityFact({
				...profile,
				ranks: { rows: [school("Elementary", "#120")] },
			}),
		).toBe("Schools Top 12%");
	});

	it("says nothing for a community with no findings", () => {
		expect(communityFact(profile)).toBeUndefined();
		expect(communityFact(undefined)).toBeUndefined();
	});
});
