import { beforeEach, describe, expect, it } from "vitest";
import { FALLBACK_RATE, loadRates, resetRatesCache } from "./rates";

type FetchLike = typeof fetch;

function respond(body: unknown, calls?: { n: number }): FetchLike {
	const impl = () => {
		if (calls) calls.n++;
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve(body),
		} as Response);
	};
	return impl as unknown as FetchLike;
}

describe("loadRates", () => {
	beforeEach(() => resetRatesCache());

	it("returns the live figure and caches it", async () => {
		const calls = { n: 0 };
		const f = respond({ rate30: 0.0671, asOf: "2026-09-03" }, calls);
		const a = await loadRates(f);
		const b = await loadRates(f);
		expect(a).toEqual({ annualRate: 0.0671, asOf: "2026-09-03", live: true });
		expect(b).toBe(a);
		expect(calls.n).toBe(1);
	});

	it("falls back on a network error, and retries next time", async () => {
		const bad = (() =>
			Promise.reject(new Error("offline"))) as unknown as FetchLike;
		expect(await loadRates(bad)).toBe(FALLBACK_RATE);
		const good = respond({ rate30: 0.065, asOf: "2026-09-10" });
		expect((await loadRates(good)).live).toBe(true);
	});

	it("falls back on a malformed body", async () => {
		expect(
			await loadRates(respond({ rate30: "6.7", asOf: "2026-09-03" })),
		).toBe(FALLBACK_RATE);
		expect(await loadRates(respond({ rate30: 0.9, asOf: "2026-09-03" }))).toBe(
			FALLBACK_RATE,
		);
	});
});
