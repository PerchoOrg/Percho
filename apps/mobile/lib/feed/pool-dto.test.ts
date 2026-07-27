/**
 * Wire → engine parsing. The server hand-types its DTOs (no generated contract
 * binds the two sides), so this boundary is where a malformed or partial row must
 * be caught. Every test below asserts the same rule from a different angle: an
 * incomplete row is DROPPED, never defaulted into a card that shows a fabricated
 * value — an empty price, a (0,0) centroid, a median with no sample size.
 */
import { describe, expect, it } from "vitest";
import {
	parseCommunity,
	parseGeoUnit,
	parseListing,
	parsePoolResponse,
} from "./pool-dto";

const UNIT = {
	id: "city:decatur-ga",
	level: "city",
	name: "Decatur",
	state: "GA",
	centroid: { lat: 33.77, lng: -84.29 },
	heroUrl: "https://example.com/hero.jpg",
	communityCount: 12,
	sampleCommunityNames: ["Oakhurst", "Winnona Park"],
	stats: {
		medianListPrice: { value: 594450, sampleSize: 52 },
		activeListings: 52,
	},
};

const LISTING = {
	id: "l1",
	slug: "12-waterside-ct",
	address: "12 Waterside Ct",
	priceLabel: "$685K",
	price: 685_000,
	bedBathSqft: "4 bd · 3 ba",
	heroUrl: "https://example.com/l1.jpg",
	geoUnitId: "city:decatur-ga",
};

const COMMUNITY = {
	id: "c1",
	slug: "oakhurst",
	name: "Oakhurst",
	city: "Decatur",
	state: "GA",
	heroUrl: "https://example.com/c1.jpg",
};

describe("parseGeoUnit", () => {
	it("parses a full unit", () => {
		const u = parseGeoUnit(UNIT);
		expect(u?.id).toBe("city:decatur-ga");
		expect(u?.level).toBe("city");
		expect(u?.centroid).toEqual({ lat: 33.77, lng: -84.29 });
		expect(u?.stats.medianListPrice).toEqual({ value: 594450, sampleSize: 52 });
	});

	it("drops a unit with no centroid rather than placing it at (0,0)", () => {
		expect(parseGeoUnit({ ...UNIT, centroid: null })).toBeNull();
		expect(parseGeoUnit({ ...UNIT, centroid: { lat: 33.7 } })).toBeNull();
	});

	it("drops a unit missing an identity field", () => {
		expect(parseGeoUnit({ ...UNIT, id: "" })).toBeNull();
		expect(parseGeoUnit({ ...UNIT, name: undefined })).toBeNull();
		expect(parseGeoUnit({ ...UNIT, state: null })).toBeNull();
	});

	it("rejects a level outside the geo hierarchy", () => {
		// "community" is deliberately NOT a GeoUnit level — communities are their
		// own table. Accepting it here would put one in the geo narrowing chain.
		expect(parseGeoUnit({ ...UNIT, level: "community" })).toBeNull();
		expect(parseGeoUnit({ ...UNIT, level: "neighborhood" })).toBeNull();
	});

	it("drops a median that arrives without its sample size", () => {
		const u = parseGeoUnit({
			...UNIT,
			stats: { medianListPrice: { value: 500_000 } },
		});
		expect(u?.stats.medianListPrice).toBeUndefined();
	});

	it("drops a zero active-listing count rather than rendering '0'", () => {
		const u = parseGeoUnit({ ...UNIT, stats: { activeListings: 0 } });
		expect(u?.stats).toEqual({});
	});

	it("yields empty stats when the server sent none", () => {
		expect(parseGeoUnit({ ...UNIT, stats: undefined })?.stats).toEqual({});
	});

	it("keeps at most 3 sample names", () => {
		const u = parseGeoUnit({
			...UNIT,
			sampleCommunityNames: ["a", "b", "c", "d", "e"],
		});
		expect(u?.sampleCommunityNames).toHaveLength(3);
	});
});

