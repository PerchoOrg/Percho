/**
 * `applySwipe` — the pure reducer. Every weighting rule is asserted here.
 *
 * 2026-08-15: ask / challenge / insight are gone, so the reducer now only
 * handles the 4 surviving kinds: geo (area), likes (listing/community) and
 * trade-off (no preference signal).
 */
import { describe, expect, it } from "vitest";
import type {
	AreaCardV3,
	CommunityCardV3,
	ListingCardV3,
	TradeoffCardV3,
} from "./card-types";
import {
	EMPTY_SIGNALS,
	FATIGUE_WINDOW,
	applySkipLayer,
	applySwipe,
	geoSignalFor,
	isLayerFatigued,
	isLayerSuppressed,
} from "./signals";

const city: AreaCardV3 = {
	kind: "area",
	id: "area-decatur",
	unit: {
		id: "city:decatur-ga",
		level: "city",
		name: "Decatur",
		state: "GA",
		centroid: { lat: 33.77, lng: -84.29 },
		communityCount: 12,
		sampleCommunityNames: ["Oakhurst"],
		stats: {},
	},
};

const listing: ListingCardV3 = {
	kind: "listing",
	id: "l-1",
	slug: "l-1",
	address: "1 Main St",
	priceLabel: "$520K",
	bedBathSqft: "3 bd · 2 ba",
	heroUrl: "hero",
	geoUnitId: "city:decatur-ga",
};

const community: CommunityCardV3 = {
	kind: "community",
	id: "c-oakhurst",
	slug: "oakhurst",
	name: "Oakhurst",
	city: "Decatur",
	state: "GA",
	heroUrl: "hero",
	geoUnitId: "city:decatur-ga",
};

const tradeoff: TradeoffCardV3 = {
	kind: "tradeoff",
	id: "to-yard-vs-commute",
	left: { label: "Bigger yard", dim: "outdoors" },
	right: { label: "Shorter commute", dim: "walkable" },
	scope: "life",
};

describe("applySwipe — area is a soft signal, never a filter (§1.7)", () => {
	it("a left swipe records a downweight but keeps the unit present", () => {
		const s = applySwipe(EMPTY_SIGNALS, city, "left");
		const g = geoSignalFor(s, "city:decatur-ga");
		expect(g).toBeDefined();
		expect(g?.left).toBe(1);
		expect(g?.right).toBe(0);
	});

	it("right and left accumulate on the same unit", () => {
		let s = applySwipe(EMPTY_SIGNALS, city, "right");
		s = applySwipe(s, city, "right");
		s = applySwipe(s, city, "left");
		expect(geoSignalFor(s, "city:decatur-ga")).toMatchObject({
			right: 2,
			left: 1,
		});
	});
});

describe("applySwipe — listing likes", () => {
	it("a like records the listing and credits its city", () => {
		const s = applySwipe(EMPTY_SIGNALS, listing, "right");
		expect(s.likedListingIds).toEqual(["l-1"]);
		expect(geoSignalFor(s, "city:decatur-ga")?.right).toBe(1);
	});

	it("a pass removes a prior like", () => {
		let s = applySwipe(EMPTY_SIGNALS, listing, "right");
		s = applySwipe(s, listing, "left");
		expect(s.likedListingIds).toEqual([]);
	});
});

describe("applySwipe — community likes", () => {
	it("a like lands in likedCommunityIds and credits its city", () => {
		const s = applySwipe(EMPTY_SIGNALS, community, "right");
		expect(s.likedCommunityIds).toEqual(["c-oakhurst"]);
		expect(geoSignalFor(s, "city:decatur-ga")?.right).toBe(1);
	});

	it("a later pass moves it out of liked and into passed", () => {
		let s = applySwipe(EMPTY_SIGNALS, community, "right");
		s = applySwipe(s, community, "left");
		expect(s.likedCommunityIds).toEqual([]);
		expect(s.passedCommunityIds).toEqual(["c-oakhurst"]);
	});
});

describe("applySwipe — tradeoff carries no preference signal", () => {
	it("records nothing but the swipe", () => {
		const s = applySwipe(EMPTY_SIGNALS, tradeoff, "right");
		expect(s.likedListingIds).toEqual([]);
		expect(s.likedCommunityIds).toEqual([]);
		expect(s.geo).toEqual([]);
	});
});

describe("layer fatigue (§1.7 — 15 swipes, zero positive)", () => {
	it(`is not fatigued at ${FATIGUE_WINDOW - 1} dry swipes`, () => {
		let s = EMPTY_SIGNALS;
		for (let i = 0; i < FATIGUE_WINDOW - 1; i++)
			s = applySwipe(s, city, "left");
		expect(isLayerFatigued(s, "city")).toBe(false);
	});

	it(`is fatigued on the ${FATIGUE_WINDOW}th`, () => {
		let s = EMPTY_SIGNALS;
		for (let i = 0; i < FATIGUE_WINDOW; i++) s = applySwipe(s, city, "left");
		expect(isLayerFatigued(s, "city")).toBe(true);
		expect(FATIGUE_WINDOW).toBe(15);
	});

	it("a single right swipe anywhere in the window resets the counter", () => {
		let s = EMPTY_SIGNALS;
		for (let i = 0; i < 14; i++) s = applySwipe(s, city, "left");
		s = applySwipe(s, city, "right");
		for (let i = 0; i < 14; i++) s = applySwipe(s, city, "left");
		expect(isLayerFatigued(s, "city")).toBe(false);
	});

	it("fatigue is per-layer — a dry city does not fatigue community", () => {
		let s = EMPTY_SIGNALS;
		for (let i = 0; i < FATIGUE_WINDOW; i++) s = applySwipe(s, city, "left");
		expect(isLayerFatigued(s, "city")).toBe(true);
		expect(isLayerFatigued(s, "community")).toBe(false);
	});

	it("trade-off swipes do not feed a layer streak (§1.7 compensates via them)", () => {
		let s = EMPTY_SIGNALS;
		for (let i = 0; i < 30; i++) s = applySwipe(s, tradeoff, "left");
		expect(isLayerFatigued(s, "city")).toBe(false);
	});
});

describe("skip layer (§1.2 #4)", () => {
	it("suppresses the layer without fatiguing it", () => {
		const s = applySkipLayer(EMPTY_SIGNALS, "zip");
		expect(isLayerSuppressed(s, "zip")).toBe(true);
		expect(isLayerFatigued(s, "zip")).toBe(false);
	});

	it("is idempotent", () => {
		const once = applySkipLayer(EMPTY_SIGNALS, "zip");
		expect(applySkipLayer(once, "zip")).toBe(once);
	});
});

describe("purity", () => {
	it("never mutates the input state", () => {
		const before = structuredClone(EMPTY_SIGNALS);
		applySwipe(EMPTY_SIGNALS, community, "right");
		applySwipe(EMPTY_SIGNALS, tradeoff, "left");
		expect(EMPTY_SIGNALS).toEqual(before);
	});

	it("counts swipes in the session", () => {
		let s = applySwipe(EMPTY_SIGNALS, city, "right");
		s = applySwipe(s, tradeoff, "left");
		expect(s.swipesInStage).toBe(2);
	});
});
