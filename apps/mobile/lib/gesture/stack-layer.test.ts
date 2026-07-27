/**
 * The ghosting regression (§0.6 #7).
 *
 * Symptom on device: after one swipe, two or three card titles were legible at
 * once, the whole stack looking washed out. Cause: `SwipeStack` keys cards by
 * ITEM identity so a promoted card keeps its subtree, which means the animated
 * style attached to a view is swapped on promotion. Reanimated does not revert
 * native props a detached style already wrote, so the old `topStyle` — which set
 * only `transform` — left the `opacity: 0.5` written by `nextStyle` in place.
 * The promoted card stayed translucent and the cards beneath showed through.
 *
 * The invariant that prevents it is key parity: every layer must write the same
 * set of props, so whichever style lands on a view fully overwrites the last.
 */
import { describe, expect, it } from "vitest";
import { SWIPE_THRESHOLD_RATIO } from "./decide-swipe";
import {
	type CardLayerRole,
	FOLLOW_ROTATION_DEG,
	cardLayerVisual,
} from "./stack-layer";

const W = 300;
const ROLES: CardLayerRole[] = ["top", "next", "after"];

describe("cardLayerVisual — prop-key parity (the ghosting invariant)", () => {
	it("every role returns the identical key set", () => {
		const keys = ROLES.map((r) =>
			Object.keys(cardLayerVisual(r, 0, W))
				.sort()
				.join(","),
		);
		expect(new Set(keys).size).toBe(1);
		expect(keys[0]).toBe("opacity,rotateDeg,scale,translateX");
	});

	it("every role returns the identical key set mid-drag too", () => {
		const keys = ROLES.map((r) =>
			Object.keys(cardLayerVisual(r, 120, W))
				.sort()
				.join(","),
		);
		expect(new Set(keys).size).toBe(1);
	});

	it("no role ever returns undefined for any prop", () => {
		for (const r of ROLES) {
			for (const tx of [-W, -40, 0, 40, W]) {
				const v = cardLayerVisual(r, tx, W);
				expect(v.opacity).toBeTypeOf("number");
				expect(v.scale).toBeTypeOf("number");
				expect(v.translateX).toBeTypeOf("number");
				expect(v.rotateDeg).toBeTypeOf("number");
			}
		}
	});

	it("the top layer is fully opaque and unscaled at every drag offset", () => {
		for (const tx of [-W * 2, -W, -1, 0, 1, W, W * 2]) {
			const v = cardLayerVisual("top", tx, W);
			expect(v.opacity).toBe(1);
			expect(v.scale).toBe(1);
		}
	});
});

describe("cardLayerVisual — resting values", () => {
	it("holds the spec resting scale/opacity at rest", () => {
		expect(cardLayerVisual("next", 0, W)).toMatchObject({
			scale: 0.94,
			opacity: 0.5,
		});
		expect(cardLayerVisual("after", 0, W)).toMatchObject({
			scale: 0.88,
			opacity: 0.25,
		});
	});

	it("only the top layer translates; the ones behind never move", () => {
		expect(cardLayerVisual("top", 77, W).translateX).toBe(77);
		expect(cardLayerVisual("next", 77, W).translateX).toBe(0);
		expect(cardLayerVisual("after", 77, W).translateX).toBe(0);
	});

	it("only the top layer rotates", () => {
		expect(cardLayerVisual("next", 999, W).rotateDeg).toBe(0);
		expect(cardLayerVisual("after", 999, W).rotateDeg).toBe(0);
	});
});

describe("cardLayerVisual — drag response", () => {
	it("next rises to exactly top's resting values at a full-width drag", () => {
		const v = cardLayerVisual("next", W, W);
		expect(v.scale).toBeCloseTo(1, 5);
		expect(v.opacity).toBeCloseTo(1, 5);
	});

	it("rise is symmetric — a left drag lifts the next card as much as right", () => {
		expect(cardLayerVisual("next", -150, W)).toEqual(
			cardLayerVisual("next", 150, W),
		);
	});

	it("the after layer does NOT rise (only the card directly behind does)", () => {
		expect(cardLayerVisual("after", W, W)).toMatchObject({
			scale: 0.88,
			opacity: 0.25,
		});
	});

	it("rise is clamped past a full-width drag, never overshooting opaque", () => {
		const v = cardLayerVisual("next", W * 3, W);
		expect(v.opacity).toBe(1);
		expect(v.scale).toBe(1);
	});

	it("reaches ±8° exactly at the 35% commit threshold, then clamps", () => {
		const span = W * SWIPE_THRESHOLD_RATIO;
		expect(cardLayerVisual("top", span, W).rotateDeg).toBeCloseTo(
			FOLLOW_ROTATION_DEG,
			5,
		);
		expect(cardLayerVisual("top", -span, W).rotateDeg).toBeCloseTo(
			-FOLLOW_ROTATION_DEG,
			5,
		);
		expect(cardLayerVisual("top", span * 4, W).rotateDeg).toBe(
			FOLLOW_ROTATION_DEG,
		);
		expect(cardLayerVisual("top", 0, W).rotateDeg).toBe(0);
	});

	it("survives a zero cardWidth without NaN (first render before layout)", () => {
		for (const r of ROLES) {
			const v = cardLayerVisual(r, 50, 0);
			expect(Number.isNaN(v.rotateDeg)).toBe(false);
			expect(Number.isNaN(v.scale)).toBe(false);
			expect(Number.isNaN(v.opacity)).toBe(false);
		}
	});
});