describe("parseListing", () => {
	it("parses a full listing", () => {
		const l = parseListing(LISTING);
		expect(l?.kind).toBe("listing");
		expect(l?.priceLabel).toBe("$685K");
		expect(l?.geoUnitId).toBe("city:decatur-ga");
	});

	it("drops a listing with no price label — a blank card is worse than none", () => {
		expect(parseListing({ ...LISTING, priceLabel: "" })).toBeNull();
	});

	it("drops a listing with no hero image", () => {
		expect(parseListing({ ...LISTING, heroUrl: undefined })).toBeNull();
	});

	it("carries the server's gate flags verbatim", () => {
		expect(parseListing({ ...LISTING, tease: true })?.tease).toBe(true);
		expect(parseListing({ ...LISTING, preview: true })?.preview).toBe(true);
		expect(parseListing(LISTING)?.tease).toBeUndefined();
	});

	it("ignores dims the shared vocabulary does not define", () => {
		const l = parseListing({ ...LISTING, dims: ["schools", "not_a_dim", 7] });
		expect(l?.dims).toEqual(["schools"]);
	});

	it("omits a non-numeric match score instead of coercing it", () => {
		expect(
			parseListing({ ...LISTING, matchScore: "92" })?.matchScore,
		).toBeUndefined();
	});
});

describe("parseCommunity", () => {
	it("parses a full community", () => {
		expect(parseCommunity(COMMUNITY)?.name).toBe("Oakhurst");
	});

	it("drops a community missing its place", () => {
		expect(parseCommunity({ ...COMMUNITY, city: "" })).toBeNull();
		expect(parseCommunity({ ...COMMUNITY, state: null })).toBeNull();
	});

	it("omits an empty pill list rather than carrying []", () => {
		expect(parseCommunity(COMMUNITY)?.pills).toBeUndefined();
	});
});

describe("parsePoolResponse", () => {
	it("parses a full page and reports done", () => {
		const page = parsePoolResponse({
			done: true,
			pool: { geoUnits: [UNIT], listings: [LISTING], communities: [COMMUNITY] },
		});
		expect(page.pool.geoUnits).toHaveLength(1);
		expect(page.pool.listings).toHaveLength(1);
		expect(page.pool.communities).toHaveLength(1);
		expect(page.done).toBe(true);
	});

	it("indexes the REAL price for the §1.6 challenge card", () => {
		const page = parsePoolResponse({ pool: { listings: [LISTING] } });
		// The label rounds ($685K); the challenge card must teach the real number.
		expect(page.pool.listingPrices?.l1).toBe(685_000);
	});

	it("leaves a priceless listing out of the challenge index", () => {
		const page = parsePoolResponse({
			pool: { listings: [{ ...LISTING, price: undefined }] },
		});
		expect(page.pool.listingPrices?.l1).toBeUndefined();
		// The listing itself still shows — it just cannot be a challenge subject.
		expect(page.pool.listings).toHaveLength(1);
	});

	it("keeps the good rows and drops only the bad ones", () => {
		const page = parsePoolResponse({
			pool: {
				geoUnits: [UNIT, { ...UNIT, id: "city:x", centroid: null }],
				listings: [LISTING, { ...LISTING, id: "l2", heroUrl: "" }],
			},
		});
		expect(page.pool.geoUnits).toHaveLength(1);
		expect(page.pool.listings).toHaveLength(1);
	});

	it("treats a malformed body as an empty exhausted page, never a throw", () => {
		// A crash here would land mid-swipe. §1.9 has a terminal card for "nothing
		// to show"; it has no state for "the parser exploded".
		for (const body of [null, undefined, "nope", 42, {}, { pool: "x" }]) {
			const page = parsePoolResponse(body);
			expect(page.pool.geoUnits).toEqual([]);
			expect(page.pool.listings).toEqual([]);
			expect(page.done).toBe(true);
		}
	});

	it("reports done=false when the server says there is more", () => {
		expect(parsePoolResponse({ done: false, pool: {} }).done).toBe(false);
	});
});
