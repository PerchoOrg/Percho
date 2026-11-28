import { describe, expect, it } from "vitest";
import {
	FALL_FROM,
	FALL_HEIGHTS,
	MARK_FROM_SCALE,
	MARK_IN,
	WASH_OPACITY,
	dismissExit,
} from "./dismiss-exit";

const H = 540;

describe("dismissExit — mark, read, fall", () => {
	it("starts as the card at rest, with no mark and no grey", () => {
		expect(dismissExit(0, H)).toEqual({
			markOpacity: 0,
			markScale: MARK_FROM_SCALE,
			wash: 0,
			dropY: 0,
			turnDeg: 0,
			opacity: 1,
		});
	});

	it("lands the mark before anything else moves", () => {
		const e = dismissExit(MARK_IN, H);
		expect(e.markOpacity).toBe(1);
		expect(e.markScale).toBeCloseTo(1, 5);
		expect(e.dropY).toBe(0);
		expect(e.opacity).toBe(1);
	});

	it("holds the marked, greyed card still until the fall", () => {
		for (const t of [0.3, 0.45, FALL_FROM]) {
			const e = dismissExit(t, H);
			expect(e.wash).toBeCloseTo(WASH_OPACITY, 5);
			expect(e.dropY).toBe(0);
			expect(e.turnDeg).toBe(0);
			expect(e.opacity).toBe(1);
		}
	});

	it("ends past the card's own bottom edge and invisible", () => {
		const e = dismissExit(1, H);
		expect(e.dropY).toBeCloseTo(H * FALL_HEIGHTS, 5);
		expect(e.dropY).toBeGreaterThan(H);
		expect(e.opacity).toBe(0);
	});

	it("only ever falls: the drop never comes back up", () => {
		let last = 0;
		for (let t = 0; t <= 1.0001; t += 0.05) {
			const { dropY } = dismissExit(t, H);
			expect(dropY).toBeGreaterThanOrEqual(last);
			last = dropY;
		}
	});

	it("stays in range for a value a spring might overshoot to", () => {
		expect(dismissExit(-0.1, H).markOpacity).toBe(0);
		expect(dismissExit(1.2, H).opacity).toBe(0);
		expect(dismissExit(1.2, H).dropY).toBeCloseTo(H * FALL_HEIGHTS, 5);
	});
});
