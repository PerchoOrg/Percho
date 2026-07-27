/**
 * Feed session store tests. The funnel *logic* is already pinned by
 * `signals.test.ts`; what needs proving here is the store's own contract —
 * seen-id dedupe across pages, ask idempotence, the hydration gate, and the
 * fact that a scope reset clears evidence WITHOUT touching the stage machine.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { AskCardV3, ListingCardV3 } from "../lib/feed/card-types";
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

const ask: AskCardV3 = {
	kind: "ask",
	id: "ask-life-walkable",
	layer: "life",
	q: "Is walkability important?",
	choice: { form: "yes-no", affirm: { type: "dim", dim: "walkable" } },
};

beforeEach(() => {
	useFeedSession.setState({
		signals: EMPTY_SIGNALS,
		seenIds: [],
		answeredAskIds: [],
		sessionN: 0,
		lastSwipeAt: undefined,
		hydrated: false,
		undoSnapshot: undefined,
	});
});

describe("recordSwipe", () => {
	it("returns the new signals so the caller can evaluate advance in the same tick", () => {
		const next = s().recordSwipe(listing("l1"), "right", 1_000);
		// Returned value must be the post-swipe state, not the pre-swipe one —
		// the feed feeds it straight into evaluateStageAdvance.
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

	it("records an ask id so the question never repeats", () => {
		s().recordSwipe(ask, "right", 10);
		expect(s().answeredAskIds).toEqual(["ask-life-walkable"]);
	});

	it("does not treat a listing as an answered ask", () => {
		s().recordSwipe(listing("l1"), "right", 10);
		expect(s().answeredAskIds).toEqual([]);
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

describe("resetStageCounter", () => {
	it("zeroes swipesInStage without discarding accumulated signals", () => {
		s().recordSwipe(listing("l1"), "right", 1);
		expect(s().signals.swipesInStage).toBe(1);
		s().resetStageCounter();
		expect(s().signals.swipesInStage).toBe(0);
		expect(s().signals.likedListingIds).toContain("l1");
	});
});

describe("clearSignals — You-tab scope reset", () => {
	it("wipes evidence and seen ids", () => {
		s().recordSwipe(listing("l1"), "right", 1);
		s().recordSwipe(ask, "right", 2);
		s().clearSignals();
		expect(s().signals).toEqual(EMPTY_SIGNALS);
		expect(s().seenIds).toEqual([]);
		expect(s().answeredAskIds).toEqual([]);
	});

	// The stage lives in funnel.ts and only resetTo() may move it backward.
	// This store must not be a second, silent path to a downshift.
	it("keeps sessionN — it counts app opens, not scope", () => {
		s().beginSession();
		s().beginSession();
		s().clearSignals();
		expect(s().sessionN).toBe(2);
	});
});

describe("hydration gate", () => {
	it("starts false so the feed cannot compose a stage-0 deck for a returning user", () => {
		expect(s().hydrated).toBe(false);
	});
});

describe("skipLayer", () => {
	it("delegates to the pure reducer and is idempotent", () => {
		s().skipLayer("lifestyle");
		s().skipLayer("lifestyle");
		expect(s().signals.skippedLayers).toEqual(["lifestyle"]);
	});
});

describe("recordInsightUnsure", () => {
	// §1.6: "Not sure" records nothing. It must still consume the card, or the
	// same insight comes back on the next page.
	it("marks the card seen but records no preference", () => {
		const insightCard = {
			kind: "insight" as const,
			id: "ins-1",
			dim: "walkable" as const,
			text: "Walkable areas here cost more",
			evidence: "Median $612k vs $448k across 44 Marietta communities",
		};
		s().recordInsightUnsure(insightCard);
		expect(s().seenIds).toContain("ins-1");
		expect(s().signals.insightAgreed).toEqual([]);
		expect(s().signals.insightRejected).toEqual([]);
		expect(s().signals.dims).toEqual({});
	});
});

// §1.8 undo. The asymmetry the owner accepted (PLAN B5) is that the SIGNAL
// reverts and the STAGE does not — `funnel.ts` is monotonic by design — so what
// needs pinning here is that the signal really does go all the way back.
describe("undoSwipe (§1.8)", () => {
	it("restores the exact pre-swipe signal state", () => {
		const before = s().signals;
		s().recordSwipe(listing("l1"), "right", 1_000);
		expect(s().signals.likedListingIds).toContain("l1");

		const restored = s().undoSwipe("l1");
		expect(restored).toEqual(before);
		expect(s().signals).toEqual(before);
		expect(s().signals.likedListingIds).not.toContain("l1");
	});

	it("reverts the per-stage swipe counter too", () => {
		s().recordSwipe(listing("l1"), "right", 1_000);
		expect(s().signals.swipesInStage).toBe(1);
		s().undoSwipe("l1");
		// Otherwise the `stage_advance` telemetry would count a swipe the buyer
		// took back, and §1.10's swipes-per-stage metric would drift up over time.
		expect(s().signals.swipesInStage).toBe(0);
	});

	it("un-marks the card seen so it can come back to the top of the deck", () => {
		s().recordSwipe(listing("l1"), "left", 1_000);
		expect(s().seenIds).toContain("l1");
		s().undoSwipe("l1");
		expect(s().seenIds).not.toContain("l1");
	});

	it("keeps a card seen if it was ALREADY seen before the undone swipe", () => {
		// A looped card (§1.9) is swiped a second time. Undoing that swipe
		// unrecords the verdict but must not claim the buyer never saw the card.
		s().markSeen(["l1"]);
		s().recordSwipe(listing("l1"), "right", 1_000);
		s().undoSwipe("l1");
		expect(s().seenIds).toContain("l1");
	});

	it("un-answers an ask so the question is not silently skipped", () => {
		s().recordSwipe(ask, "right", 1_000);
		expect(s().answeredAskIds).toContain(ask.id);
		s().undoSwipe(ask.id);
		expect(s().answeredAskIds).not.toContain(ask.id);
	});

	it("returns null for a card that is not the last swipe", () => {
		s().recordSwipe(listing("l1"), "right", 1_000);
		s().recordSwipe(listing("l2"), "right", 2_000);
		// Only the most recent swipe is undoable: the 3s window has closed on l1,
		// and restoring its snapshot would also erase l2's verdict.
		expect(s().undoSwipe("l1")).toBeNull();
		expect(s().signals.likedListingIds).toContain("l2");
	});

	it("returns null when there is nothing to undo", () => {
		expect(s().undoSwipe("l1")).toBeNull();
	});

	it("cannot be used twice for the same swipe", () => {
		s().recordSwipe(listing("l1"), "right", 1_000);
		expect(s().undoSwipe("l1")).not.toBeNull();
		expect(s().undoSwipe("l1")).toBeNull();
	});

	it("is dropped by a scope reset — undo must not resurrect cleared scope", () => {
		s().recordSwipe(listing("l1"), "right", 1_000);
		s().clearSignals();
		expect(s().undoSwipe("l1")).toBeNull();
		expect(s().signals).toEqual(EMPTY_SIGNALS);
	});

	it("is dropped by a new session — the 3s window cannot span a restart", () => {
		s().recordSwipe(listing("l1"), "right", 1_000);
		s().beginSession();
		expect(s().undoSwipe("l1")).toBeNull();
	});
});
