/**
 * "If I rented it out" — the ROI block under the cost breakdown (phase D).
 *
 * The 2026-08 remote-buyer study asked for this by name: half the remote
 * buyers were weighing "live in it" against "rent it out", and none had a
 * number. This is the standard back-of-envelope every landlord runs, on the
 * same cost figures the CostBlock already shows, so the two can never
 * disagree — one `CostBreakdown` in, four ratios out.
 *
 * Rent is an INPUT. The default is the ZIP's typical single-family rent
 * (Zillow ZORI, metro-SFR-adjusted), which the buyer can overwrite; the
 * block names the source and month. Vacancy is a flat 5% (~2.5 weeks/yr) —
 * disclosed, and the only assumption that is not already in the cost line.
 *
 * Definitions (all annual, all before income tax):
 *   NOI          = rent × (1 − vacancy) − tax − insurance − upkeep − HOA
 *   cash flow    = NOI − principal & interest
 *   cap rate     = NOI / price
 *   cash-on-cash = cash flow / down payment
 *   gross yield  = rent / price
 */
import type { CostBreakdown } from "./cost";

/** Fraction of the year assumed vacant — 5% ≈ 2.5 weeks. */
export const DEFAULT_VACANCY_RATE = 0.05;

export interface RoiInput {
	priceUsd: number;
	downFraction: number;
	monthlyRentUsd: number;
	cost: CostBreakdown;
	vacancyRate?: number;
}

export interface RoiResult {
	/** Monthly, after vacancy, before any costs. */
	effectiveRentUsd: number;
	/** Monthly cash flow after P&I, tax, insurance, upkeep, HOA. Negative = you top it up. */
	monthlyCashFlowUsd: number;
	/** Annual NOI / price, as a fraction. */
	capRate: number;
	/** Annual cash flow / down payment, as a fraction. NaN-free: 0 when no down payment. */
	cashOnCash: number;
	/** Annual rent / price, as a fraction. */
	grossYield: number;
}

export function computeRoi(input: RoiInput): RoiResult {
	const {
		priceUsd,
		downFraction,
		monthlyRentUsd,
		cost,
		vacancyRate = DEFAULT_VACANCY_RATE,
	} = input;
	const rent = Math.max(monthlyRentUsd, 0);
	const effectiveRentUsd = Math.round(rent * (1 - vacancyRate));
	const operating =
		cost.taxUsd + cost.insuranceUsd + cost.maintenanceUsd + (cost.hoaUsd ?? 0);
	const noiMonthly = effectiveRentUsd - operating;
	const monthlyCashFlowUsd = Math.round(noiMonthly - cost.principalInterestUsd);
	const downUsd = priceUsd * Math.min(Math.max(downFraction, 0), 1);
	return {
		effectiveRentUsd,
		monthlyCashFlowUsd,
		capRate: priceUsd > 0 ? (noiMonthly * 12) / priceUsd : 0,
		cashOnCash: downUsd > 0 ? (monthlyCashFlowUsd * 12) / downUsd : 0,
		grossYield: priceUsd > 0 ? (rent * 12) / priceUsd : 0,
	};
}

/** 0.0412 → "4.1%"; −0.023 → "−2.3%". One decimal: these are estimates. */
export function formatPct(fraction: number): string {
	const pct = fraction * 100;
	const s = Math.abs(pct).toFixed(1);
	return pct < 0 ? `−${s}%` : `${s}%`;
}
