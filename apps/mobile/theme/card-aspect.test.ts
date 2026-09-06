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
import { coverSize, stripHeight } from "../lib/feed/community-strip";
import { CANVAS_ASPECT, cardAspect, cardFrameHeight } from "./card-frame";

const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");

/** The feed's fixed chrome below the stage, in points. */
const TAB_BAR = 62;
/** `CARD_INSET.top`, and `.bottom` — which is a FLOOR now, not a band. */
const PAD_TOP = 12;
const GAP_MIN = 16;

/**
 * The page, modelled the way the screen builds it (2026-09-06, final shape):
 * the card is pinned to the tour's aspect, the squares take what is spare, and
 * the leftover is the gap. `PLACE_HEADER_TEXT_HEIGHT` and `coverSize` are the
 * real values the screen uses, not copies — the only thing modelled here is
 * the tab bar, which belongs to the navigator.
 */
const HEADER_TEXT = 4 + 19 + 1 + 34;

function pageOf(w: number, h: number, top: number, bottom: number) {
	const cardWidth = w - gutter() * 2;
	const content = h - top - (TAB_BAR + bottom);
	const ideal = cardWidth / CANVAS_ASPECT;
	const spare = content - HEADER_TEXT - PAD_TOP - ideal - GAP_MIN;
	const cover = coverSize(cardWidth, spare);
	const stage = content - HEADER_TEXT - stripHeight(cover) - PAD_TOP - GAP_MIN;
	const gap = stage - Math.min(stage, ideal) + GAP_MIN;
	return { cardWidth, cover, stage, ideal, gap };
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
	 * ── The rule the owner set on 2026-09-06 ────────────────────────────────
	 *
	 * 「Don't cut film」. An earlier cut of this layout pinned the card between
	 * a taller header and a declared 40pt band, and the card came off the
	 * tour's shape — up to 7.3% of the film's width gone on a 13 mini. The
	 * priority is now inverted: the card is drawn at the canvas's aspect, the
	 * SQUARES take whatever height is spare, and the gap is the remainder
	 * (「40 pt empty is flexible」).
	 *
	 * So this asserts the film is whole on every shipping screen, and the next
	 * assertion shows where the give went.
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
	 * Where the give went: the squares shrink screen by screen, and the gap
	 * under the card is whatever is left over — 16 at worst.
	 *
	 *   iPhone 13 mini    58pt squares      iPhone 16 Pro       ~66
	 *   iPhone 14 / 13    ~64               iPhone 15 Pro Max   ~79
	 *   iPhone 15 / 16    ~63               iPhone 16 Pro Max   ~79
	 *
	 * The width rule (4.5 across the CARD's width, owner: 「it should not
	 * exceed card width」) is the ceiling; the height budget is what actually
	 * binds on the smaller bodies.
	 */
	it("shrinks the squares instead, and never below the legible floor", () => {
		for (const [name, w, h, top, bottom] of DEVICES) {
			const { cover, cardWidth, gap } = pageOf(w, h, top, bottom);
			expect(cover, `${name}: no strip`).not.toBeNull();
			const byWidth = (cardWidth - 4 * 10) / 4.5;
			expect(cover as number, `${name}: square`).toBeLessThanOrEqual(
				Math.ceil(byWidth),
			);
			expect(gap, `${name}: gap under the card`).toBeGreaterThanOrEqual(16);
		}
	});

	/**
	 * The SE has no room for both the film and a strip, and the film wins: the
	 * squares drop out entirely (`coverSize` returns null below the legible
	 * floor) rather than the card being squeezed. Asserted so the behaviour is
	 * a decision on record — a phone that quietly loses the strip is correct
	 * here, a phone that quietly crops the tour is not.
	 */
	it("drops the strip before it crops the film, on an SE", () => {
		const { cover, stage, cardWidth } = pageOf(375, 667, 20, 0);
		expect(cover).toBeNull();
		expect(sideCrop(cardAspect(stage, cardWidth))).toBeLessThan(0.005);
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
