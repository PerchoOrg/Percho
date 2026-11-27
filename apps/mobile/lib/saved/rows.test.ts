import { describe, expect, it } from "vitest";
import { areaUnitId, formatPrice, glanceFact, specsLine } from "./rows";

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

describe("glanceFact", () => {
	const place = { lead: "Suwanee, GA" };

	it("prints the card's figures in its order, each with its label but the price", () => {
		expect(
			glanceFact({
				place,
				cells: [
					{ value: "$685K", label: "est. home value", topic: "potential" },
					{ value: "A+", label: "school grade", topic: "schools" },
					{ value: "6 min", label: "to I-85", topic: "convenience" },
				],
			}),
		).toBe("$685K · A+ school grade · 6 min to I-85");
	});

	it("keeps the label of a schools figure past the letters", () => {
		expect(
			glanceFact({
				place,
				cells: [{ value: "Top 62%", label: "school nearby", topic: "schools" }],
			}),
		).toBe("Top 62% school nearby");
	});

	it("says nothing when the server sent no figures", () => {
		expect(glanceFact({ place, cells: [] })).toBeUndefined();
		expect(glanceFact(undefined)).toBeUndefined();
	});
});
