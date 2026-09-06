/**
 * Jumping the deck from the header's community strip (phase181, owner pick
 * "R3").
 */
import { describe, expect, it } from "vitest";
import type { CommunityCardV3, FeedCardV3, ListingCardV3 } from "./card-types";
import { jumpToCommunity } from "./jump";

const listing = (id: string): ListingCardV3 => ({
	kind: "listing",
	id,
	slug: id,
	address: "9155 Nesbit Ferry Road",
	priceLabel: "$339,000",
	bedBathSqft: "3 bd · 3 ba · 1,386 sqft",
	heroUrl: `https://example.test/${id}.jpg`,
	locality: "Johns Creek, GA",
	geoUnitId: "city:johns-creek-ga",
});

const community = (id: string): CommunityCardV3 => ({
	kind: "community",
	id,
	slug: id,
	name: "Bellmoore Park",
	city: "Johns Creek",
	state: "GA",
	heroUrl: `https://example.test/${id}.jpg`,
});

const ids = (deck: readonly FeedCardV3[]) => deck.map((c) => c.id);

describe("jumpToCommunity", () => {
	it("puts the tapped community directly after the top card", () => {
		const deck = [listing("l1"), listing("l2"), listing("l3")];
		const out = jumpToCommunity(deck, 1, community("c9"));
		expect(ids(out.deck)).toEqual(["l1", "l2", "c9", "l3"]);
		// The new top IS the tapped card.
		expect(out.activeIndex).toBe(2);
		expect(out.deck[out.activeIndex]?.id).toBe("c9");
	});

	it("does nothing when that community is already on top", () => {
		const deck = [listing("l1"), community("c9"), listing("l2")];
		const out = jumpToCommunity(deck, 1, community("c9"));
		// Same reference: a re-tap must not re-order or re-render the deck.
		expect(out.deck).toBe(deck);
		expect(out.activeIndex).toBe(1);
	});

	it("leaves cards before the top card untouched", () => {
		// Anything already swiped keeps its index — the stack has animated past
		// those and renumbering them would move a card mid-flight.
		const deck = [community("c9"), listing("l1"), listing("l2")];
		const out = jumpToCommunity(deck, 1, community("c9"));
		expect(ids(out.deck)).toEqual(["c9", "l1", "c9", "l2"]);
		expect(out.activeIndex).toBe(2);
	});

	it("appends when the deck is exhausted", () => {
		const deck = [listing("l1")];
		const out = jumpToCommunity(deck, 5, community("c9"));
		expect(ids(out.deck)).toEqual(["l1", "c9"]);
		expect(out.activeIndex).toBe(1);
	});

	it("jumps to a copy rather than moving the original", () => {
		// The original stays where the composer put it, so nothing the stack has
		// already measured shifts; the community pool recycles entries anyway.
		const deck = [listing("l1"), listing("l2"), community("c9")];
		const out = jumpToCommunity(deck, 0, community("c9"));
		expect(ids(out.deck)).toEqual(["l1", "c9", "l2", "c9"]);
	});
});
