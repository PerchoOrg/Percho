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

	it("carries the server's geoUnitId so signals attach to the right city", () => {
		expect(parseListing(LISTING)?.geoUnitId).toBe("city:decatur-ga");
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

	it("carries the listing's zip so the address row can merge it", () => {
		expect(
			parseListing({
				...LISTING,
				city: "Kennesaw",
				state: "GA",
				zip: "30144",
			})?.zip,
		).toBe("30144");
		expect(parseListing(LISTING)?.zip).toBeUndefined();
	});

	it("omits a non-string zip", () => {
		expect(parseListing({ ...LISTING, zip: 30144 })?.zip).toBeUndefined();
	});

	it("drops a photo count of 1 — the pill must never read '1 Photos'", () => {
		expect(
			parseListing({ ...LISTING, photoCount: 1 })?.photoCount,
		).toBeUndefined();
		expect(
			parseListing({ ...LISTING, photoCount: 0 })?.photoCount,
		).toBeUndefined();
	});

	it("omits a non-numeric or absent photo count", () => {
		expect(
			parseListing({ ...LISTING, photoCount: "18" })?.photoCount,
		).toBeUndefined();
		expect(parseListing(LISTING)?.photoCount).toBeUndefined();
	});

	it("floors a fractional photo count rather than rendering '10.5 Photos'", () => {
		expect(parseListing({ ...LISTING, photoCount: 10.5 })?.photoCount).toBe(10);
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

	it("keeps the lifestyle signals and the glyph the server chose", () => {
		// Owner, 2026-08-15: the card's signals are the server's per-community
		// ones ("Mature trees", "3 parks nearby"), never generic category words.
		// 2026-08-22 they became GLYPHS left of the name, so each now carries
		// the icon picked next to the phrase table on the server.
		const c = parseCommunity({
			...COMMUNITY,
			signals: [
				{ label: "Mature trees", icon: "tree" },
				{ label: "3 parks nearby", icon: "yard" },
			],
		});
		expect(c?.signals).toEqual([
			{ label: "Mature trees", icon: "tree" },
			{ label: "3 parks nearby", icon: "yard" },
		]);
	});

	it("keeps a signal whose phrase has no honest glyph", () => {
		// "Lake nearby" has no match in the 14-glyph subset, so the server sends
		// no icon. The LABEL is the part that carries meaning and must survive —
		// the card simply draws no glyph for it.
		const c = parseCommunity({
			...COMMUNITY,
			signals: [{ label: "Lake nearby" }],
		});
		expect(c?.signals).toEqual([{ label: "Lake nearby" }]);
	});

	it("drops an icon this build's font cannot draw, keeping the label", () => {
		// An icon name now crosses the wire; a name added on the server before
		// the font was re-subset renders as a tofu box on device.
		const c = parseCommunity({
			...COMMUNITY,
			signals: [{ label: "Mature trees", icon: "not-a-real-glyph" }],
		});
		expect(c?.signals).toEqual([{ label: "Mature trees" }]);
	});

	it("omits an empty signal list so the card falls back to reasons/dims", () => {
		expect(
			parseCommunity({ ...COMMUNITY, signals: [] })?.signals,
		).toBeUndefined();
		expect(
			parseCommunity({ ...COMMUNITY, signals: 7 })?.signals,
		).toBeUndefined();
		expect(parseCommunity(COMMUNITY)?.signals).toBeUndefined();
	});

	describe("tour segments (the dashed progress bar)", () => {
		const seg = (name: string, endFraction: number) => ({ name, endFraction });

		it("carries the film's places in play order", () => {
			const c = parseCommunity({
				...COMMUNITY,
				tourSegments: [
					seg("Clubhouse", 0.4),
					seg("Pool", 0.75),
					seg("Park", 1),
				],
			});
			expect(c?.tourSegments).toEqual([
				{ name: "Clubhouse", endFraction: 0.4 },
				{ name: "Pool", endFraction: 0.75 },
				{ name: "Park", endFraction: 1 },
			]);
		});

		it("omits an empty list so the card draws a plain bar", () => {
			expect(parseCommunity(COMMUNITY)?.tourSegments).toBeUndefined();
			expect(
				parseCommunity({ ...COMMUNITY, tourSegments: [] })?.tourSegments,
			).toBeUndefined();
			expect(
				parseCommunity({ ...COMMUNITY, tourSegments: "nope" })?.tourSegments,
			).toBeUndefined();
		});

		/**
		 * A dash's WIDTH is its end minus the previous end, so a sequence that
		 * does not rise produces a zero or negative width — a bar with a gap in
		 * it, or dashes drawn on top of each other. The whole list is rejected
		 * rather than repaired: a plain bar is always right, and a repaired one
		 * would be a guess about where the film's places actually are.
		 */
		it("rejects a sequence that does not rise", () => {
			for (const bad of [
				[seg("a", 0.5), seg("b", 0.5)],
				[seg("a", 0.6), seg("b", 0.3)],
				[seg("a", 0)],
				[seg("a", -0.2)],
			]) {
				expect(
					parseCommunity({ ...COMMUNITY, tourSegments: bad })?.tourSegments,
				).toBeUndefined();
			}
		});

		it("rejects a fraction past the end of the film", () => {
			expect(
				parseCommunity({
					...COMMUNITY,
					tourSegments: [seg("a", 0.5), seg("b", 1.4)],
				})?.tourSegments,
			).toBeUndefined();
		});

		it("rejects an unreadable entry rather than skipping it", () => {
			// Skipping one would silently shift every dash after it.
			expect(
				parseCommunity({
					...COMMUNITY,
					tourSegments: [seg("a", 0.5), null, seg("c", 1)],
				})?.tourSegments,
			).toBeUndefined();
			expect(
				parseCommunity({
					...COMMUNITY,
					tourSegments: [seg("a", 0.5), { name: "b" }],
				})?.tourSegments,
			).toBeUndefined();
		});

		it("keeps a nameless segment — the dash is the point, not the label", () => {
			const c = parseCommunity({
				...COMMUNITY,
				tourSegments: [{ endFraction: 0.5 }, { endFraction: 1 }],
			});
			expect(c?.tourSegments).toEqual([
				{ name: "", endFraction: 0.5 },
				{ name: "", endFraction: 1 },
			]);
		});
	});

	describe("reason tiles (layout E)", () => {
		it("parses reasons, keeping a sub-fact only when the server sent one", () => {
			const c = parseCommunity({
				...COMMUNITY,
				reasons: [
					{ label: "Dog Friendly", icon: "dog" },
					{
						label: "Well Maintained",
						icon: "check",
						fact: "35% owner-occupied",
					},
				],
			});
			expect(c?.reasons).toEqual([
				{ label: "Dog Friendly", icon: "dog" },
				{ label: "Well Maintained", icon: "check", fact: "35% owner-occupied" },
			]);
		});

		it("DROPS a tile whose icon is not in the shipped font", () => {
			// The single failure this validation exists for: an icon name the subset
			// .ttf cannot draw renders a TOFU BOX on device and nowhere else. Off the
			// wire no app-side test can see it, so it is rejected here. The tile is
			// dropped rather than given a default glyph — a wrong picture under a
			// resident's own words is a fabricated claim.
			const c = parseCommunity({
				...COMMUNITY,
				reasons: [
					{ label: "Dog Friendly", icon: "dog" },
					{ label: "Haunted", icon: "ghost" },
					{ label: "Safe", icon: "shieldCheck" },
				],
			});
			expect(c?.reasons?.map((r) => r.label)).toEqual(["Dog Friendly", "Safe"]);
		});

		it("drops a tile with no label, and rejects a non-array", () => {
			expect(
				parseCommunity({ ...COMMUNITY, reasons: [{ icon: "dog" }] })?.reasons,
			).toBeUndefined();
			expect(
				parseCommunity({ ...COMMUNITY, reasons: "Dog Friendly" })?.reasons,
			).toBeUndefined();
		});

		it("omits reasons entirely when the server sent none", () => {
			// The card then falls back to `dims`, then to no tiles. `[]` would be
			// indistinguishable from "three tiles, all empty".
			expect(parseCommunity(COMMUNITY)?.reasons).toBeUndefined();
			expect(
				parseCommunity({ ...COMMUNITY, reasons: [] })?.reasons,
			).toBeUndefined();
		});
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

describe("parseListing — neighborhood scores", () => {
	const SCORES = {
		overall: 8.3,
		dims: [
			{
				key: "safety",
				label: "Safety",
				score: null,
				count: 0,
				reason: "no data source",
			},
			{
				key: "schools",
				label: "Schools",
				score: 8.5,
				count: 11,
				nearestM: 307,
			},
			{ key: "convenience", label: "Convenience", score: 8.1, count: 64 },
			{ key: "potential", label: "Potential", score: null, count: 0 },
		],
	};

	it("keeps a null score as null and never as zero", () => {
		// The entire honesty argument for this panel lives on this line. If a
		// missing source parsed to 0, the card would tell a buyer the
		// neighbourhood scored 0.0 for Safety — a claim we have no data for.
		const card = parseListing({ ...LISTING, scores: SCORES });
		const safety = card?.scores?.dims.find((d) => d.key === "safety");
		expect(safety?.score).toBeNull();
		expect(safety?.score).not.toBe(0);
		expect(card?.scores?.dims.find((d) => d.key === "schools")?.score).toBe(
			8.5,
		);
		expect(card?.scores?.overall).toBe(8.3);
	});

	it("coerces a garbage score to null rather than a number", () => {
		const card = parseListing({
			...LISTING,
			scores: {
				overall: "eight",
				dims: [
					{ key: "schools", label: "Schools", score: "8.5", count: 3 },
					{ key: "safety", label: "Safety", score: Number.NaN, count: 0 },
				],
			},
		});
		// A string "8.5" and a NaN are both "we don't have a number", not 8.5 and
		// not 0.
		expect(
			card?.scores?.dims.find((d) => d.key === "schools")?.score,
		).toBeNull();
		expect(
			card?.scores?.dims.find((d) => d.key === "safety")?.score,
		).toBeNull();
		expect(card?.scores?.overall).toBeNull();
	});

	it("drops unknown dimension keys instead of rendering them", () => {
		const card = parseListing({
			...LISTING,
			scores: {
				overall: 5,
				dims: [
					{ key: "schools", label: "Schools", score: 5, count: 1 },
					{ key: "vibes", label: "Vibes", score: 9.9, count: 1 },
				],
			},
		});
		expect(card?.scores?.dims.map((d) => d.key)).toEqual(["schools"]);
	});

	it("omits scores entirely when absent or malformed", () => {
		expect(parseListing(LISTING)?.scores).toBeUndefined();
		for (const bad of [null, "x", 7, {}, { dims: "no" }, { dims: [] }]) {
			expect(parseListing({ ...LISTING, scores: bad })?.scores).toBeUndefined();
		}
	});

	it("still parses the rest of the card when scores are broken", () => {
		// Scores are decoration; price and address are the card.
		const card = parseListing({ ...LISTING, scores: { dims: [{ nope: 1 }] } });
		expect(card?.priceLabel).toBe("$685K");
		expect(card?.scores).toBeUndefined();
	});
});

/**
 * The wire fields the trade-off bank ranks on.
 *
 * These exist because dropping one is INVISIBLE: the engine's own tests build
 * listings by hand with the fields set, so they keep passing while the parser
 * silently discards what the server actually sends. That is exactly what
 * happened between 2026-08-29 and 08-30 — five matcher questions scored nothing
 * on device while every unit test was green.
 */
describe("structured axes off the wire", () => {
	const wire = (over: Record<string, unknown> = {}) => ({
		pool: {
			geoUnits: [],
			communities: [],
			listings: [
				{
					id: "l1",
					slug: "l1",
					address: "1 Peachtree St",
					priceLabel: "$400,000",
					heroUrl: "https://img/l1.jpg",
					bedBathSqft: "3 bd · 2 ba · 1,800 sqft",
					price: 400000,
					yearBuilt: 2012,
					sqft: 1800,
					beds: 3,
					...over,
				},
			],
		},
		done: false,
	});

	it("keeps yearBuilt, sqft and beds", () => {
		const l = parsePoolResponse(wire()).pool.listings[0];
		expect(l?.yearBuilt).toBe(2012);
		expect(l?.sqft).toBe(1800);
		expect(l?.beds).toBe(3);
	});

	it("omits them rather than defaulting when the row has none", () => {
		const l = parsePoolResponse(
			wire({ yearBuilt: undefined, sqft: undefined, beds: undefined }),
		).pool.listings[0];
		// A missing year must be ABSENT, never 0 — a 0 would sort the home onto
		// the "older" side of every era question.
		expect(l?.yearBuilt).toBeUndefined();
		expect(l?.sqft).toBeUndefined();
		expect(l?.beds).toBeUndefined();
	});

	it("rejects a non-numeric year rather than coercing it", () => {
		const l = parsePoolResponse(wire({ yearBuilt: "2012" })).pool.listings[0];
		expect(l?.yearBuilt).toBeUndefined();
	});
});
