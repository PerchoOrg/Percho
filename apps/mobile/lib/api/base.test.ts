import { describe, expect, it } from "vitest";
import { LISTINGS_IN_APP } from "../listings-in-app";
import { feedPoolUrl, mapUrl, searchUrl } from "./base";

/**
 * The communities-only build asks the server for no listings at all — the
 * server-side half of `lib/listings-in-app.ts`. Hiding listing cards on the
 * phone alone would still download listing rows and listing photos (the
 * trade-off doors were built from them).
 */
describe("the listings flag on listing-bearing requests", () => {
	const flag = (url: string) => new URL(url).searchParams.get("listings");
	const expected = LISTINGS_IN_APP ? null : "0";

	it("rides on the feed pool request", () => {
		expect(flag(feedPoolUrl({ stage: 4, offset: 0, limit: 12 }))).toBe(
			expected,
		);
	});

	it("rides on text search, after the encoded query", () => {
		const url = searchUrl("oak & pine");
		expect(new URL(url).searchParams.get("q")).toBe("oak & pine");
		expect(flag(url)).toBe(expected);
	});

	it("rides on the map viewport request", () => {
		expect(
			flag(
				mapUrl({ minLat: 33.6, maxLat: 34.1, minLng: -84.6, maxLng: -84.1 }),
			),
		).toBe(expected);
	});
});
