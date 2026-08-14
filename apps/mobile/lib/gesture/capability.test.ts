import { describe, expect, it } from "vitest";
import { cardBehavior } from "../feed/behavior";
import type { FeedCardV3 } from "../feed/card-types";
import {
	DEFAULT_CAPABILITY,
	INERT_CAPABILITY,
	clampDisplacement,
	commitDecision,
	panLive,
} from "./capability";
import { SWIPE_THRESHOLD_RATIO, decideSwipe } from "./decide-swipe";

const CARD_W = 400;

const area: FeedCardV3 = {
	kind: "area",
	id: "area-1",
	unit: {
		id: "city:x",
		level: "city",
		name: "X",
		state: "GA",
		centroid: { lat: 0, lng: 0 },
		communityCount: 1,
		sampleCommunityNames: [],
		stats: {},
	},
};

describe("clampDisplacement", () => {
	it("passes an unclamped card through untouched", () => {
		expect(clampDisplacement(999, CARD_W, 1)).toBe(400);
		expect(clampDisplacement(120, CARD_W, 1)).toBe(120);
	});

	it("clamps at the given ratio, both directions", () => {
		expect(clampDisplacement(400, CARD_W, 0.3)).toBe(120);
		expect(clampDisplacement(-400, CARD_W, 0.3)).toBe(-120);
	});
});

describe("commitDecision — `commits: false` never reaches the caller", () => {
	it("passes a committed direction through for a normal card", () => {
		expect(commitDecision("right", true)).toBe("right");
		expect(commitDecision("left", true)).toBe("left");
	});

	it("turns any verdict into `none` for a non-committing card", () => {
		expect(commitDecision("right", false)).toBe("none");
		expect(commitDecision("left", false)).toBe("none");
	});
});

/**
 * The gate that stops a committed card from taking a second gesture.
 *
 * The flyout is a `withSpring` on `tx` whose COMPLETION CALLBACK performs the
 * handoff (advance the cursor, promote the next card). Writing `tx` from a new
 * gesture cancels that animation, and a cancelled Reanimated animation never
 * calls its callback — so the handoff was skipped and the card stayed on top
 * permanently. The old §1.6 challenge held for 900ms before the flyout even
 * started, making it the one kind with a window wide enough to lose the race
 * reliably. The challenge is gone (2026-08-15); the gate remains.
 */
describe("panLive — a committed card takes no further input", () => {
	const live = (over: Partial<Parameters<typeof panLive>[0]> = {}) =>
		panLive({ pannable: true, committed: false, ...over });

	it("allows a normal untouched top card", () => {
		expect(live()).toBe(true);
	});

	it("blocks a card that has already committed", () => {
		expect(live({ committed: true })).toBe(false);
	});

	it("blocks for the whole flyout, not just the frame of the release", () => {
		// The committed card is still on screen and still under the gesture until the
		// flyout spring completes and runs the handoff. A second touch in that window
		// cancels the spring, and a cancelled animation never runs its callback.
		expect(live({ committed: true })).toBe(false);
	});

	it("still enforces the §1.1 pannable gate", () => {
		expect(live({ pannable: false })).toBe(false);
	});

	it("is exactly `pannable && !committed` — nothing else gates the pan", () => {
		for (const pannable of [true, false]) {
			for (const committed of [true, false]) {
				expect(live({ pannable, committed })).toBe(pannable && !committed);
			}
		}
	});
});

describe("the capability constants", () => {
	it("DEFAULT is a normal decide-and-fly card", () => {
		expect(DEFAULT_CAPABILITY).toEqual({
			pannable: true,
			commits: true,
			maxDisplacementRatio: 1,
		});
	});

	it("INERT is dead to the touch — the no-top-card case", () => {
		expect(INERT_CAPABILITY.pannable).toBe(false);
		expect(INERT_CAPABILITY.commits).toBe(false);
	});
});

describe("the capabilities the gesture actually receives (§1.3 wiring)", () => {
	it("a decide card commits and flies out", () => {
		const cap = cardBehavior(area).capability;
		expect(cap.commits).toBe(true);
		expect(cap.pannable).toBe(true);
		expect(SWIPE_THRESHOLD_RATIO).toBeLessThan(1);
	});
});
