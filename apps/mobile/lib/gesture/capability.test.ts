import { describe, expect, it } from "vitest";
import {
	CHALLENGE_REVEAL_MS,
	MILESTONE_CAP_RATIO,
	cardBehavior,
} from "../feed/behavior";
import type { FeedCardV3 } from "../feed/card-types";
import {
	DEFAULT_CAPABILITY,
	INERT_CAPABILITY,
	clampDisplacement,
	commitDecision,
	panAllowed,
} from "./capability";
import { SWIPE_THRESHOLD_RATIO, decideSwipe } from "./decide-swipe";

const CARD_W = 400;

const milestone: FeedCardV3 = {
	kind: "milestone",
	id: "ms-0-1",
	fromStage: 0,
	toStage: 1,
	headline: "h",
	sub: "s",
	chips: [],
};

const challenge: FeedCardV3 = {
	kind: "challenge",
	id: "ch-1",
	tag: "🎲 GUESS THE PRICE",
	q: "q",
	left: { label: "l", value: 1 },
	right: { label: "r", value: 2 },
	answer: "left",
	revealLabel: "$712,000",
	teach: "t",
};

describe("clampDisplacement — the §1.5 30% cap", () => {
	it("passes an unclamped card through untouched", () => {
		expect(clampDisplacement(999, CARD_W, 1)).toBe(400);
		expect(clampDisplacement(120, CARD_W, 1)).toBe(120);
	});

	it("caps a milestone drag at 30% of the card width, both directions", () => {
		const cap = CARD_W * MILESTONE_CAP_RATIO;
		expect(clampDisplacement(400, CARD_W, MILESTONE_CAP_RATIO)).toBe(cap);
		expect(clampDisplacement(-400, CARD_W, MILESTONE_CAP_RATIO)).toBe(-cap);
	});

	it("follows the finger below the cap — §1.5 is a cap, not a freeze", () => {
		expect(clampDisplacement(50, CARD_W, MILESTONE_CAP_RATIO)).toBe(50);
		expect(clampDisplacement(-50, CARD_W, MILESTONE_CAP_RATIO)).toBe(-50);
	});

	it("keeps a capped drag BELOW the commit threshold", () => {
		// This is why the cap matters mechanically and not just visually: 30% of
		// the width can never reach the 35% commit threshold, so the §0.5
		// "your vote counts" haptic cannot fire on a ceremony card.
		expect(MILESTONE_CAP_RATIO).toBeLessThan(SWIPE_THRESHOLD_RATIO);
		const clamped = clampDisplacement(9999, CARD_W, MILESTONE_CAP_RATIO);
		expect(
			decideSwipe({
				translationX: clamped,
				translationY: 0,
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});

	it("leaves the drag alone when the card has no measured width", () => {
		// cardWidth 0 would make the cap 0 and freeze the card at the origin;
		// `decideSwipe` already refuses to commit an unmeasured card.
		expect(clampDisplacement(75, 0, MILESTONE_CAP_RATIO)).toBe(75);
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

	it("a milestone flung past the threshold at speed still does not commit", () => {
		// The whole §1.5 red line in one assertion: a fast flick is a decisive
		// swipe by §0.5 (velocity gate), and it must STILL spring back, because a
		// ceremony card that flies out consumes the advance it exists to celebrate.
		const raw = decideSwipe({
			translationX: 300,
			translationY: 0,
			velocityX: 2000,
			cardWidth: CARD_W,
		});
		expect(raw).toBe("right");
		const cap = cardBehavior(milestone).capability;
		expect(commitDecision(raw, cap.commits)).toBe("none");
	});
});

describe("panAllowed — §1.1 翻面态禁 swipe", () => {
	it("allows the pan on an unflipped pannable card", () => {
		expect(panAllowed(true, 0)).toBe(true);
	});

	it("blocks the pan on a fully flipped card", () => {
		expect(panAllowed(true, 1)).toBe(false);
	});

	it("blocks the pan MID-crossfade, not just at rest on the data face", () => {
		// A card at 0.4 is showing two faces at once. Committing a verdict there
		// records it against a face the buyer was in the middle of leaving.
		expect(panAllowed(true, 0.4)).toBe(false);
		expect(panAllowed(true, 0.01)).toBe(false);
	});

	it("blocks an unpannable card regardless of flip state", () => {
		expect(panAllowed(false, 0)).toBe(false);
	});
});

describe("the capability constants", () => {
	it("DEFAULT is a normal decide-and-fly card with a data face", () => {
		expect(DEFAULT_CAPABILITY).toEqual({
			pannable: true,
			commits: true,
			maxDisplacementRatio: 1,
			flippable: true,
		});
	});

	it("INERT is dead to the touch — the no-top-card case", () => {
		expect(INERT_CAPABILITY.pannable).toBe(false);
		expect(INERT_CAPABILITY.commits).toBe(false);
		expect(INERT_CAPABILITY.flippable).toBe(false);
	});
});

describe("the capabilities the gesture actually receives (§1.3 wiring)", () => {
	it("milestone is pannable, non-committing, capped — all three at once", () => {
		const cap = cardBehavior(milestone).capability;
		expect(cap.pannable).toBe(true);
		expect(cap.commits).toBe(false);
		expect(cap.maxDisplacementRatio).toBe(MILESTONE_CAP_RATIO);
		// `enabled: false` (task-0's only option) would have given no drag at all,
		// which §1.5 explicitly does not want.
		expect(cap.pannable && !cap.commits).toBe(true);
	});

	it("challenge carries the 900ms reveal hold to the gesture", () => {
		const cap = cardBehavior(challenge).capability;
		expect(cap.revealMs).toBe(CHALLENGE_REVEAL_MS);
		expect(cap.commits).toBe(true);
	});

	it("only the challenge card asks for a reveal hold", () => {
		expect(cardBehavior(milestone).capability.revealMs).toBeUndefined();
	});
});
