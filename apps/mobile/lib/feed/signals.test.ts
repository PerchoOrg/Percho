/**
 * `applySwipe` — the pure reducer. Every §1.7 weighting rule is asserted here,
 * because these are the numbers the funnel gates read.
 */
import { describe, expect, it } from "vitest";
import type {
	AreaCardV3,
	CommunityCardV3,
	InsightCardV3,
	ListingCardV3,
	TradeoffCardV3,
} from "./card-types";
import {
	EMPTY_SIGNALS,
	FATIGUE_WINDOW,
	TEASE_WEIGHT,
	applyInsightUnsure,
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

const teaseListing: ListingCardV3 = {
	kind: "listing",
	id: "l-tease",
	slug: "l-tease",
	address: "1 Main St",
	priceLabel: "$520K",
	bedBathSqft: "3 bd · 2 ba",
	heroUrl: "hero",
	geoUnitId: "city:decatur-ga",
	dims: ["trails"],
	tease: true,
};

const fullListing: ListingCardV3 = {
	...teaseListing,
	id: "l-full",
	slug: "l-full",
	tease: undefined,
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
	dims: ["walkable"],
};

const tradeoff: TradeoffCardV3 = {
	kind: "tradeoff",
	id: "to-yard-vs-commute",
	left: { label: "Bigger yard", dim: "outdoors" },
	right: { label: "Shorter commute", dim: "walkable" },
	scope: "life",
};

const insight: InsightCardV3 = {
	kind: "insight",
	id: "in-trails",
	dim: "trails",
	text: "You gravitate toward trail-access homes.",
	evidence: "6 of your last 8 likes back onto a greenway.",
};

describe("applySwipe — tease listing weighting (§1.7)", () => {
	it("credits the geo unit at 0.5x on a right swipe", () => {
		const s = applySwipe(EMPTY_SIGNALS, teaseListing, "right");
		expect(geoSignalFor(s, "city:decatur-ga")?.right).toBe(TEASE_WEIGHT);
		expect(TEASE_WEIGHT).toBe(0.5);
	});

	it("credits the dim at 0.5x too", () => {
		const s = applySwipe(EMPTY_SIGNALS, teaseListing, "right");
		expect(s.dims.trails).toBe(0.5);
	});

	it("a full listing credits at 1x — the halving is tease-only", () => {
		const s = applySwipe(EMPTY_SIGNALS, fullListing, "right");
		expect(geoSignalFor(s, "city:decatur-ga")?.right).toBe(1);
		expect(s.dims.trails).toBe(1);
	});

	it("a left tease swipe is an equally weak negative (§1.7)", () => {
		const s = applySwipe(EMPTY_SIGNALS, teaseListing, "left");
		expect(geoSignalFor(s, "city:decatur-ga")?.left).toBe(TEASE_WEIGHT);
		expect(s.likedListingIds).toEqual([]);
	});

	it("a liked tease is still recorded as a liked listing", () => {
		const s = applySwipe(EMPTY_SIGNALS, teaseListing, "right");
		expect(s.likedListingIds).toEqual(["l-tease"]);
	});
});

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

describe("applySwipe — tradeoff / ask records (§1.6)", () => {
	it("records (dim_left, dim_right, chosen)", () => {
		const s = applySwipe(EMPTY_SIGNALS, tradeoff, "right");
		expect(s.tradeoffs).toEqual([
			{
				cardId: "to-yard-vs-commute",
				dimLeft: "outdoors",
				dimRight: "walkable",
				chosen: "walkable",
			},
		]);
	});

	it("boosts the chosen dim and softly downweights the discarded one", () => {
		const s = applySwipe(EMPTY_SIGNALS, tradeoff, "left");
		expect(s.dims.outdoors).toBe(1);
		expect(s.dims.walkable).toBe(-0.5);
	});

	it("a yes-no ask records only on the affirmative side", () => {
		const ask = {
			kind: "ask" as const,
			id: "ask-intent",
			layer: "purpose" as const,
			q: "First home?",
			choice: {
				form: "yes-no" as const,
				affirm: { type: "intent" as const, value: "primary" },
			},
		};
		expect(applySwipe(EMPTY_SIGNALS, ask, "right").intent).toBe("primary");
		expect(applySwipe(EMPTY_SIGNALS, ask, "left").intent).toBeUndefined();
	});

	it("an either-or ask records on both sides", () => {
		const ask = {
			kind: "ask" as const,
			id: "ask-budget",
			layer: "life" as const,
			q: "Where does your budget land?",
			choice: {
				form: "either-or" as const,
				left: {
					label: "Under $500K",
					record: { type: "budget" as const, band: { maxUsd: 500_000 } },
				},
				right: {
					label: "Over $500K",
					record: { type: "budget" as const, band: { minUsd: 500_000 } },
				},
			},
		};
		expect(applySwipe(EMPTY_SIGNALS, ask, "left").budget).toEqual({
			maxUsd: 500_000,
		});
		expect(applySwipe(EMPTY_SIGNALS, ask, "right").budget).toEqual({
			minUsd: 500_000,
		});
	});
});

describe("applySwipe — insight (§1.6)", () => {
	it("agree boosts the dim and marks it agreed", () => {
		const s = applySwipe(EMPTY_SIGNALS, insight, "right");
		expect(s.insightAgreed).toEqual(["trails"]);
		expect(s.dims.trails).toBe(1);
	});

	it("disagree downweights the evidence chain", () => {
		const s = applySwipe(EMPTY_SIGNALS, insight, "left");
		expect(s.insightRejected).toEqual(["trails"]);
		expect(s.dims.trails).toBe(-1);
	});

	it('"Not sure" records nothing at all', () => {
		const before = applySwipe(EMPTY_SIGNALS, insight, "right");
		expect(applyInsightUnsure(before, insight)).toBe(before);
		expect(applyInsightUnsure(EMPTY_SIGNALS, insight)).toEqual(EMPTY_SIGNALS);
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
		expect(isLayerFatigued(s, "life")).toBe(false);
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

	it("counts swipes in the current stage", () => {
		let s = applySwipe(EMPTY_SIGNALS, city, "right");
		s = applySwipe(s, tradeoff, "left");
		expect(s.swipesInStage).toBe(2);
	});
});
