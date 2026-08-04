/**
 * Arc geometry for the score ring.
 *
 * The ring is drawn with clipped, rotated bordered Views rather than svg (Expo Go
 * has no RNSVG native view managers — see the component header). That trick is
 * the kind of thing that looks plausible and is off by 45° or 180°, so the angles
 * are asserted rather than eyeballed.
 *
 * Model: 0° = 12 o'clock, clockwise. A View with top+right borders coloured
 * paints the span [θ-45, θ+135] when rotated by θ. The right window is the
 * aperture [0,180]; the left window is [180,360].
 */
import { describe, expect, it } from "vitest";
import { arcRotation } from "./arc";

/** What actually shows through a window: the span ∩ the aperture. */
function visible(pct: number, side: "left" | "right"): [number, number] | null {
	const t = arcRotation(pct, side);
	const span: [number, number] = [t - 45, t + 135];
	const ap: [number, number] = side === "right" ? [0, 180] : [180, 360];
	const lo = Math.max(span[0], ap[0]);
	const hi = Math.min(span[1], ap[1]);
	return hi > lo ? [lo, hi] : null;
}

describe("arcRotation", () => {
	it("paints [0, pct*360] and nothing more, at every quarter", () => {
		// Below halfway only the right window is mounted by the component.
		expect(visible(0.25, "right")).toEqual([0, 90]);
		expect(visible(0.5, "right")).toEqual([0, 180]);

		// Past halfway the right window is pinned solid and the left one carries
		// the remainder; the two must MEET at 180° with no gap and no overlap.
		expect(visible(0.75, "right")).toEqual([0, 180]);
		expect(visible(0.75, "left")).toEqual([180, 270]);

		expect(visible(0.83, "right")).toEqual([0, 180]);
		const left83 = visible(0.83, "left");
		expect(left83?.[0]).toBe(180);
		expect(left83?.[1]).toBeCloseTo(0.83 * 360, 6);
	});

	it("is empty at 0 and full at 1", () => {
		// Nothing painted: the span sits entirely left of the right aperture.
		expect(visible(0, "right")).toBeNull();
		expect(visible(1, "right")).toEqual([0, 180]);
		expect(visible(1, "left")).toEqual([180, 360]);
	});

	it("never lets the arc detach from 12 o'clock", () => {
		// The bug this pins: reusing the sub-50% rotation past halfway slid the
		// right window's arc off 0° and opened a gap at the top of the ring.
		for (const pct of [0.51, 0.6, 0.75, 0.9, 1]) {
			expect(visible(pct, "right")?.[0]).toBe(0);
		}
	});
});
