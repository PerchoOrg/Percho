/**
 * The feed card's shape against the tour canvas.
 *
 * Both tour pipelines render 1080x1576 (aspect 0.685) and the card plays it
 * `fit="cover"`, so the card's own aspect decides how much of the film is
 * thrown away. Since phase181 the height is DERIVED from that canvas
 * (`theme/card-frame.ts`: `min(stage, width / CANVAS_ASPECT)`) instead of being
 * a share of the stage kept in step with `GUTTER` by hand — so the interesting
 * question moved. It is no longer "do two constants still agree"; it is "on
 * which screens is the stage too short for the film's shape, and how much does
 * that cost".
 *
 * The header above the stage is now content (city, stats, community strip), so
 * its height is modelled here rather than read from a constant — see
 * `HEADER_MODEL`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANVAS_ASPECT, cardAspect, cardFrameHeight } from "./card-frame";

const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");

/** The feed's fixed chrome below the stage, in points. */
const TAB_BAR = 62;
const STACK_PAD_V = 12 + 10;

/**
 * The place header's height, modelled from its own type metrics
 * (`components/feed/PlaceHeader.tsx` + `CommunityStrip.tsx`):
 *
 *   4 padding + 12 eyebrow + 2 + 34 title + 2 + 19 stats
 *   + 10 strip margin + 56 cover + 4 + 12 name  =  155
 *
 * A model, not a measurement — RN does the real layout. The assertions below
 * are written with enough slack that ±10pt here cannot flip them.
 */
const HEADER_MODEL = 155;

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

function stageFor(h: number, top: number, bottom: number): number {
	return h - top - HEADER_MODEL - (TAB_BAR + bottom) - STACK_PAD_V;
}

/** What `cover` throws away horizontally, as a share of the film's width. */
function sideCrop(aspect: number): number {
	return aspect <= CANVAS_ASPECT ? 0 : 1 - CANVAS_ASPECT / aspect;
}

describe("cardFrameHeight", () => {
	it("draws the canvas's own shape when the stage allows", () => {
		// 396 wide with room to spare: the card is exactly 0.685, no crop.
		expect(cardFrameHeight(700, 396)).toBeCloseTo(396 / CANVAS_ASPECT, 5);
		expect(cardAspect(700, 396)).toBeCloseTo(CANVAS_ASPECT, 5);
	});

	it("never grows past the stage", () => {
		// A short stage caps the height; the card is then WIDER than the canvas
		// and `cover` crops the film's sides.
		expect(cardFrameHeight(400, 396)).toBe(400);
		expect(cardAspect(400, 396)).toBeGreaterThan(CANVAS_ASPECT);
	});

	it("returns 0 before the stage is measured", () => {
		// Pre-layout: the cards must not paint a wrong frame and then jump.
		expect(cardFrameHeight(0, 396)).toBe(0);
		expect(cardFrameHeight(700, 0)).toBe(0);
	});
});

describe("the shipping lineup", () => {
	it("keeps the film's side crop under 3% on every current iPhone", () => {
		for (const [name, w, h, top, bottom] of DEVICES) {
			const width = w - gutter() * 2;
			const aspect = cardAspect(stageFor(h, top, bottom), width);
			expect(
				sideCrop(aspect),
				`${name}: card aspect ${aspect.toFixed(3)} crops ${(sideCrop(aspect) * 100).toFixed(1)}% of the film`,
			).toBeLessThan(0.03);
		}
	});

	/**
	 * The SE is the one screen this cannot hold: its short body gives the fixed
	 * chrome a much larger share of the height, so the stage caps the card well
	 * before the film's shape is reached. Asserted so the number is a decision
	 * on record rather than something nobody measured — and so it fails loudly
	 * if the header grows enough to make it worse.
	 */
	it("accepts the iPhone SE's wider frame, within its documented crop", () => {
		const aspect = cardAspect(stageFor(667, 20, 0), 375 - gutter() * 2);
		expect(aspect).toBeGreaterThan(CANVAS_ASPECT);
		expect(sideCrop(aspect)).toBeLessThan(0.2);
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
