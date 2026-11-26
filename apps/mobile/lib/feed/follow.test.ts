/**
 * A like steps down a level (phase404.3): what it queues, where, and when it
 * stops — and the deck a place's own page shows.
 */
import { describe, expect, it } from "vitest";
import type {
	AreaCardV3,
	CommunityCardV3,
	FeedCardV3,
	ListingCardV3,
} from "./card-types";
import {
	FOLLOW_MAX,
	type SwipeHistory,
	cardsWithin,
	followStep,
	parsePlaceFocus,
	placeDeck,
	placeLinkAccessibilityLabel,
	placeLinkLabel,
	placeWithin,
	withoutSwipedAway,
} from "./follow";
import type { FeedPool } from "./generate-feed";

const SUWANEE = "city:suwanee-ga";
const ALPHARETTA = "city:alpharetta-ga";

function city(id: string): AreaCardV3 {
	return {
		kind: "area",
		id: `area-${id}`,
		unit: {
			id,
			level: "city",
			name: id,
			state: "GA",
			centroid: { lat: 34, lng: -84 },
			communityCount: 3,
			sampleCommunityNames: [],
			stats: {},
		},
	};
}

function community(id: string, geoUnitId: string): CommunityCardV3 {
	return {
		kind: "community",
		id,
		slug: id,
		name: id,
		city: "Suwanee",
		state: "GA",
		heroUrl: `https://example.test/${id}.jpg`,
		geoUnitId,
	};
}

function home(id: string, communityId: string): ListingCardV3 {
	return {
		kind: "listing",
		id,
		slug: id,
		address: `${id} St`,
		priceLabel: "$400,000",
		bedBathSqft: "3 bd · 2 ba",
		heroUrl: `https://example.test/${id}.jpg`,
		communityId,
	};
}

const edinburgh = community("edinburgh", SUWANEE);
const harvest = community("harvest-park", SUWANEE);
const aberdeen = community("aberdeen", SUWANEE);
const windward = community("windward", ALPHARETTA);
const northbrooke = community("northbrooke", "city:cumming-ga");

const pool: FeedPool = {
	geoUnits: [],
	listings: [
		home("h1", "edinburgh"),
		home("h2", "edinburgh"),
		home("h3", "windward"),
	],
	communities: [edinburgh, windward, harvest, northbrooke, aberdeen],
};

const NOTHING: SwipeHistory = {
	seenIds: new Set(),
	passedIds: new Set(),
	recentIds: new Set(),
};
const ids = (cards: readonly FeedCardV3[]) => cards.map((c) => c.id);

describe("cardsWithin — one level down", () => {
	it("a city holds its own neighbourhoods and no other city's", () => {
		expect(ids(cardsWithin(city(SUWANEE), pool, NOTHING))).toEqual([
			"edinburgh",
			"harvest-park",
			"aberdeen",
		]);
	});

	it("a neighbourhood holds its homes", () => {
		expect(ids(cardsWithin(edinburgh, pool, NOTHING))).toEqual(["h1", "h2"]);
	});

	it("a home holds nothing", () => {
		expect(cardsWithin(home("h1", "edinburgh"), pool, NOTHING)).toEqual([]);
	});

	it("puts what was already seen last, and leaves out what was passed", () => {
		const history: SwipeHistory = {
			seenIds: new Set(["edinburgh", "harvest-park"]),
			passedIds: new Set(["harvest-park"]),
			recentIds: new Set(),
		};
		expect(ids(cardsWithin(city(SUWANEE), pool, history))).toEqual([
			"aberdeen",
			"edinburgh",
		]);
	});
});

describe("cardsWithin — what a like will not replay", () => {
	it("leaves out what was swiped since the app opened", () => {
		const history: SwipeHistory = {
			seenIds: new Set(["edinburgh", "harvest-park", "aberdeen"]),
			passedIds: new Set(),
			recentIds: new Set(["edinburgh", "harvest-park"]),
		};
		// Seen on another day is fine — it is all there is to show.
		expect(ids(cardsWithin(city(SUWANEE), pool, history))).toEqual([
			"aberdeen",
		]);
	});
});

