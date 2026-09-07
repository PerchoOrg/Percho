/**
 * `headerScale` — the above-card header's one factor (phase183.4).
 *
 * A real unit test rather than a source assertion: the function is pure and
 * RN-free precisely so this file and `theme/card-aspect.test.ts` can execute
 * it. What matters is the CLAMP, because that is the part that stops a screen
 * nobody has tested from redesigning the header.
 */
import { describe, expect, it } from "vitest";
import {
	HEADER_BASE_WIDTH,
	HEADER_SCALE_MAX,
	HEADER_SCALE_MIN,
	headerScale,
} from "./header-scale";

describe("headerScale", () => {
	/** The width the owner approved the proportions at. */
	it("is exactly 1 at the design width", () => {
		expect(HEADER_BASE_WIDTH).toBe(390);
		expect(headerScale(390)).toBe(1);
	});

	it("gives every shipping iPhone its own factor", () => {
		expect(headerScale(375)).toBe(0.962); // 13 mini, SE
		expect(headerScale(393)).toBe(1.008); // 15 / 16
		expect(headerScale(402)).toBe(1.031); // 16 Pro
		expect(headerScale(428)).toBe(1.097); // 15 Pro Max — the owner's phone
		expect(headerScale(440)).toBe(1.1); // 16 Pro Max, at the ceiling
	});

	/**
	 * Unclamped, an iPad in compatibility width would carry a 70pt serif over
	 * an 85pt row, and a narrow screen would take the title under the 13pt
	 * context line it sits above. Anything outside the range is treated as the
	 * biggest or smallest phone rather than as a new design.
	 */
	it("clamps rather than extrapolating", () => {
		expect(headerScale(1024)).toBe(HEADER_SCALE_MAX);
		expect(headerScale(320)).toBe(HEADER_SCALE_MIN);
		expect(HEADER_SCALE_MIN).toBeLessThan(1);
		expect(HEADER_SCALE_MAX).toBeGreaterThan(1);
	});

	/**
	 * `useWindowDimensions` reports 0 for a frame before layout. The header
	 * must draw its design size then, not collapse.
	 */
	it("falls back to 1 before the window is measured", () => {
		expect(headerScale(0)).toBe(1);
		expect(headerScale(Number.NaN)).toBe(1);
	});

	/** Three places, so a re-render at the same width cannot rebuild the sheet. */
	it("is stable to three places", () => {
		expect(headerScale(428)).toBe(headerScale(428));
		expect(String(headerScale(402)).split(".")[1]?.length ?? 0).toBeLessThan(4);
	});
});
