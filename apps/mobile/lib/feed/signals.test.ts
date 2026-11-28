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
	DWELL_SATURATION_MS,
	EMPTY_SIGNALS,
	FATIGUE_WINDOW,
	INTEREST_WEIGHT,
	applyDimRemoval,
	applyInterest,
	applyRecorded,
	applyScope,
	applySkipLayer,
	applySwipe,
	geoSignalFor,
	isLayerFatigued,
	isLayerSuppressed,
	revertSwipe,
	swipeWeight,
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
	theme: "layout",
	axis: "test",
	prompt: "Which one?",
	id: "to-yard-vs-commute",
	left: { label: "Bigger yard", support: "Bigger yard", dim: "outdoors" },
	right: {
		label: "Shorter commute",
		support: "Shorter commute",
		dim: "walkable",
	},
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

describe("applySwipe — tradeoff records preference dims (§1.6)", () => {
	it("boosts the chosen dim and softly downweights the discarded one", () => {
		const s = applySwipe(EMPTY_SIGNALS, tradeoff, "right");
		expect(s.dims.walkable).toBe(1);
		expect(s.dims.outdoors).toBe(-0.5);
	});

	it("does not touch geo or community lists", () => {
		const s = applySwipe(EMPTY_SIGNALS, tradeoff, "left");
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

describe("tradeoffCount", () => {
	it("counts answered trade-offs regardless of direction", () => {
		let s = applySwipe(EMPTY_SIGNALS, tradeoff, "right");
		s = applySwipe(s, tradeoff, "left");
		expect(s.tradeoffCount).toBe(2);
	});

	it("survives state persisted before the field existed", () => {
		const legacy = { ...EMPTY_SIGNALS };
		// biome-ignore lint/performance/noDelete: simulating a rehydrated pre-field snapshot is the test
		delete (legacy as Record<string, unknown>).tradeoffCount;
		expect(applySwipe(legacy, tradeoff, "right").tradeoffCount).toBe(1);
	});

	it("does not move on non-tradeoff swipes", () => {
		const s = applySwipe(EMPTY_SIGNALS, listing, "right");
		expect(s.tradeoffCount ?? 0).toBe(0);
	});
});

describe("applyDimRemoval — the You tab's 'No, remove'", () => {
	it("drops the dim outright", () => {
		const s = applySwipe(EMPTY_SIGNALS, tradeoff, "right");
		expect(s.dims.walkable).toBe(1);
		const corrected = applyDimRemoval(s, "walkable");
		expect("walkable" in corrected.dims).toBe(false);
		// The discarded side's downweight is untouched — it is separate evidence.
		expect(corrected.dims.outdoors).toBe(-0.5);
	});

	it("is a no-op for a dim with no evidence", () => {
		expect(applyDimRemoval(EMPTY_SIGNALS, "quiet")).toBe(EMPTY_SIGNALS);
	});
});

/**
 * phase140 — the explicit scope pick and its inverse, plus "Bring back".
 */
describe("applyScope", () => {
	it("records the pick without touching swipe-derived geo", () => {
		const swiped = applySwipe(EMPTY_SIGNALS, city, "right");
		const next = applyScope(swiped, {
			unitId: "city:duluth-ga",
			name: "Duluth",
		});
		expect(next.scope).toEqual({ unitId: "city:duluth-ga", name: "Duluth" });
		// The observation and the statement are separate facts.
		expect(next.geo).toEqual(swiped.geo);
	});

	it("clears the pick on null, leaving no empty scope object behind", () => {
		const picked = applyScope(EMPTY_SIGNALS, {
			unitId: "city:duluth-ga",
			name: "Duluth",
		});
		const cleared = applyScope(picked, null);
		expect(cleared.scope).toBeUndefined();
		expect("scope" in cleared).toBe(false);
	});
});

describe("revertSwipe", () => {
	const listingCard: ListingCardV3 = {
		kind: "listing",
		id: "listing-1",
		slug: "listing-1",
		address: "1 Main St",
		priceLabel: "$400,000",
		bedBathSqft: "3 bd · 2 ba · 1,500 sqft",
		heroUrl: "https://example.test/1.jpg",
		geoUnitId: "city:duluth-ga",
	};

	it("undoes a right swipe on a listing exactly", () => {
		const after = applySwipe(EMPTY_SIGNALS, listingCard, "right");
		expect(after.likedListingIds).toContain("listing-1");
		const back = revertSwipe(after, {
			id: "listing-1",
			kind: "listing",
			verdict: "right",
			geoUnitId: "city:duluth-ga",
		});
		expect(back.likedListingIds).not.toContain("listing-1");
		// The geo credit the swipe gave is handed back, and the emptied unit
		// leaves no entry to rank on.
		expect(back.geo).toEqual([]);
	});

	it("undoes a left swipe on a community", () => {
		const card: CommunityCardV3 = {
			kind: "community",
			id: "comm-1",
			slug: "comm-1",
			name: "Ashley Crossing",
			city: "Alpharetta",
			state: "GA",
			heroUrl: "https://example.test/c.jpg",
			geoUnitId: "city:alpharetta-ga",
		};
		const after = applySwipe(EMPTY_SIGNALS, card, "left");
		expect(after.passedCommunityIds).toContain("comm-1");
		const back = revertSwipe(after, {
			id: "comm-1",
			kind: "community",
			verdict: "left",
			geoUnitId: "city:alpharetta-ga",
		});
		expect(back.passedCommunityIds).not.toContain("comm-1");
		expect(back.likedCommunityIds).not.toContain("comm-1");
		expect(back.geo).toEqual([]);
	});

	it("leaves another unit's geo weight alone", () => {
		let s = applySwipe(EMPTY_SIGNALS, listingCard, "right");
		s = applySwipe(s, city, "right");
		const back = revertSwipe(s, {
			id: "listing-1",
			kind: "listing",
			verdict: "right",
			geoUnitId: "city:duluth-ga",
		});
		expect(geoSignalFor(back, "city:decatur-ga")?.right).toBe(1);
	});

	it("never drives a counter negative when reverted twice", () => {
		const after = applySwipe(EMPTY_SIGNALS, listingCard, "right");
		const once = revertSwipe(after, {
			id: "listing-1",
			kind: "listing",
			verdict: "right",
			geoUnitId: "city:duluth-ga",
		});
		const twice = revertSwipe(once, {
			id: "listing-1",
			kind: "listing",
			verdict: "right",
			geoUnitId: "city:duluth-ga",
		});
		expect(twice.geo).toEqual([]);
		expect(twice.likedListingIds).toEqual([]);
	});

	it("does not decrement swipesInStage — the swipe still happened", () => {
		const after = applySwipe(EMPTY_SIGNALS, listingCard, "right");
		const back = revertSwipe(after, {
			id: "listing-1",
			kind: "listing",
			verdict: "right",
			geoUnitId: "city:duluth-ga",
		});
		expect(back.swipesInStage).toBe(after.swipesInStage);
	});
});

describe("swipeWeight — attention scales the tally (§1.7)", () => {
	it("no dwell means weight 1 — every legacy call keeps its meaning", () => {
		expect(swipeWeight(undefined)).toBe(1);
		expect(swipeWeight(-50)).toBe(1);
	});

	it("runs linearly from 0.5 (flick) to 2 (saturated)", () => {
		expect(swipeWeight(0)).toBe(0.5);
		expect(swipeWeight(DWELL_SATURATION_MS / 2)).toBe(1.25);
		expect(swipeWeight(DWELL_SATURATION_MS)).toBe(2);
		// Past saturation adds nothing — the buyer went to make coffee.
		expect(swipeWeight(DWELL_SATURATION_MS * 100)).toBe(2);
	});

	it("applySwipe credits the geo tally with the dwell weight", () => {
		const s = applySwipe(EMPTY_SIGNALS, listing, "right", {
			dwellMs: DWELL_SATURATION_MS,
		});
		expect(geoSignalFor(s, "city:decatur-ga")?.right).toBe(2);
	});

	it("a considered pass weighs more than a reflex pass", () => {
		const considered = applySwipe(EMPTY_SIGNALS, listing, "left", {
			dwellMs: DWELL_SATURATION_MS,
		});
		const reflex = applySwipe(EMPTY_SIGNALS, listing, "left", { dwellMs: 0 });
		const c = geoSignalFor(considered, "city:decatur-ga")?.left ?? 0;
		const r = geoSignalFor(reflex, "city:decatur-ga")?.left ?? 0;
		expect(c).toBe(2);
		expect(r).toBe(0.5);
	});

	it("dims bumps stay unweighted — dwell on a question is reading time", () => {
		const s = applySwipe(EMPTY_SIGNALS, tradeoff, "right", {
			dwellMs: DWELL_SATURATION_MS,
		});
		expect(s.dims.walkable).toBe(1);
		expect(s.dims.outdoors).toBe(-0.5);
	});

	it("revertSwipe subtracts the weight the swipe actually added", () => {
		const after = applySwipe(EMPTY_SIGNALS, listing, "right", {
			dwellMs: DWELL_SATURATION_MS,
		});
		const back = revertSwipe(after, {
			id: "l-1",
			kind: "listing",
			verdict: "right",
			geoUnitId: "city:decatur-ga",
			weight: 2,
		});
		expect(back.geo).toEqual([]);
	});
});

describe("applyInterest — a look inside a card, short of a like (phase414)", () => {
	it("credits a city's own unit with half a like", () => {
		const s = applyInterest(EMPTY_SIGNALS, city);
		expect(geoSignalFor(s, "city:decatur-ga")).toMatchObject({
			right: INTEREST_WEIGHT,
			left: 0,
		});
	});

	it("credits the city a community sits in, and likes nothing", () => {
		const s = applyInterest(EMPTY_SIGNALS, community);
		expect(geoSignalFor(s, "city:decatur-ga")?.right).toBe(INTEREST_WEIGHT);
		expect(s.likedCommunityIds).toEqual([]);
	});

	it("is not a swipe: no count, no fatigue streak", () => {
		const s = applyInterest(EMPTY_SIGNALS, community);
		expect(s.swipesInStage).toBe(0);
		expect(s.dryStreak).toEqual({});
	});

	it("adds to what a like already said", () => {
		const liked = applySwipe(EMPTY_SIGNALS, community, "right");
		const s = applyInterest(liked, community);
		expect(geoSignalFor(s, "city:decatur-ga")?.right).toBe(1 + INTEREST_WEIGHT);
	});

	it("leaves a card with no place, and a trade-off, alone", () => {
		const { geoUnitId: _none, ...nowhere } = community;
		expect(applyInterest(EMPTY_SIGNALS, nowhere)).toBe(EMPTY_SIGNALS);
		expect(applyInterest(EMPTY_SIGNALS, tradeoff)).toBe(EMPTY_SIGNALS);
	});
});

describe("applyRecorded — a verdict given away from the deck (phase416)", () => {
	const place = {
		id: "c-oakhurst",
		kind: "community" as const,
		geoUnitId: "city:decatur-ga",
	};

	it("writes what a swipe on the card would: the list and the place's tally", () => {
		const fromCard = applySwipe(EMPTY_SIGNALS, community, "right");
		const fromPlace = applyRecorded(EMPTY_SIGNALS, {
			...place,
			verdict: "right",
		});
		expect(fromPlace.likedCommunityIds).toEqual(fromCard.likedCommunityIds);
		expect(fromPlace.geo).toEqual(fromCard.geo);
	});

	it("is not a swipe: no count, no fatigue streak", () => {
		const s = applyRecorded(EMPTY_SIGNALS, { ...place, verdict: "left" });
		expect(s.passedCommunityIds).toEqual(["c-oakhurst"]);
		expect(s.swipesInStage).toBe(0);
		expect(s.dryStreak).toEqual({});
	});

	it("moves a place from liked to passed, never both", () => {
		const liked = applyRecorded(EMPTY_SIGNALS, { ...place, verdict: "right" });
		const s = applyRecorded(liked, { ...place, verdict: "left" });
		expect(s.likedCommunityIds).toEqual([]);
		expect(s.passedCommunityIds).toEqual(["c-oakhurst"]);
	});

	it("is undone exactly by revertSwipe", () => {
		for (const verdict of ["left", "right"] as const) {
			const swipe = { ...place, verdict, weight: 1.5 };
			const back = revertSwipe(applyRecorded(EMPTY_SIGNALS, swipe), swipe);
			expect(back.likedCommunityIds).toEqual([]);
			expect(back.passedCommunityIds).toEqual([]);
			expect(back.geo).toEqual([]);
		}
	});

	it("credits a city's own unit and keeps no list for it", () => {
		const s = applyRecorded(EMPTY_SIGNALS, {
			id: "area-city:decatur-ga",
			kind: "area",
			verdict: "left",
			geoUnitId: "city:decatur-ga",
		});
		expect(geoSignalFor(s, "city:decatur-ga")).toMatchObject({
			left: 1,
			right: 0,
		});
		expect(s.passedCommunityIds).toEqual([]);
	});
});
