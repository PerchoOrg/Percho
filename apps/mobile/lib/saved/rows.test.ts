import { describe, expect, it } from "vitest";
import { areaUnitId, formatPrice, specsLine } from "./rows";

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
