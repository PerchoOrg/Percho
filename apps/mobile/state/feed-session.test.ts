/**
 * Feed session store tests. The funnel *logic* is already pinned by
 * `signals.test.ts`; what needs proving here is the store's own contract —
 * seen-id dedupe across pages, the hydration gate, and the fact that a scope
 * reset clears evidence.
 *
 * 2026-08-15: ask ids and insight-unsure are gone with the cards that produced
 * them; `resetStageCounter` is gone with the stage machine.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ListingCardV3 } from "../lib/feed/card-types";
import { EMPTY_SIGNALS } from "../lib/feed/signals";
import { useFeedSession } from "./feed-session";

const s = () => useFeedSession.getState();

const listing = (id: string): ListingCardV3 => ({
	kind: "listing",
	id,
	slug: id,
	address: `${id} Main St`,
	priceLabel: "$450,000",
	bedBathSqft: "3 bd · 2 ba",
	heroUrl: "https://example.com/a.jpg",
	geoUnitId: "city:marietta-ga",
});

beforeEach(() => {
	useFeedSession.setState({
		signals: EMPTY_SIGNALS,
		seenIds: [],
		sessionN: 0,
		lastSwipeAt: undefined,
		hydrated: false,
	});
});

describe("recordSwipe", () => {
	it("returns the new signals", () => {
		const next = s().recordSwipe(listing("l1"), "right", 1_000);
		expect(next).toBe(s().signals);
		expect(next.likedListingIds).toContain("l1");
	});

	it("marks the card seen and records the swipe time", () => {
		s().recordSwipe(listing("l1"), "left", 1_234);
		expect(s().seenIds).toEqual(["l1"]);
		expect(s().lastSwipeAt).toBe(1_234);
	});

	// §1.7 pagination dedupes on seenIds; a duplicate entry would make the
	// looped-card `seen` badge and the exhausted check disagree.
	it("does not duplicate a seen id if the same card is swiped twice", () => {
		s().recordSwipe(listing("l1"), "right", 1);
		s().recordSwipe(listing("l1"), "left", 2);
		expect(s().seenIds).toEqual(["l1"]);
	});
});

describe("markSeen", () => {
	it("merges a page of ids without duplicating", () => {
		s().markSeen(["a", "b"]);
		s().markSeen(["b", "c"]);
		expect([...s().seenIds].sort()).toEqual(["a", "b", "c"]);
	});

	// Identity stability matters: the deck is memoized on seenIds, so a new
	// array for a no-op merge would rebuild the deck mid-swipe.
	it("returns the identical array when nothing is new", () => {
		s().markSeen(["a"]);
		const before = s().seenIds;
		s().markSeen(["a"]);
		expect(s().seenIds).toBe(before);
	});
});

describe("beginSession", () => {
	it("increments sessionN and clears the previous swipe timestamp", () => {
		s().recordSwipe(listing("l1"), "right", 9_999);
		s().beginSession();
		expect(s().sessionN).toBe(1);
		// Otherwise the first swipe of session N reports hours of hesitation.
		expect(s().lastSwipeAt).toBeUndefined();
	});
});

describe("clearSignals — You-tab scope reset", () => {
	it("wipes evidence and seen ids", () => {
		s().recordSwipe(listing("l1"), "right", 1);
		s().clearSignals();
		expect(s().signals).toEqual(EMPTY_SIGNALS);
		expect(s().seenIds).toEqual([]);
	});

	it("keeps sessionN — it counts app opens, not scope", () => {
		s().beginSession();
		s().beginSession();
		s().clearSignals();
		expect(s().sessionN).toBe(2);
	});
});

describe("hydration gate", () => {
	it("starts false so the feed cannot compose a deck before rehydration", () => {
		expect(s().hydrated).toBe(false);
	});
});

describe("skipLayer", () => {
	it("delegates to the pure reducer and is idempotent", () => {
		s().skipLayer("city");
		s().skipLayer("city");
		expect(s().signals.skippedLayers).toEqual(["city"]);
	});
});
