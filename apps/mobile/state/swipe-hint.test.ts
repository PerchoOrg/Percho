/**
 * The hint's never-nag contract (owner spec, 2026-08-13):
 *   - a real swipe marks discovery forever,
 *   - without a swipe the hint plays on at most MAX_HINT_SESSIONS sessions,
 *   - once the cap is reached it stops even if the buyer never swiped.
 *
 * The store's persistence middleware (AsyncStorage) is not available in
 * vitest; these tests drive the pure reducer logic through the store's own
 * actions, which is the part that encodes the contract.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_HINT_SESSIONS, useSwipeHintStore } from "./swipe-hint";

describe("swipe hint", () => {
	beforeEach(() => {
		// Reset the singleton between tests, bypassing AsyncStorage (vitest).
		useSwipeHintStore.setState({
			hasDiscoveredSwipe: false,
			hintSessionsShown: 0,
			hydrated: true,
		});
	});

	it("plays the hint on the first session", () => {
		expect(useSwipeHintStore.getState().recordHintShown()).toBe(true);
		expect(useSwipeHintStore.getState().hintSessionsShown).toBe(1);
	});

	it("a real swipe stops the hint forever", () => {
		useSwipeHintStore.getState().recordHintShown();
		useSwipeHintStore.getState().recordSwipe();
		expect(useSwipeHintStore.getState().hasDiscoveredSwipe).toBe(true);
		// Even with sessions left, the cap check reads the discovery flag first.
		expect(useSwipeHintStore.getState().recordHintShown()).toBe(false);
	});

	it("stops after MAX_HINT_SESSIONS without a swipe", () => {
		for (let i = 0; i < MAX_HINT_SESSIONS; i++) {
			expect(useSwipeHintStore.getState().recordHintShown()).toBe(true);
		}
		expect(useSwipeHintStore.getState().hintSessionsShown).toBe(
			MAX_HINT_SESSIONS,
		);
		expect(useSwipeHintStore.getState().recordHintShown()).toBe(false);
	});

	it("does not burn a session when the hint cannot play", () => {
		// Discovery already happened — nothing should ever increment again.
		useSwipeHintStore.getState().recordSwipe();
		expect(useSwipeHintStore.getState().recordHintShown()).toBe(false);
		expect(useSwipeHintStore.getState().hintSessionsShown).toBe(0);
	});
});
