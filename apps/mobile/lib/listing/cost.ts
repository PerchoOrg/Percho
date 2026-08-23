/**
 * CostBlock breakdown (phase119, spec §3.7) — "What you'd actually pay".
 *
 * The big number is the MONTHLY payment, not the list price, split into the
 * four bars the reference shows: principal & interest / property tax /
 * insurance / HOA. P&I reuses `monthly.ts`'s amortisation — one formula, one
 * more caller — and HOA reuses `parseHoaMonthlyUsd` upstream.
 *
 * Tax and insurance are ESTIMATES from stated flat rates, which is a deliberate
 * departure from the old explore page's "we don't have them" line: the spec
 * asks for the full monthly picture under a disclosed assumptions line ending
 * "Not a lending offer." The rates are the assumption label's to disclose —
 * `assumptionLine` below is the only place they are turned into copy, so the
 * label can never disagree with the math.
 */
import { formatRate } from "./assumptions";
import { computeMonthly } from "./monthly";

/** Effective property tax, fraction of price per year (metro-Atlanta typical). */
export const DEFAULT_TAX_RATE = 0.0085;
/** Homeowner's insurance, fraction of price per year. */
export const DEFAULT_INSURANCE_RATE = 0.0035;

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
	return {
		principalInterestUsd: monthly.principalAndInterestUsd,
		taxUsd: monthly.taxMonthlyUsd ?? 0,
		insuranceUsd,
		...(monthly.hoaMonthlyUsd !== undefined
			? { hoaUsd: monthly.hoaMonthlyUsd }
			: {}),
		totalUsd: monthly.totalUsd + insuranceUsd,
	};
}

/** The disclosure line. MUST name every assumption the bars were computed at. */
export function assumptionLine(input: {
	downFraction: number;
	annualRate: number;
}): string {
	const down = Math.round(input.downFraction * 100);
	const tax = (DEFAULT_TAX_RATE * 100).toFixed(2).replace(/0$/, "");
	const ins = (DEFAULT_INSURANCE_RATE * 100).toFixed(2).replace(/0$/, "");
	return `Assumes ${down}% down, ${formatRate(input.annualRate)} 30-yr fixed, ${tax}% property tax, ${ins}% insurance. Not a lending offer.`;
}
