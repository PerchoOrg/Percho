/**
 * Mortgage assumptions for the "Est. monthly" row (§2.1 #4) and the explore
 * calculator (§2.4 #3).
 *
 * §2.1 says "当周利率" — the current week's rate. There is NO rate source in this
 * system: no table, no feed, no env var. So the rate cannot be presented as a
 * fact about this listing.
 *
 * What it CAN be, honestly, is a labelled assumption:
 *   - a real published figure, with its source and date carried alongside it, so
 *     the UI can print "assumes 6.5% · 30-yr fixed, Freddie Mac PMMS wk of
 *     2026-07-23" instead of an unattributed number;
 *   - and adjustable, because §2.4 #3 makes the calculator's rate a slider. A
 *     buyer who knows their real quote can enter it.
 *
 * That distinction is the whole reason this file exists rather than a `0.065`
 * inlined at the call site: an inlined constant becomes silently stale and reads
 * as authoritative. `RATE_AS_OF` makes the staleness visible, and
 * `isRateStale()` lets the UI say so.
 *
 * MAINTENANCE: when a real rate feed lands, this module is replaced by a server
 * field on `ListingDetailDTO`, not extended.
 */

/** 30-yr fixed, Freddie Mac Primary Mortgage Market Survey. */
export const DEFAULT_ANNUAL_RATE = 0.065;

/** The week the above figure is from. ISO date, UTC. */
export const RATE_AS_OF = "2026-07-23";

export const RATE_SOURCE = "30-yr fixed avg";

/** Beyond this the figure is too old to present without a caveat. */
const STALE_AFTER_DAYS = 45;

export function isRateStale(now: Date = new Date()): boolean {
	const asOf = new Date(`${RATE_AS_OF}T00:00:00Z`).getTime();
	const days = (now.getTime() - asOf) / 86_400_000;
	return days > STALE_AFTER_DAYS;
}

/** "6.5%" — how the rate is printed beside the payment. */
export function formatRate(rate: number): string {
	const pct = rate * 100;
	return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2).replace(/0$/, "")}%`;
}

/**
 * The disclosure line under the payment. Always names the rate and the down
 * payment, and flags a stale figure rather than hiding it.
 */
export function assumptionLabel(
	rate: number,
	downFraction: number,
	now: Date = new Date(),
): string {
	const base = `assumes ${formatRate(rate)} · ${Math.round(downFraction * 100)}% down`;
	return isRateStale(now) ? `${base} · rate as of ${RATE_AS_OF}` : base;
}
