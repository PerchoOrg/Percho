/**
 * §2.4 #3 slider-scale tests.
 *
 * Every bug a slider has is an arithmetic bug at an edge, and each one below was
 * a real hazard in the implementation: a thumb draggable past the end, a value
 * that prints as "3.6250000000000004%", and a NaN from a track measured at zero
 * width on the first frame (which would render "$NaN/mo" in the payment above it).
 */
import { describe, expect, it } from "vitest";
import {
	DOWN_SCALE,
	RATE_SCALE,
	fractionForValue,
	snapToScale,
	valueForOffset,
} from "./slider-scale";

describe("snapToScale", () => {
	it("clamps below min and above max", () => {
		expect(snapToScale(-1, DOWN_SCALE)).toBe(0);
		expect(snapToScale(9, DOWN_SCALE)).toBe(0.5);
	});

	it("quantises to the step", () => {
		expect(snapToScale(0.2049, DOWN_SCALE)).toBe(0.2);
		expect(snapToScale(0.2051, DOWN_SCALE)).toBe(0.21);
	});

	it("keeps rate values on real eighths, with no float dust", () => {
		// 0.03 + 5 * 0.00125 is 0.036250000000000004 in IEEE754, which prints as
		// "3.63%" through a naive formatter.
		expect(snapToScale(0.0362, RATE_SCALE)).toBe(0.03625);
		expect(snapToScale(0.065, RATE_SCALE)).toBe(0.065);
	});

	it("never exceeds max even when the range is not a whole number of steps", () => {
		const odd = { min: 0, max: 0.35, step: 0.04 };
		expect(snapToScale(0.35, odd)).toBeLessThanOrEqual(0.35);
	});

	it("degrades to a plain clamp for a non-positive step", () => {
		expect(snapToScale(0.3, { min: 0, max: 1, step: 0 })).toBe(0.3);
	});
});

describe("valueForOffset", () => {
	it("returns min for an unmeasured track instead of NaN", () => {
		// First frame: no width yet. NaN here becomes "$NaN/mo" in the payment.
		expect(valueForOffset(50, 0, DOWN_SCALE)).toBe(DOWN_SCALE.min);
		expect(valueForOffset(50, -1, DOWN_SCALE)).toBe(DOWN_SCALE.min);
	});

	it("maps the two ends and the middle", () => {
		expect(valueForOffset(0, 300, DOWN_SCALE)).toBe(0);
		expect(valueForOffset(300, 300, DOWN_SCALE)).toBe(0.5);
		expect(valueForOffset(150, 300, DOWN_SCALE)).toBe(0.25);
	});

	it("clamps a drag past either end of the track", () => {
		expect(valueForOffset(-80, 300, DOWN_SCALE)).toBe(0);
		expect(valueForOffset(999, 300, DOWN_SCALE)).toBe(0.5);
	});
});

describe("fractionForValue", () => {
	it("is 0 at min and 1 at max", () => {
		expect(fractionForValue(0, DOWN_SCALE)).toBe(0);
		expect(fractionForValue(0.5, DOWN_SCALE)).toBe(1);
	});

	it("round-trips with valueForOffset at the ends", () => {
		const v = valueForOffset(300, 300, RATE_SCALE);
		expect(fractionForValue(v, RATE_SCALE)).toBe(1);
	});

	it("clamps an out-of-range value rather than overflowing the track", () => {
		expect(fractionForValue(2, DOWN_SCALE)).toBe(1);
		expect(fractionForValue(-2, DOWN_SCALE)).toBe(0);
	});

	it("is 0 for a zero-width scale", () => {
		expect(fractionForValue(5, { min: 5, max: 5, step: 1 })).toBe(0);
	});
});

describe("the shipped scales", () => {
	it("puts the published 6.5% default exactly on a reachable rate step", () => {
		// If the default were unreachable, the slider would jump the instant it is
		// touched and the payment would change without the buyer asking.
		expect(snapToScale(0.065, RATE_SCALE)).toBe(0.065);
	});

	it("puts the 20% default on a reachable down step", () => {
		expect(snapToScale(0.2, DOWN_SCALE)).toBe(0.2);
	});
});
