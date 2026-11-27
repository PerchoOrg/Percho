/**
 * A place's own deck (phase404.3): what it shows, what its link says, and how
 * the feed is tidied when the buyer comes back from it.
 */
import { describe, expect, it } from "vitest";
import type {
	AreaCardV3,
	CommunityCardV3,
	FeedCardV3,
	ListingCardV3,
} from "./card-types";
import type { FeedPool } from "./generate-feed";
import {
	type SwipeHistory,
	narrowPool,
	parsePlaceFocus,
	placeDeck,
	placeLinkAccessibilityLabel,
	placeLinkLabel,
	placeWithin,
	withoutSwipedAway,
} from "./place-deck";

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
};
const ids = (cards: readonly FeedCardV3[]) => cards.map((c) => c.id);

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

	it("drops what was swiped there from the part of the deck not yet mounted", () => {
		const out = withoutSwipedAway(
			deck,
			0,
			new Set(["edinburgh", "harvest-park", "aberdeen"]),
		);
		// Edinburgh is behind the top card — mounted, so it stays.
		expect(ids(out)).toEqual([`area-${SUWANEE}`, "edinburgh", "windward"]);
	});

	it("returns the deck by identity when nothing was swiped there", () => {
		expect(withoutSwipedAway(deck, 0, new Set())).toBe(deck);
		expect(withoutSwipedAway(deck, 0, new Set(["northbrooke"]))).toBe(deck);
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

describe("narrowPool — a place's part of a pool the phone already holds", () => {
	const suwanee = city(SUWANEE).unit;
	const alpharetta = city(ALPHARETTA).unit;
	const whole: FeedPool = {
		geoUnits: [alpharetta, suwanee],
		communities: [edinburgh, windward, harvest, aberdeen],
		listings: [home("h1", "edinburgh"), home("h3", "windward")],
	};

	it("a city's: its unit and its neighbourhoods, nobody else's", () => {
		const out = narrowPool(whole, {
			kind: "city",
			id: SUWANEE,
			name: "Suwanee",
		});
		expect(out.geoUnits.map((u) => u.id)).toEqual([SUWANEE]);
		expect(ids(out.communities)).toEqual([
			"edinburgh",
			"harvest-park",
			"aberdeen",
		]);
		// And so the deck its page opens on is the one the server would deal.
		expect(ids(placeDeck(out, "city", NOTHING))).toEqual([
			"edinburgh",
			"harvest-park",
			"aberdeen",
		]);
	});

	it("a neighbourhood's: itself, its city, its homes", () => {
		const out = narrowPool(whole, {
			kind: "community",
			id: "edinburgh",
			name: "Edinburgh",
		});
		expect(out.geoUnits.map((u) => u.id)).toEqual([SUWANEE]);
		expect(ids(out.communities)).toEqual(["edinburgh"]);
		expect(ids(out.listings)).toEqual(["h1"]);
	});

	it("is empty for a place the pool does not hold", () => {
		const out = narrowPool(whole, {
			kind: "city",
			id: "city:nowhere-ga",
			name: "Nowhere",
		});
		expect(out).toEqual({ geoUnits: [], communities: [], listings: [] });
	});
});
