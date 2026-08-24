/**
 * The feed card's aspect must stay on the tour canvas, on every iPhone.
 *
 * Both tour pipelines render 1080x1576 — aspect 0.685 — and every card face
 * plays that film with `fit="cover"`, so the card's own aspect is what decides
 * how much of the video is thrown away. The canvas was CHOSEN to match the
 * card (see `tour-orchestrator/scheduler.ts`), which makes the card's aspect a
 * cross-repo contract rather than a layout detail.
 *
 * Two constants set it, and they are in different files:
 *
 *   · `GUTTER`            — `app/(tabs)/feed.tsx`, sets the card's WIDTH
 *   · `CARD_FRAME_RATIO`  — `theme/card-frame.ts`, sets the card's HEIGHT
 *
 * Moving either one alone moves the aspect. That is exactly what this file
 * exists to catch: on 2026-08-23 the card grew (gutter 37→16) and the ratio
 * had to go 0.73→0.83 in the same pass to hold the frame still. A future
 * "just make the cards a bit wider" that touches only the gutter would
 * silently start cropping the tour's height, and nothing else would fail.
 *
 * Read as text, like `listing-layout.test.ts` — `feed.tsx` pulls in the RN
 * runtime and this suite is deliberately RN-free (see `vitest.config.ts`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CARD_FRAME_RATIO } from "./card-frame";

const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");

/** The canvas both tour pipelines render, as `w / h`. */
const CANVAS_ASPECT = 1080 / 1576;

/** `CardVideo`'s own slack before it treats a source as a different shape. */
const TOLERANCE = 0.05;

/** The feed's fixed chrome, in points — everything the stage is NOT. */
const CHROME_ROW = 44;
const TAB_BAR = 62;
const STACK_PAD_V = 12 + 10;

/** width, height, top safe inset, bottom safe inset — points. */
const DEVICES: readonly [string, number, number, number, number][] = [
	["iPhone 13 mini", 375, 812, 50, 34],
	["iPhone 14 / 13", 390, 844, 47, 34],
	["iPhone 15 / 16", 393, 852, 59, 34],
	["iPhone 16 Pro", 402, 874, 62, 34],
	["iPhone 15 Pro Max", 430, 932, 59, 34],
	["iPhone 16 Pro Max", 440, 956, 62, 34],
];

function gutter(): number {
	const m = FEED.match(/^const GUTTER = (\d+);$/m);
	if (!m?.[1]) throw new Error("GUTTER not found in app/(tabs)/feed.tsx");
	return Number(m[1]);
}

function cardAspect(w: number, h: number, top: number, bottom: number): number {
	const stage = h - top - CHROME_ROW - (TAB_BAR + bottom) - STACK_PAD_V;
	return (w - gutter() * 2) / (stage * CARD_FRAME_RATIO);
}

describe("feed card aspect vs the tour canvas", () => {
	it("keeps GUTTER and CARD_FRAME_RATIO in step across the lineup", () => {
		for (const [name, w, h, top, bottom] of DEVICES) {
			const aspect = cardAspect(w, h, top, bottom);
			const drift = Math.abs(aspect - CANVAS_ASPECT) / CANVAS_ASPECT;
			expect(
				drift,
				`${name}: card aspect ${aspect.toFixed(3)} is ${(drift * 100).toFixed(1)}% off the 0.685 canvas — move GUTTER and CARD_FRAME_RATIO together`,
			).toBeLessThan(TOLERANCE);
		}
	});

	/**
	 * The SE is the one screen this cannot hold: its short body gives the fixed
	 * 128pt of chrome a much larger share of the height, so the stage is
	 * proportionally shorter and the card comes out wider than the canvas. The
	 * scheduler's header documents the resulting ~14% height crop as accepted,
	 * and the label sits title-safe to survive it. Asserted so the number is a
	 * decision on record rather than something nobody measured.
	 */
	it("accepts the iPhone SE's wider frame, within its documented crop", () => {
		const aspect = cardAspect(375, 667, 20, 0);
		expect(aspect).toBeGreaterThan(CANVAS_ASPECT);
		expect(1 - CANVAS_ASPECT / aspect).toBeLessThan(0.16);
	});

	/**
	 * The card is 1080px wide on a 3x screen at 360pt. Past that it is
	 * upsampling its own source. The Max phones deliberately sit a little over
	 * (owner, 2026-08-23), so this is a ceiling on the OVERSHOOT, not on the
	 * width — it fails if someone widens the card far enough to actually show.
	 */
	it("does not outrun the 1080px source by more than ~15%", () => {
		for (const [name, w, , ,] of DEVICES) {
			const k = ((w - gutter() * 2) * 3) / 1080;
			expect(
				k,
				`${name}: card is ${k.toFixed(2)}x the source width`,
			).toBeLessThan(1.15);
		}
	});
});