describe("followStep — a like queues the place behind the card underneath", () => {
	const deck: FeedCardV3[] = [
		city(SUWANEE),
		windward,
		northbrooke,
		city(ALPHARETTA),
		edinburgh,
		harvest,
		aberdeen,
	];

	it("keeps the card underneath and seats the city's neighbourhoods after it", () => {
		const out = followStep({
			deck,
			index: 0,
			verdict: "right",
			run: null,
			pool,
			history: NOTHING,
		});
		expect(ids(out.deck)).toEqual([
			`area-${SUWANEE}`,
			"windward",
			"edinburgh",
			"harvest-park",
			"aberdeen",
			"northbrooke",
			`area-${ALPHARETTA}`,
		]);
		expect(out.run).toEqual({
			ids: ["edinburgh", "harvest-park", "aberdeen"],
			passes: 0,
		});
	});

	it("never shows a card twice: the queued ones leave their old seats", () => {
		const out = followStep({
			deck,
			index: 0,
			verdict: "right",
			run: null,
			pool,
			history: NOTHING,
		});
		expect(new Set(ids(out.deck)).size).toBe(deck.length);
	});

	it("leaves the card underneath where it is when it is one of the place's", () => {
		const out = followStep({
			deck: [city(SUWANEE), harvest, windward, edinburgh, aberdeen],
			index: 0,
			verdict: "right",
			run: null,
			pool,
			history: NOTHING,
		});
		expect(ids(out.deck)).toEqual([
			`area-${SUWANEE}`,
			"harvest-park",
			"edinburgh",
			"aberdeen",
			"windward",
		]);
		expect(out.run?.ids).toContain("harvest-park");
	});

	it("queues a neighbourhood that was not in the deck at all", () => {
		const out = followStep({
			deck: [city(SUWANEE), windward],
			index: 0,
			verdict: "right",
			run: null,
			pool,
			history: NOTHING,
		});
		expect(ids(out.deck)).toEqual([
			`area-${SUWANEE}`,
			"windward",
			"edinburgh",
			"harvest-park",
			"aberdeen",
		]);
	});

	it("queues at most FOLLOW_MAX", () => {
		const many = Array.from({ length: 7 }, (_, i) =>
			community(`c${i}`, SUWANEE),
		);
		const out = followStep({
			deck: [city(SUWANEE), windward],
			index: 0,
			verdict: "right",
			run: null,
			pool: { ...pool, communities: many },
			history: NOTHING,
		});
		expect(out.run?.ids).toHaveLength(FOLLOW_MAX);
		expect(out.deck).toHaveLength(2 + FOLLOW_MAX);
	});

	it("a liked neighbourhood queues its homes", () => {
		const out = followStep({
			deck: [edinburgh, windward, northbrooke],
			index: 0,
			verdict: "right",
			run: null,
			pool,
			history: NOTHING,
		});
		expect(ids(out.deck)).toEqual([
			"edinburgh",
			"windward",
			"h1",
			"h2",
			"northbrooke",
		]);
	});

	it("does nothing on a pass, or on a like with nothing inside", () => {
		const base = { deck, run: null, pool, history: NOTHING };
		expect(followStep({ ...base, index: 0, verdict: "left" }).deck).toBe(deck);
		// Northbrooke has no homes in the pool.
		const liked = followStep({ ...base, index: 2, verdict: "right" });
		expect(liked.deck).toBe(deck);
		expect(liked.run).toBeNull();
	});
});

describe("followStep — when the run ends", () => {
	const followed: FeedCardV3[] = [
		city(SUWANEE),
		windward,
		edinburgh,
		harvest,
		aberdeen,
		northbrooke,
	];
	const run = { ids: ["edinburgh", "harvest-park", "aberdeen"], passes: 0 };
	const base = {
		deck: followed,
		pool: { ...pool, listings: [] },
		history: NOTHING,
	};

	it("a card that was not followed leaves the run alone", () => {
		const out = followStep({ ...base, index: 1, verdict: "left", run });
		expect(out.run).toBe(run);
		expect(out.deck).toBe(followed);
	});

	it("counts down as the followed cards are swiped, and ends on the last", () => {
		const a = followStep({ ...base, index: 2, verdict: "right", run });
		expect(a.run).toEqual({ ids: ["harvest-park", "aberdeen"], passes: 0 });
		const b = followStep({ ...base, index: 3, verdict: "right", run: a.run });
		const c = followStep({ ...base, index: 4, verdict: "left", run: b.run });
		expect(c.run).toBeNull();
		expect(c.deck).toBe(followed);
	});

	it("two passes in a row stop it; the rest go to the back, the one underneath stays", () => {
		const four = [
			...followed.slice(0, 5),
			community("fourth", SUWANEE),
			northbrooke,
		];
		const long = { ids: [...run.ids, "fourth"], passes: 0 };
		const a = followStep({
			...base,
			deck: four,
			index: 2,
			verdict: "left",
			run: long,
		});
		expect(a.run?.passes).toBe(1);
		const b = followStep({
			...base,
			deck: a.deck,
			index: 3,
			verdict: "left",
			run: a.run,
		});
		expect(b.run).toBeNull();
		// Aberdeen was already underneath Harvest Park; "fourth" goes behind everything.
		expect(ids(b.deck)).toEqual([
			`area-${SUWANEE}`,
			"windward",
			"edinburgh",
			"harvest-park",
			"aberdeen",
			"northbrooke",
			"fourth",
		]);
	});

	it("a like between two passes is not two in a row", () => {
		const a = followStep({ ...base, index: 2, verdict: "left", run });
		const b = followStep({ ...base, index: 3, verdict: "right", run: a.run });
		expect(b.run).toEqual({ ids: ["aberdeen"], passes: 0 });
	});
});

