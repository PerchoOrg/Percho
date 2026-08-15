import { describe, expect, it } from "vitest";
import {
	SWIPE_MIN_FLICK_DIST_RATIO,
	SWIPE_SECTOR_DEG,
	SWIPE_THRESHOLD_RATIO,
	SWIPE_VELOCITY_PTS,
	decideSwipe,
	stepThresholdLatch,
} from "./decide-swipe";

const CARD_W = 400;
const THRESHOLD = CARD_W * SWIPE_THRESHOLD_RATIO;
const tanDeg = (deg: number) => Math.tan((deg * Math.PI) / 180);

// Every case below is expressed in terms of the exported constants, so a silent
// retune of any of them fails this suite instead of sliding through.
describe("the §0.5 contract constants", () => {
	it("are the spec values", () => {
		expect(SWIPE_THRESHOLD_RATIO).toBe(0.35);
		expect(SWIPE_VELOCITY_PTS).toBe(800);
		expect(SWIPE_SECTOR_DEG).toBe(30);
	});
});

describe("decideSwipe — 35% width threshold (§0.5)", () => {
	it("one thousandth of a point short of the threshold does not commit", () => {
		expect(
			decideSwipe({
				translationX: THRESHOLD - 0.001,
				translationY: 0,
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});

	it("exactly the threshold commits (contract is >=)", () => {
		expect(
			decideSwipe({
				translationX: THRESHOLD,
				translationY: 0,
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("right");
	});

	it("exactly the threshold to the left commits left", () => {
		expect(
			decideSwipe({
				translationX: -THRESHOLD,
				translationY: 0,
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("left");
	});
});

describe("decideSwipe — 800 pt/s velocity (§0.5)", () => {
	// The velocity path now also requires minimum travel (SWIPE_MIN_FLICK_DIST_RATIO)
	// so a micro-nudge with a fast release does not read as a swipe.
	const MIN_FLICK = CARD_W * SWIPE_MIN_FLICK_DIST_RATIO; // ~48pt

	it("exactly the velocity threshold does not commit (contract is strict >)", () => {
		expect(
			decideSwipe({
				translationX: MIN_FLICK,
				translationY: 0,
				velocityX: SWIPE_VELOCITY_PTS,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});

	it("one thousandth over the velocity threshold commits", () => {
		expect(
			decideSwipe({
				translationX: MIN_FLICK,
				translationY: 0,
				velocityX: SWIPE_VELOCITY_PTS + 0.001,
				cardWidth: CARD_W,
			}),
		).toBe("right");
	});

	it("a fast left flick commits left", () => {
		expect(
			decideSwipe({
				translationX: -MIN_FLICK,
				translationY: 0,
				velocityX: -(SWIPE_VELOCITY_PTS + 0.001),
				cardWidth: CARD_W,
			}),
		).toBe("left");
	});

	it("a fast release over a tiny distance does NOT commit (no-swipe bug)", () => {
		// The owner's "我还没有 swipe 他就跳到下一张": high release velocity but the
		// finger only moved ~10pt. Distance floor rejects it.
		expect(
			decideSwipe({
				translationX: 10,
				translationY: 0,
				velocityX: SWIPE_VELOCITY_PTS + 0.001,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});

	it("a fast release just under the distance floor does NOT commit", () => {
		expect(
			decideSwipe({
				translationX: MIN_FLICK - 0.001,
				translationY: 0,
				velocityX: SWIPE_VELOCITY_PTS + 100,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});
});

describe("decideSwipe — ±30° sector gate (§0.5)", () => {
	const bigX = 200; // clears the distance threshold; only the angle decides

	it("exactly the sector limit is still a horizontal swipe (contract is > 30)", () => {
		expect(
			decideSwipe({
				translationX: bigX,
				translationY: bigX * tanDeg(SWIPE_SECTOR_DEG),
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("right");
	});

	it("a thousandth of a degree past the sector limit is vertical territory", () => {
		expect(
			decideSwipe({
				translationX: bigX,
				translationY: bigX * tanDeg(SWIPE_SECTOR_DEG + 0.001),
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});

	it("a near-vertical drag never commits even with high velocity", () => {
		expect(
			decideSwipe({
				translationX: 5,
				translationY: 300,
				velocityX: SWIPE_VELOCITY_PTS * 1.5,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});
});

// Spec ambiguity resolved 2026-07-26 (see DEVLOG): a decisive velocity against
// the drag direction cancels rather than commits.
describe("decideSwipe — velocity opposing the drag", () => {
	it("a yank-back past the threshold cancels", () => {
		expect(
			decideSwipe({
				translationX: THRESHOLD + 10,
				translationY: 0,
				velocityX: -(SWIPE_VELOCITY_PTS + 700),
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});

	it("a slow release past the threshold still commits in the drag direction", () => {
		expect(
			decideSwipe({
				translationX: THRESHOLD + 10,
				translationY: 0,
				velocityX: -(SWIPE_VELOCITY_PTS - 100),
				cardWidth: CARD_W,
			}),
		).toBe("right");
	});

	it("a card dragged left never flies out right on a fast rightward release", () => {
		expect(
			decideSwipe({
				translationX: -10,
				translationY: 0,
				velocityX: SWIPE_VELOCITY_PTS + 100,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});
});

describe("decideSwipe — degenerate input", () => {
	it("an unmeasured card is never swipeable", () => {
		expect(
			decideSwipe({
				translationX: 1,
				translationY: 0,
				velocityX: 0,
				cardWidth: 0,
			}),
		).toBe("none");
	});

	it("an unmeasured card is not swipeable by velocity either", () => {
		expect(
			decideSwipe({
				translationX: 1,
				translationY: 0,
				velocityX: SWIPE_VELOCITY_PTS + 100,
				cardWidth: 0,
			}),
		).toBe("none");
	});
});

describe("stepThresholdLatch — §0.5 threshold haptic", () => {
	const step = (translationX: number, latched: boolean) =>
		stepThresholdLatch({ translationX, cardWidth: CARD_W, latched });

	it("a left swipe never fires", () => {
		let latched = false;
		for (const x of [-20, -THRESHOLD, -THRESHOLD * 2]) {
			const r = step(x, latched);
			expect(r.fire).toBe(false);
			latched = r.latched;
		}
		expect(latched).toBe(false);
	});

	it("a right swipe fires exactly once while held past the threshold", () => {
		let latched = false;
		let fires = 0;
		for (const x of [10, THRESHOLD, THRESHOLD + 5, THRESHOLD + 40]) {
			const r = step(x, latched);
			if (r.fire) fires++;
			latched = r.latched;
		}
		expect(fires).toBe(1);
	});

	it("fires once per crossing when the finger crosses back and forth", () => {
		let latched = false;
		let fires = 0;
		const path = [
			THRESHOLD, // cross
			THRESHOLD + 20,
			THRESHOLD - 1, // retreat
			THRESHOLD, // cross again
			THRESHOLD + 30,
			0, // retreat
			THRESHOLD, // cross again
		];
		for (const x of path) {
			const r = step(x, latched);
			if (r.fire) fires++;
			latched = r.latched;
		}
		expect(fires).toBe(3);
	});

	it("never fires on an unmeasured card", () => {
		expect(
			stepThresholdLatch({ translationX: 1, cardWidth: 0, latched: false }),
		).toEqual({ fire: false, latched: false });
	});
});
