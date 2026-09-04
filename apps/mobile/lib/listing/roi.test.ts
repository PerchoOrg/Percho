import { describe, expect, it } from "vitest";
import { buildCost } from "./cost";
import { computeRoi, formatPct } from "./roi";

const cost = buildCost({
	priceUsd: 400_000,
	annualRate: 0.06,
	downFraction: 0.2,
	hoaMonthlyUsd: 100,
});

describe("computeRoi", () => {
	it("runs the standard landlord arithmetic on the CostBlock's own figures", () => {
		const r = computeRoi({
			priceUsd: 400_000,
			downFraction: 0.2,
			monthlyRentUsd: 3000,
			cost,
		});
		expect(r.effectiveRentUsd).toBe(2850); // 5% vacancy
		const operating =
			cost.taxUsd +
			cost.insuranceUsd +
			cost.maintenanceUsd +
			(cost.hoaUsd ?? 0);
		const noi = 2850 - operating;
		expect(r.monthlyCashFlowUsd).toBe(
			Math.round(noi - cost.principalInterestUsd),
		);
		expect(r.capRate).toBeCloseTo((noi * 12) / 400_000, 6);
		expect(r.cashOnCash).toBeCloseTo((r.monthlyCashFlowUsd * 12) / 80_000, 6);
		expect(r.grossYield).toBeCloseTo(0.09, 6);
	});

	it("goes negative honestly instead of clamping", () => {
		const r = computeRoi({
			priceUsd: 400_000,
			downFraction: 0.2,
			monthlyRentUsd: 1500,
			cost,
		});
		expect(r.monthlyCashFlowUsd).toBeLessThan(0);
		expect(r.cashOnCash).toBeLessThan(0);
	});

	it("never divides by zero", () => {
		const r = computeRoi({
			priceUsd: 400_000,
			downFraction: 0,
			monthlyRentUsd: 3000,
			cost,
		});
		expect(Number.isFinite(r.cashOnCash)).toBe(true);
		expect(r.cashOnCash).toBe(0);
	});
});

describe("formatPct", () => {
	it("one decimal, real minus sign", () => {
		expect(formatPct(0.0412)).toBe("4.1%");
		expect(formatPct(-0.023)).toBe("−2.3%");
		expect(formatPct(0)).toBe("0.0%");
	});
});
