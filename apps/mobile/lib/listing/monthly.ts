/**
 * Monthly payment — the arithmetic behind the data face's "Est. monthly" row
 * (`02-listing.md` §2.1 #4) and the explore page's adjustable calculator
 * (§2.4 #3).
 *
 * Pure and shared so the two can never disagree: the row is the calculator's
 * output at its default inputs, not a second formula that happens to look close.
 * (Task-1 shipped a bug of exactly that shape — two places computing one quota
 * with different arithmetic — so this is deliberate.)
 *
 * SCOPE: principal + interest, plus any real HOA and tax figures the caller
 * passes. It does NOT estimate insurance, PMI, or tax from a rate-of-thumb.
 * `_MASTER.md` forbids a fabricated stat even as a placeholder, and a payment
 * that silently includes a guessed $180/mo of insurance is exactly that. What
 * the buyer sees is what we actually know, and `includes` says what that was.
 */

/** §2.1 #4: "default 20% down". */
export const DEFAULT_DOWN_FRACTION = 0.2;

/** Standard US fixed term. The calculator exposes it; the row uses this. */
export const DEFAULT_TERM_YEARS = 30;

export interface MonthlyInput {
	priceUsd: number;
	/** 0–1. Defaults to §2.1's 20%. */
	downFraction?: number;
	/**
	 * Annual nominal rate as a fraction (0.065 = 6.5%). REQUIRED and never
	 * defaulted: the spec says "current week's rate", so a hardcoded fallback
	 * would be a fabricated number with a real number's authority.
	 */
	annualRate: number;
	termYears?: number;
	/** Real monthly HOA, when the listing carries one. Omit when unknown. */
	hoaMonthlyUsd?: number;
	/** Real annual property tax, when known. Omit when unknown. */
	annualTaxUsd?: number;
}

export interface MonthlyBreakdown {
	principalAndInterestUsd: number;
	hoaMonthlyUsd?: number;
	taxMonthlyUsd?: number;
	totalUsd: number;
	loanAmountUsd: number;
	downPaymentUsd: number;
	/** Which components are real, for the "what's included" disclosure. */
	includes: readonly ("principal_interest" | "hoa" | "tax")[];
}

/**
 * Standard amortisation. The zero-rate branch is not a rounding edge — it is the
 * limit of the formula as r → 0 (the `1 - (1+r)^-n` denominator collapses), and
 * without it a 0% input divides by zero and yields NaN, which would render as
 * "$NaN/mo" on a real card.
 */
function amortise(
	loanUsd: number,
	annualRate: number,
	termYears: number,
): number {
	if (loanUsd <= 0) return 0;
	const n = Math.round(termYears * 12);
	if (n <= 0) return loanUsd;
	const r = annualRate / 12;
	if (r === 0) return loanUsd / n;
	return (loanUsd * r) / (1 - (1 + r) ** -n);
}

export function computeMonthly(input: MonthlyInput): MonthlyBreakdown {
	const {
		priceUsd,
		downFraction = DEFAULT_DOWN_FRACTION,
		annualRate,
		termYears = DEFAULT_TERM_YEARS,
		hoaMonthlyUsd,
		annualTaxUsd,
	} = input;

	const clampedDown = Math.min(Math.max(downFraction, 0), 1);
	const downPaymentUsd = Math.round(priceUsd * clampedDown);
	const loanAmountUsd = Math.max(priceUsd - downPaymentUsd, 0);

	const principalAndInterestUsd = Math.round(
		amortise(loanAmountUsd, annualRate, termYears),
	);

	const includes: ("principal_interest" | "hoa" | "tax")[] = [
		"principal_interest",
	];
	let totalUsd = principalAndInterestUsd;

	// Only fold in what the caller actually knows. `undefined` stays undefined
	// all the way to the UI, which renders the component as absent.
	let taxMonthlyUsd: number | undefined;
	if (annualTaxUsd !== undefined && annualTaxUsd > 0) {
		taxMonthlyUsd = Math.round(annualTaxUsd / 12);
		totalUsd += taxMonthlyUsd;
		includes.push("tax");
	}
	if (hoaMonthlyUsd !== undefined && hoaMonthlyUsd > 0) {
		totalUsd += Math.round(hoaMonthlyUsd);
		includes.push("hoa");
	}

	return {
		principalAndInterestUsd,
		...(hoaMonthlyUsd !== undefined && hoaMonthlyUsd > 0
			? { hoaMonthlyUsd: Math.round(hoaMonthlyUsd) }
			: {}),
		...(taxMonthlyUsd !== undefined ? { taxMonthlyUsd } : {}),
		totalUsd,
		loanAmountUsd,
		downPaymentUsd,
		includes,
	};
}

/**
 * `"$3,890"`. No cents: this is a planning number shown at 15pt, and cents
 * imply a precision the inputs (a weekly average rate) do not have.
 */
export function formatUsd(value: number): string {
	return `$${Math.round(value).toLocaleString("en-US")}`;
}

/**
 * Parses `listings.hoa`, which is **text** in the schema, not a number — real
 * values in production look like "$85/mo" or "250". Returns undefined when
 * nothing numeric is in there, so an unparseable string renders as absent rather
 * than as $0/mo (which would read as "this home has no HOA" — a false claim).
 *
 * Annual values are NOT inferred from magnitude: "1200" could be $1,200/yr or a
 * $1,200/mo luxury-tower fee, and guessing would silently 12× the payment. Only
 * an explicit `/yr`-style marker converts.
 */
export function parseHoaMonthlyUsd(
	raw: string | null | undefined,
): number | undefined {
	if (!raw) return undefined;
	const text = raw.toLowerCase();
	const match = text.match(/\d[\d,]*(\.\d+)?/);
	if (!match) return undefined;
	const value = Number.parseFloat(match[0].replace(/,/g, ""));
	if (!Number.isFinite(value) || value <= 0) return undefined;
	const isAnnual = /\/\s*(yr|year|annum)|annual|yearly|per year/.test(text);
	return isAnnual ? Math.round(value / 12) : Math.round(value);
}