describe("placeDeck — a place's own page", () => {
	const narrowed: FeedPool = {
		geoUnits: [],
		communities: [edinburgh, harvest, aberdeen],
		listings: [home("h1", "edinburgh")],
	};

	it("a city's is its neighbourhoods, then its homes", () => {
		expect(ids(placeDeck(narrowed, "city", NOTHING))).toEqual([
			"edinburgh",
			"harvest-park",
			"aberdeen",
			"h1",
		]);
	});

	it("a neighbourhood's is its homes, not its own card", () => {
		const one: FeedPool = { ...narrowed, communities: [edinburgh] };
		expect(ids(placeDeck(one, "community", NOTHING))).toEqual(["h1"]);
	});

	it("is all of the place: what is new first, what was passed last", () => {
		const history: SwipeHistory = {
			seenIds: new Set(["edinburgh", "harvest-park"]),
			passedIds: new Set(["harvest-park"]),
			// Swiped a minute ago on the feed — still part of the place.
			recentIds: new Set(["edinburgh"]),
		};
		expect(ids(placeDeck(narrowed, "city", history))).toEqual([
			"aberdeen",
			"edinburgh",
			"harvest-park",
			"h1",
		]);
	});
});

describe("withoutSwipedAway — back from a place's page", () => {
	const deck: FeedCardV3[] = [
		city(SUWANEE),
		edinburgh,
		harvest,
		aberdeen,
		windward,
	];
	const run = { ids: ["edinburgh", "harvest-park", "aberdeen"], passes: 1 };

	it("drops what was swiped there from the part of the deck not yet mounted", () => {
		const out = withoutSwipedAway(
			deck,
			0,
			run,
			new Set(["edinburgh", "harvest-park", "aberdeen"]),
		);
		// Edinburgh is behind the top card — mounted, so it stays.
		expect(ids(out.deck)).toEqual([`area-${SUWANEE}`, "edinburgh", "windward"]);
		expect(out.run).toBeNull();
	});

	it("keeps a run waiting only for what is still to come", () => {
		const out = withoutSwipedAway(deck, 0, run, new Set(["harvest-park"]));
		expect(ids(out.deck)).toEqual([
			`area-${SUWANEE}`,
			"edinburgh",
			"aberdeen",
			"windward",
		]);
		expect(out.run).toEqual({ ids: ["edinburgh", "aberdeen"], passes: 1 });
	});

	it("returns the deck by identity when nothing was swiped there", () => {
		expect(withoutSwipedAway(deck, 0, run, new Set()).deck).toBe(deck);
		expect(withoutSwipedAway(deck, 0, run, new Set(["northbrooke"])).deck).toBe(
			deck,
		);
	});
});

describe("parsePlaceFocus", () => {
	it("reads a city and a neighbourhood", () => {
		expect(
			parsePlaceFocus({ kind: "city", id: SUWANEE, name: "Suwanee" }),
		).toEqual({
			kind: "city",
			id: SUWANEE,
			name: "Suwanee",
		});
		expect(parsePlaceFocus({ kind: "community", id: "edinburgh" })).toEqual({
			kind: "community",
			id: "edinburgh",
			name: "",
		});
	});

	it("names no place for anything else", () => {
		expect(parsePlaceFocus({})).toBeNull();
		expect(parsePlaceFocus({ kind: "county", id: "x" })).toBeNull();
		expect(parsePlaceFocus({ kind: "city", id: "" })).toBeNull();
		expect(parsePlaceFocus({ kind: "city", id: ["a", "b"] })).toBeNull();
	});
});

describe("placeWithin — the place a card is the way into", () => {
	it("a city with a neighbourhood in the pool, liked or not", () => {
		expect(placeWithin(city(SUWANEE), pool)).toEqual({
			kind: "city",
			id: SUWANEE,
			name: SUWANEE,
		});
	});

	it("a neighbourhood with a home in the pool", () => {
		expect(placeWithin(edinburgh, pool)).toEqual({
			kind: "community",
			id: "edinburgh",
			name: "edinburgh",
		});
	});

	it("no place for a card with nothing inside it", () => {
		expect(placeWithin(city("city:nowhere-ga"), pool)).toBeNull();
		// The store build's pool has no homes: no neighbourhood has a link.
		expect(placeWithin(edinburgh, { ...pool, listings: [] })).toBeNull();
		expect(placeWithin(home("h1", "edinburgh"), pool)).toBeNull();
	});

	it("says what is inside, short — the name is on the card under it", () => {
		const suwanee = { kind: "city", id: SUWANEE, name: "Suwanee" } as const;
		const edinburghFocus = {
			kind: "community",
			id: "edinburgh",
			name: "Edinburgh",
		} as const;
		expect(placeLinkLabel(suwanee)).toBe("Communities");
		expect(placeLinkLabel(edinburghFocus)).toBe("Homes");
		// Read aloud, it says whose.
		expect(placeLinkAccessibilityLabel(suwanee)).toBe("Communities in Suwanee");
		expect(placeLinkAccessibilityLabel(edinburghFocus)).toBe(
			"Homes in Edinburgh",
		);
	});
});
