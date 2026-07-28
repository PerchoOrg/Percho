import { describe, expect, it } from "vitest";
import {
	DEFAULT_DOWN_FRACTION,
	computeMonthly,
	formatUsd,
	parseHoaMonthlyUsd,
} from "./monthly";

describe("computeMonthly", () => {
	it("defaults to the §2.1 #4 20% down", () => {
		const r = computeMonthly({ priceUsd: 500_000, annualRate: 0.065 });
		expect(DEFAULT_DOWN_FRACTION).toBe(0.2);
		expect(r.downPaymentUsd).toBe(100_000);
		expect(r.loanAmountUsd).toBe(400_000);
	});

	it("matches a hand-computed 30y amortisation", () => {
		// 400,000 at 6.5%/30y = 2528.27 by the standard formula.
		const r = computeMonthly({ priceUsd: 500_000, annualRate: 0.065 });
		expect(r.principalAndInterestUsd).toBe(2528);
	});

	it("does not divide by zero at a 0% rate", () => {
		// The limit of the formula as r→0 is loan/n. Without the branch this is NaN,
		// which renders as "$NaN/mo" on a real card.
		const r = computeMonthly({
			priceUsd: 360_000,
			downFraction: 0,
			annualRate: 0,
			termYears: 30,
		});
		expect(r.principalAndInterestUsd).toBe(1000);
		expect(Number.isNaN(r.totalUsd)).toBe(false);
	});

	it("handles an all-cash purchase without producing a negative loan", () => {
		const r = computeMonthly({
			priceUsd: 400_000,
			downFraction: 1,
			annualRate: 0.065,
		});
		expect(r.loanAmountUsd).toBe(0);
		expect(r.principalAndInterestUsd).toBe(0);
		expect(r.totalUsd).toBe(0);
	});

	it("clamps a nonsense down fraction instead of inverting the loan", () => {
		const over = computeMonthly({
			priceUsd: 400_000,
			downFraction: 1.5,
			annualRate: 0.065,
		});
		expect(over.loanAmountUsd).toBe(0);
		const under = computeMonthly({
			priceUsd: 400_000,
			downFraction: -0.5,
			annualRate: 0.065,
		});
		expect(under.loanAmountUsd).toBe(400_000);
	});

	it("only includes components it was actually given — no estimated insurance", () => {
		const bare = computeMonthly({ priceUsd: 400_000, annualRate: 0.06 });
		expect(bare.includes).toEqual(["principal_interest"]);
		expect(bare.hoaMonthlyUsd).toBeUndefined();
		expect(bare.taxMonthlyUsd).toBeUndefined();
		expect(bare.totalUsd).toBe(bare.principalAndInterestUsd);
	});

	it("folds in real HOA and tax and reports them in `includes`", () => {
		const r = computeMonthly({
			priceUsd: 400_000,
			annualRate: 0.06,
			hoaMonthlyUsd: 85,
			annualTaxUsd: 6120,
		});
		expect(r.taxMonthlyUsd).toBe(510);
		expect(r.hoaMonthlyUsd).toBe(85);
		expect(r.includes).toEqual(["principal_interest", "tax", "hoa"]);
		expect(r.totalUsd).toBe(r.principalAndInterestUsd + 510 + 85);
	});

	it("treats a zero HOA as absent, not as a $0 line", () => {
		const r = computeMonthly({
			priceUsd: 400_000,
			annualRate: 0.06,
			hoaMonthlyUsd: 0,
		});
		expect(r.hoaMonthlyUsd).toBeUndefined();
		expect(r.includes).not.toContain("hoa");
	});
});

describe("parseHoaMonthlyUsd", () => {
	it("reads the real production shapes of the text column", () => {
		expect(parseHoaMonthlyUsd("$85/mo")).toBe(85);
		expect(parseHoaMonthlyUsd("250")).toBe(250);
		expect(parseHoaMonthlyUsd("$1,200/mo")).toBe(1200);
	});

	it("converts only on an EXPLICIT annual marker", () => {
		expect(parseHoaMonthlyUsd("$1,200/yr")).toBe(100);
		expect(parseHoaMonthlyUsd("1200 annually")).toBe(100);
		// No marker: NOT guessed from magnitude. A wrong guess 12×'s the payment.
		expect(parseHoaMonthlyUsd("1200")).toBe(1200);
	});

	it("returns undefined for anything without a usable number", () => {
		expect(parseHoaMonthlyUsd(null)).toBeUndefined();
		expect(parseHoaMonthlyUsd(undefined)).toBeUndefined();
		expect(parseHoaMonthlyUsd("")).toBeUndefined();
		expect(parseHoaMonthlyUsd("none")).toBeUndefined();
		expect(parseHoaMonthlyUsd("N/A")).toBeUndefined();
		// $0 means "no HOA", which must render as absent, not as "$0/mo".
		expect(parseHoaMonthlyUsd("$0")).toBeUndefined();
	});
});

describe("formatUsd", () => {
	it("groups thousands and drops cents", () => {
		expect(formatUsd(3890)).toBe("$3,890");
		expect(formatUsd(2528.27)).toBe("$2,528");
		expect(formatUsd(0)).toBe("$0");
	});
});
