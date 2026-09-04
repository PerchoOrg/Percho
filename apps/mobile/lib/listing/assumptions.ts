/**
 * Mortgage-rate assumption for the cost block (§2.1 #4, §2.4 #3).
 *
 * The rate is now a LIVE figure: `GET /api/mobile/rates` serves Freddie Mac's
 * weekly PMMS average (phase D, 2026-09-04). This module keeps the last-known
 * figure as a fallback so the block still renders offline or when the feed is
 * down — but the fallback is labelled with its date rather than passed off as
 * current, which is the whole reason `RATE_AS_OF` exists. `isRateStale()`
 * lets the disclosure line say "rate as of <date>" once a figure is older
 * than a month and a half.
 *
 * MAINTENANCE: bump the two constants whenever you touch this file; the
 * Freddie Mac CSV the server reads is the source of truth.
 */

/** 30-yr fixed, Freddie Mac Primary Mortgage Market Survey — fallback only. */
export const DEFAULT_ANNUAL_RATE = 0.0671;

/** The survey week the fallback figure is from. ISO date, UTC. */
export const RATE_AS_OF = "2026-09-03";

/** Beyond this the figure is too old to present without a caveat. */
const STALE_AFTER_DAYS = 45;

export function isRateStale(
	asOf: string = RATE_AS_OF,
	now: Date = new Date(),
): boolean {
	const stamp = new Date(`${asOf}T00:00:00Z`).getTime();
	const days = (now.getTime() - stamp) / 86_400_000;
	return days > STALE_AFTER_DAYS;
}

/** "6.5%" / "6.71%" — how the rate is printed beside the payment. */
export function formatRate(rate: number): string {
	const pct = rate * 100;
	return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2).replace(/0$/, "")}%`;
}

/** "Sep 3" — the survey week, short enough for a disclosure line. */
export function formatAsOf(asOf: string): string {
	const d = new Date(`${asOf}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return asOf;
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}
