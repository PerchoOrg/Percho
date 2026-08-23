import { describe, expect, it } from "vitest";
import {
	DEFAULT_INSURANCE_RATE,
	DEFAULT_TAX_RATE,
	assumptionLine,
	buildCost,
} from "./cost";

const base = { priceUsd: 470_000, annualRate: 0.065, downFraction: 0.2 };

describe("buildCost", () => {
	it("total is exactly the sum of the rendered bars", () => {
		const c = buildCost({ ...base, hoaMonthlyUsd: 55 });
		expect(c.totalUsd).toBe(
			c.principalInterestUsd + c.taxUsd + c.insuranceUsd + (c.hoaUsd ?? 0),
		);
	});

	it("omits the HOA bar when the listing has none", () => {
		const c = buildCost(base);
		expect("hoaUsd" in c).toBe(false);
		expect(c.totalUsd).toBe(c.principalInterestUsd + c.taxUsd + c.insuranceUsd);
	});

	it("tax and insurance follow the stated flat rates", () => {
		const c = buildCost(base);
		expect(c.taxUsd).toBe(Math.round((470_000 * DEFAULT_TAX_RATE) / 12));
		expect(c.insuranceUsd).toBe(
			Math.round((470_000 * DEFAULT_INSURANCE_RATE) / 12),
		);
	});

	it("P&I matches the shared amortisation at 20% down", () => {
		const c = buildCost(base);
		// 376k loan @ 6.5%/30yr ≈ $2,377/mo — sanity band, not a golden number.
		expect(c.principalInterestUsd).toBeGreaterThan(2300);
		expect(c.principalInterestUsd).toBeLessThan(2450);
	});
});

describe("assumptionLine", () => {
	it("names every assumption and ends with the disclaimer", () => {
		const line = assumptionLine({ downFraction: 0.2, annualRate: 0.065 });
		expect(line).toContain("20% down");
		expect(line).toContain("6.5%");
		expect(line).toContain("property tax");
		expect(line).toContain("insurance");
		expect(line.endsWith("Not a lending offer.")).toBe(true);
	});
});
