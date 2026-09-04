/**
 * CostBlock breakdown (phase119, spec §3.7) — "What you'd actually pay".
 *
 * The big number is the MONTHLY all-in cost, not the list price, split into
 * the bars the reference shows: principal & interest / property tax /
 * insurance / HOA — plus, since phase D, a maintenance reserve. Hidden
 * carrying cost was the #1 "no idea what I was getting into" in the
 * 2026-08 remote-buyer study (5/10), and a payment that stops at PITI is
 * exactly the number that hides it. P&I reuses `monthly.ts`'s amortisation —
 * one formula, one more caller — and HOA reuses `parseHoaMonthlyUsd` upstream.
 *
 * Tax, insurance and maintenance are ESTIMATES from stated flat rates, which
 * is a deliberate departure from the old explore page's "we don't have them"
 * line: the spec asks for the full monthly picture under a disclosed
 * assumptions line ending "Not a lending offer." The rates are the
 * assumption label's to disclose — `assumptionLine` below is the only place
 * they are turned into copy, so the label can never disagree with the math.
 */
import { formatAsOf, formatRate, isRateStale } from "./assumptions";
import { computeMonthly } from "./monthly";

/** Effective property tax, fraction of price per year (metro-Atlanta typical). */
export const DEFAULT_TAX_RATE = 0.0085;
/** Homeowner's insurance, fraction of price per year. */
export const DEFAULT_INSURANCE_RATE = 0.0035;
/** Upkeep reserve, fraction of price per year — the standard 1% rule of thumb. */
export const DEFAULT_MAINTENANCE_RATE = 0.01;

export interface CostInput {
	priceUsd: number;
	annualRate: number;
	downFraction: number;
	hoaMonthlyUsd?: number;
}

export interface CostBreakdown {
	totalUsd: number;
	principalInterestUsd: number;
	taxUsd: number;
	insuranceUsd: number;
	maintenanceUsd: number;
	/** Absent when the listing has no parseable HOA. */
	hoaUsd?: number;
}

export function buildCost(input: CostInput): CostBreakdown {
	const { priceUsd, annualRate, downFraction, hoaMonthlyUsd } = input;
	const monthly = computeMonthly({
		priceUsd,
		annualRate,
		downFraction,
		annualTaxUsd: priceUsd * DEFAULT_TAX_RATE,
		...(hoaMonthlyUsd !== undefined ? { hoaMonthlyUsd } : {}),
	});
	const insuranceUsd = Math.round((priceUsd * DEFAULT_INSURANCE_RATE) / 12);
	const maintenanceUsd = Math.round((priceUsd * DEFAULT_MAINTENANCE_RATE) / 12);
	return {
		principalInterestUsd: monthly.principalAndInterestUsd,
		taxUsd: monthly.taxMonthlyUsd ?? 0,
		insuranceUsd,
		maintenanceUsd,
		...(monthly.hoaMonthlyUsd !== undefined
			? { hoaUsd: monthly.hoaMonthlyUsd }
			: {}),
		totalUsd: monthly.totalUsd + insuranceUsd + maintenanceUsd,
	};
}

/** The disclosure line. MUST name every assumption the bars were computed at. */
export function assumptionLine(input: {
	downFraction: number;
	annualRate: number;
	/** Survey week of the rate; adds a dated caveat once it is stale. */
	rateAsOf?: string;
	now?: Date;
}): string {
	const down = Math.round(input.downFraction * 100);
	const pct = (r: number) => (r * 100).toFixed(2).replace(/0$/, "");
	const rate =
		input.rateAsOf !== undefined
			? `${formatRate(input.annualRate)} 30-yr fixed (Freddie Mac, ${formatAsOf(input.rateAsOf)}${isRateStale(input.rateAsOf, input.now) ? " — may be out of date" : ""})`
			: `${formatRate(input.annualRate)} 30-yr fixed`;
	return `Assumes ${down}% down, ${rate}, ${pct(DEFAULT_TAX_RATE)}% property tax, ${pct(DEFAULT_INSURANCE_RATE)}% insurance, ${pct(DEFAULT_MAINTENANCE_RATE)}%/yr upkeep. Not a lending offer.`;
}
