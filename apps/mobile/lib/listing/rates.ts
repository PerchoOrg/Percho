/**
 * Live mortgage rate (phase D) — one fetch per app run, shared by every
 * screen that prices a home (listing cost block, Saved compare).
 *
 * Resolution: `/api/mobile/rates` → the module fallback in `assumptions.ts`.
 * Either way the caller gets an `asOf` date to disclose. `live` says which.
 */
import { useEffect, useState } from "react";
import { ratesUrl } from "../api/base";
import { DEFAULT_ANNUAL_RATE, RATE_AS_OF } from "./assumptions";

export interface RateFigure {
	/** Annual fraction, 30-yr fixed. */
	annualRate: number;
	/** ISO date of the survey week. */
	asOf: string;
	/** False while on the hardcoded fallback. */
	live: boolean;
}

export const FALLBACK_RATE: RateFigure = {
	annualRate: DEFAULT_ANNUAL_RATE,
	asOf: RATE_AS_OF,
	live: false,
};

let cached: RateFigure | null = null;
let inflight: Promise<RateFigure> | null = null;

function parseRates(body: unknown): RateFigure | null {
	if (typeof body !== "object" || body === null) return null;
	const { rate30, asOf } = body as { rate30?: unknown; asOf?: unknown };
	if (
		typeof rate30 !== "number" ||
		!Number.isFinite(rate30) ||
		rate30 <= 0 ||
		rate30 > 0.3 ||
		typeof asOf !== "string" ||
		!/^\d{4}-\d{2}-\d{2}$/.test(asOf)
	) {
		return null;
	}
	return { annualRate: rate30, asOf, live: true };
}

/** Resolves to the live figure, or the fallback on any failure. Never throws. */
export function loadRates(
	fetchImpl: typeof fetch = fetch,
): Promise<RateFigure> {
	if (cached) return Promise.resolve(cached);
	if (inflight) return inflight;
	inflight = fetchImpl(ratesUrl())
		.then(async (res) => (res.ok ? parseRates(await res.json()) : null))
		.catch(() => null)
		.then((figure) => {
			inflight = null;
			if (figure) cached = figure;
			return figure ?? FALLBACK_RATE;
		});
	return inflight;
}

/** Test seam. */
export function resetRatesCache(): void {
	cached = null;
	inflight = null;
}

/** Fallback immediately, live figure once it lands. */
export function useRates(): RateFigure {
	const [figure, setFigure] = useState<RateFigure>(cached ?? FALLBACK_RATE);
	useEffect(() => {
		let alive = true;
		void loadRates().then((f) => {
			if (alive) setFigure(f);
		});
		return () => {
			alive = false;
		};
	}, []);
	return figure;
}
