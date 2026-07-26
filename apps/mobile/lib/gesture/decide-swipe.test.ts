import { describe, expect, it } from "vitest";
import { decideSwipe } from "./decide-swipe";

const CARD_W = 400; // 35% = 140pt
const tanDeg = (deg: number) => Math.tan((deg * Math.PI) / 180);

describe("decideSwipe — 35% width threshold (§0.5)", () => {
	it("34% of card width does not commit", () => {
		expect(
			decideSwipe({
				translationX: CARD_W * 0.34, // 136pt < 140pt
				translationY: 0,
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});

	it("36% of card width commits (right)", () => {
		expect(
			decideSwipe({
				translationX: CARD_W * 0.36, // 144pt >= 140pt
				translationY: 0,
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("right");
	});

	it("36% to the left commits (left)", () => {
		expect(
			decideSwipe({
				translationX: -CARD_W * 0.36,
				translationY: 0,
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("left");
	});
});

describe("decideSwipe — 800 pt/s velocity (§0.5)", () => {
	// Small translation (below the 35% threshold) so velocity is the decider.
	const shortX = 10;

	it("799 pt/s does not commit", () => {
		expect(
			decideSwipe({
				translationX: shortX,
				translationY: 0,
				velocityX: 799,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});

	it("801 pt/s commits (right)", () => {
		expect(
			decideSwipe({
				translationX: shortX,
				translationY: 0,
				velocityX: 801,
				cardWidth: CARD_W,
			}),
		).toBe("right");
	});

	it("-801 pt/s commits (left)", () => {
		expect(
			decideSwipe({
				translationX: -shortX,
				translationY: 0,
				velocityX: -801,
				cardWidth: CARD_W,
			}),
		).toBe("left");
	});
});

describe("decideSwipe — ±30° sector gate (§0.5)", () => {
	// Translation X clears the 35% threshold; only the angle should decide.
	const bigX = 200;

	it("29° off horizontal stays a horizontal swipe (commit)", () => {
		expect(
			decideSwipe({
				translationX: bigX,
				translationY: bigX * tanDeg(29),
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("right");
	});

	it("31° off horizontal is vertical territory (none)", () => {
		expect(
			decideSwipe({
				translationX: bigX,
				translationY: bigX * tanDeg(31),
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
				velocityX: 1200,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});
});

describe("decideSwipe — degenerate input", () => {
	it("no movement is none", () => {
		expect(
			decideSwipe({
				translationX: 0,
				translationY: 0,
				velocityX: 0,
				cardWidth: CARD_W,
			}),
		).toBe("none");
	});
});
