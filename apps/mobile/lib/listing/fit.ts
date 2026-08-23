/**
 * FitCard derivation (phase118, spec §3.4) — "How it fits you", computed
 * LOCALLY from behaviour this device really recorded.
 *
 * There is no server-side preference engine yet (owner decision 2026-08-23:
 * derive locally rather than wait or fake). The inputs are the two honest
 * stores this app has:
 *
 *   - the buyer's SAVED homes (`state/saved.ts` ids → fresh summaries from
 *     `/api/mobile/listings`), for price / space / bedroom comparisons;
 *   - the feed's swipe tallies for this listing's own city
 *     (`SignalState.geo`), for the locality read.
 *
 * ── The iron rule, from the spec ────────────────────────────────────────────
 * Every trade-off row MUST carry a `why` naming the behaviour it was derived
 * from ("6 of your 9 saves are under $450K"). A row whose attribution cannot
 * be computed is NOT RENDERED — 宁可少，不能编. Matches follow the same rule;
 * only rows below the evidence thresholds are dropped, never rounded up.
 *
 * Pure module: no store reads, no fetch, no Date.now(). The screen assembles
 * the inputs; every threshold is testable here.
 */

/** Fewest saves that make "most of your saves…" an honest phrase. */
export const MIN_SAVES = 3;
/** Fewest same-city swipes that make a locality claim. */
export const MIN_CITY_SWIPES = 3;
/** Price within ±this fraction of the saves' median reads as "in your range". */
const PRICE_BAND = 0.08;
/** Sqft beyond ±this fraction of the saves' median is a real difference. */
const SQFT_BAND = 0.1;

export interface FitSaveSummary {
	price?: number;
	sqft?: number;
	beds?: number;
}

export interface FitInput {
	price?: number;
	sqft?: number;
	beds?: number;
	city: string;
	/** Fresh summaries of the buyer's saved homes. */
	saves: readonly FitSaveSummary[];
	/** Listing cards this device has swiped, lifetime. */
	seenListingCount: number;
	/** Swipe tallies for THIS listing's city, when the feed has any. */
	citySignal?: { right: number; left: number };
}

export interface FitItem {
	text: string;
	/** The behavioural attribution. Required on trade-offs by construction. */
	why?: string;
}

export interface FitQuestion {
	/** Telemetry axis, e.g. `price_vs_space`. */
	axis: string;
	/** "About $40K over your usual, for the extra space —" */
	prompt: string;
}

export interface FitResult {
	/** The header's "from N homes you've seen". */
	seenCount: number;
	matches: readonly FitItem[];
	tradeoffs: readonly FitItem[];
	question?: FitQuestion;
}

