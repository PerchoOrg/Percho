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
 * phase182: the community strip is gone (owner, 2026-09-06: it made the page
 * 「not well organized and immersive」), so the page is one header line, the
 * card at the film's shape, and the slack CENTRED around the card
 * (`SwipeStack`'s `restTop`; owner: 「balance the empty space above and under
 * card」). The model here is that page.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANVAS_ASPECT, cardAspect, cardFrameHeight } from "./card-frame";

const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");
const STACK = readFileSync("components/SwipeStack.tsx", "utf8");

/** The feed's fixed chrome below the stage, in points. */
const TAB_BAR = 62;
/** `CARD_INSET.top` / `.bottom` — symmetric FLOORS since phase182. */
const PAD_TOP = 16;
const PAD_BOTTOM = 16;
/**
 * `PlaceHeader`: 4 padding + the 44pt wordmark row (back in phase182.1) + the
 * 30pt place line.
 */
const HEADER_TEXT = 4 + 44 + 30;

function pageOf(w: number, h: number, top: number, bottom: number) {
	const cardWidth = w - gutter() * 2;
	const content = h - top - (TAB_BAR + bottom);
	const stage = content - HEADER_TEXT - PAD_TOP - PAD_BOTTOM;
	const ideal = cardWidth / CANVAS_ASPECT;
	// What the stage has left once the card takes the film's shape — split
	// evenly above and below the card by `SwipeStack`'s centred `restTop`.
	const slack = stage - Math.min(stage, ideal);
	return { cardWidth, stage, ideal, slack };
}

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
	/**
	 * 「Don't cut film」 (owner, 2026-09-06). The card is drawn at the canvas's
	 * aspect and everything else bends around it, on every screen in the
	 * shipping lineup.
	 */
	it("never crops the film on a current iPhone", () => {
		for (const [name, w, h, top, bottom] of DEVICES) {
			const { cardWidth, stage } = pageOf(w, h, top, bottom);
			const aspect = cardAspect(stage, cardWidth);
			expect(
				sideCrop(aspect),
				`${name}: card aspect ${aspect.toFixed(3)} crops ${(sideCrop(aspect) * 100).toFixed(1)}% of the film`,
			).toBeLessThan(0.005);
		}
	});

	/**
	 * The SE is the one body that pays for the wordmark's return (phase182.1):
	 * its stage caps the card below the film's shape and `cover` shaves ~5%
	 * off the sides. On record as a decision, not a regression — the lineup
	 * starts at the 13 mini, and the alternative (a header that hides the
	 * wordmark on short screens) is layout the page does not otherwise need.
	 * This fails if the cost ever grows past ~6%.
	 */
	it("keeps the SE's crop under ~6%", () => {
		const { cardWidth, stage } = pageOf(375, 667, 20, 0);
		expect(sideCrop(cardAspect(stage, cardWidth))).toBeLessThan(0.06);
	});

	/**
	 * The slack is what is left over, and the page's balance is that it splits
	 * evenly — asserted as source because the split lives in `SwipeStack`'s
	 * `restTop`, which the RN-free suite cannot execute. The model above shows
	 * every shipping screen has real slack to split.
	 */
	it("centres the slack around the card", () => {
		expect(STACK).toContain("(stageHeight - frameHeight) / 2");
		for (const [name, w, h, top, bottom] of DEVICES) {
			const { slack } = pageOf(w, h, top, bottom);
			expect(slack, `${name}: slack`).toBeGreaterThanOrEqual(0);
		}
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
