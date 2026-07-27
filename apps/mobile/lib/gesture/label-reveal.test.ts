/**
 * The label-flash regression (§1.8).
 *
 * Symptom on device: "偶尔会出现好像有白色字体一闪而过 再消失" — a direction label
 * appearing at full strength for a frame or two on a card the buyer had never
 * dragged. Cause: `tx` is UI-thread state that survives a React remount of the
 * label, so whenever the top card changed without a completed swipe (deck
 * rebuild, undo, tap-driven advance), the label mounted reading the PREVIOUS
 * gesture's offset and painted immediately.
 *
 * The invariant that prevents it: a freshly mounted label is inert until rest has
 * been observed once, so a reveal is always attributable to a gesture that began
 * under the card now showing it.
 */
import { describe, expect, it } from "vitest";
import { REST_EPSILON, labelOpacity } from "./label-reveal";

const SPAN = 105; // 300 * 0.35

const call = (
	tx: number,
	armed: boolean,
	side: "left" | "right" = "right",
	span = SPAN,
) => labelOpacity({ tx, span, side, armed });

describe("labelOpacity — arming (the flash invariant)", () => {
	it("is invisible on an inherited offset, both directions", () => {
		expect(call(SPAN, false)).toEqual({ opacity: 0, armed: false });
		expect(call(-SPAN, false, "left")).toEqual({ opacity: 0, armed: false });
		expect(call(999, false)).toEqual({ opacity: 0, armed: false });
	});

	it("stays unarmed for as long as the inherited offset persists", () => {
		let armed = false;
		for (const tx of [400, 300, 200, 100, 10, 1]) {
			const r = call(tx, armed);
			expect(r.opacity).toBe(0);
			armed = r.armed;
		}
		expect(armed).toBe(false);
	});

	it("arms the moment the drag reaches rest, and reveals from then on", () => {
		const atRest = call(0, false);
		expect(atRest).toEqual({ opacity: 0, armed: true });
		expect(call(SPAN, atRest.armed).opacity).toBe(1);
	});

	it("treats sub-pixel residue as rest — a settling spring still arms", () => {
		expect(call(REST_EPSILON, false).armed).toBe(true);
		expect(call(-REST_EPSILON, false).armed).toBe(true);
		expect(call(REST_EPSILON + 0.01, false).armed).toBe(false);
	});

	it("never disarms once armed, at any offset", () => {
		for (const tx of [0, 1, -1, SPAN, -SPAN, 9999, -9999]) {
			expect(call(tx, true).armed).toBe(true);
		}
	});

	it("an armed label is still invisible at rest (arming is not revealing)", () => {
		expect(call(0, true).opacity).toBe(0);
	});
});

describe("labelOpacity — reveal ramp (§1.8)", () => {
	it("right reveals on positive drag only", () => {
		expect(call(SPAN / 2, true, "right").opacity).toBeCloseTo(0.5, 10);
		expect(call(-SPAN / 2, true, "right").opacity).toBe(0);
	});

	it("left reveals on negative drag only", () => {
		expect(call(-SPAN / 2, true, "left").opacity).toBeCloseTo(0.5, 10);
		expect(call(SPAN / 2, true, "left").opacity).toBe(0);
	});

	it("reaches exactly 1 at the commit threshold and clamps past it", () => {
		expect(call(SPAN, true).opacity).toBe(1);
		expect(call(SPAN * 3, true).opacity).toBe(1);
		expect(call(-SPAN * 3, true, "left").opacity).toBe(1);
	});

	it("is symmetric between the two sides", () => {
		for (const d of [1, 20, 60, SPAN]) {
			expect(call(d, true, "right").opacity).toBe(
				call(-d, true, "left").opacity,
			);
		}
	});

	it("never leaves [0,1] and never returns a non-finite number", () => {
		for (const tx of [-9999, -SPAN, -1, 0, 1, SPAN, 9999]) {
			for (const side of ["left", "right"] as const) {
				const o = call(tx, true, side).opacity;
				expect(Number.isFinite(o)).toBe(true);
				expect(o).toBeGreaterThanOrEqual(0);
				expect(o).toBeLessThanOrEqual(1);
			}
		}
	});

	it("is invisible when the card has no measured width yet", () => {
		expect(call(50, true, "right", 0).opacity).toBe(0);
		expect(call(50, true, "right", -1).opacity).toBe(0);
	});
});