/** "$470K" / "$1.2M" — the strip format the reference card uses. */
export function compactUsd(value: number): string {
	if (value >= 1_000_000) {
		const m = value / 1_000_000;
		return `$${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
	}
	return `$${Math.round(value / 1000)}K`;
}

function median(values: number[]): number | undefined {
	if (values.length === 0) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 === 1
		? sorted[mid]
		: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

interface Derived {
	matches: FitItem[];
	tradeoffs: FitItem[];
	/** Match nouns for the question's "for …" clause, keyed by axis. */
	matchNoun: Map<string, string>;
	priceOverUsd?: number;
}

function derivePrice(input: FitInput, out: Derived): void {
	if (input.price === undefined) return;
	const prices = input.saves
		.map((s) => s.price)
		.filter((p): p is number => p !== undefined && p > 0);
	if (prices.length < MIN_SAVES) return;
	const med = median(prices) as number;
	const price = input.price;

	if (price >= med * (1 + PRICE_BAND)) {
		const under = prices.filter((p) => p < price).length;
		out.tradeoffs.push({
			text: `${compactUsd(price - med)} above your usual range`,
			why: `${under} of your ${prices.length} saves are under ${compactUsd(price)}`,
		});
		out.priceOverUsd = price - med;
		return;
	}
	if (price <= med * (1 - PRICE_BAND)) {
		const over = prices.filter((p) => p > price).length;
		out.matches.push({
			text: `${compactUsd(med - price)} under your usual range`,
			why: `${over} of your ${prices.length} saves cost more`,
		});
	}
}

function deriveSqft(input: FitInput, out: Derived): void {
	if (input.sqft === undefined) return;
	const sqfts = input.saves
		.map((s) => s.sqft)
		.filter((v): v is number => v !== undefined && v > 0);
	if (sqfts.length < MIN_SAVES) return;
	const med = median(sqfts) as number;
	const sqft = input.sqft;
	const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

	if (sqft >= med * (1 + SQFT_BAND)) {
		const smaller = sqfts.filter((v) => v < sqft).length;
		out.matches.push({
			text: "More space than the homes you save",
			why: `${smaller} of your ${sqfts.length} saves are under ${fmt(sqft)} sqft`,
		});
		out.matchNoun.set("space", "the extra space");
		return;
	}
	if (sqft <= med * (1 - SQFT_BAND)) {
		const bigger = sqfts.filter((v) => v > sqft).length;
		out.tradeoffs.push({
			text: "Smaller than the homes you save",
			why: `${bigger} of your ${sqfts.length} saves are over ${fmt(sqft)} sqft`,
		});
	}
}

function deriveBeds(input: FitInput, out: Derived): void {
	if (input.beds === undefined) return;
	const beds = input.saves
		.map((s) => s.beds)
		.filter((v): v is number => v !== undefined && v > 0);
	if (beds.length < MIN_SAVES) return;
	const med = median(beds) as number;
	const n = input.beds;

	if (n > med) {
		const fewer = beds.filter((v) => v < n).length;
		// "3 of 4" would be a weak claim at threshold; require a real majority.
		if (fewer * 2 <= beds.length) return;
		out.matches.push({
			text: `${n} bedrooms — more than you usually save`,
			why: `${fewer} of your ${beds.length} saves have fewer`,
		});
		out.matchNoun.set("beds", "the extra bedroom");
	}
}

function deriveCity(input: FitInput, out: Derived): void {
	const signal = input.citySignal;
	if (!signal) return;
	const { right, left } = signal;
	if (right >= MIN_CITY_SWIPES && right > left) {
		out.matches.push({
			text: `In ${input.city}, where you keep saying yes`,
			why: `you've swiped right on ${input.city} ${right} times`,
		});
		out.matchNoun.set("city", input.city);
		return;
	}
	if (left >= MIN_CITY_SWIPES && left > right) {
		out.tradeoffs.push({
			text: `In ${input.city}, which you've mostly passed on`,
			why: `you've passed ${input.city} homes ${left} times`,
		});
	}
}

/**
 * The trade-off vote (§3.4 bottom): only when the card can name BOTH sides —
 * a computed price gap and a computed upside. No sides, no question.
 */
function deriveQuestion(out: Derived): FitQuestion | undefined {
	if (out.priceOverUsd === undefined) return undefined;
	for (const axis of ["space", "beds", "city"]) {
		const noun = out.matchNoun.get(axis);
		if (noun) {
			return {
				axis: `price_vs_${axis}`,
				prompt: `About ${compactUsd(out.priceOverUsd)} over your usual, for ${noun} —`,
			};
		}
	}
	return undefined;
}

/**
 * Null when the card cannot be rendered honestly: fewer than two derivable
 * rows, or no match at all (a card that only scolds is not "how it fits you").
 */
export function deriveFit(input: FitInput): FitResult | null {
	const out: Derived = { matches: [], tradeoffs: [], matchNoun: new Map() };
	derivePrice(input, out);
	deriveSqft(input, out);
	deriveBeds(input, out);
	deriveCity(input, out);

	if (out.matches.length === 0) return null;
	if (out.matches.length + out.tradeoffs.length < 2) return null;

	const question = deriveQuestion(out);
	return {
		// Saves are a subset of seen homes; the max keeps the header honest even
		// if the swipe store predates the saved store on this install.
		seenCount: Math.max(input.seenListingCount, input.saves.length),
		matches: out.matches.slice(0, 3),
		tradeoffs: out.tradeoffs.slice(0, 3),
		...(question ? { question } : {}),
	};
}
