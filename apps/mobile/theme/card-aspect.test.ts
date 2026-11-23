/**
 * The feed card's shape against the tour canvas, and the page around it.
 *
 * Both tour pipelines render 1080x1576 (aspect 0.685) and the card plays it
 * `fit="cover"`, so the card's own aspect decides how much of the film is
 * thrown away. Since phase181 the height is DERIVED from that canvas
 * (`theme/card-frame.ts`), and the question this file answers is "on which
 * screens does the page leave the film whole, and what does it cost when it
 * does not".
 *
 * The page it models has changed three times. phase182: a header, the card,
 * and the slack centred around it. phase183: the handoff's header (86–98pt,
 * scaled with the screen) and the slack split a third above the card. And
 * phase378, now: NO header — the owner on it, 2026-11-23: "感觉还是以填充为主
 * 信息本身也和卡片有重合". The card starts under the status bar, 16pt wider,
 * and the place block sits under it (`theme/feed-page.ts`), giving way row by
 * row before the film is touched.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANVAS_ASPECT, cardAspect, cardFrameHeight } from "./card-frame";
import {
	BLOCK_FOOT,
	BLOCK_GAP,
	CARD_TOP,
	FACTS_ROW,
	GUTTER,
	PLACE_ROW,
	ROW_GAP,
	feedPage,
} from "./feed-page";
import { headerScale } from "./header-scale";

const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");
const STACK = readFileSync("components/SwipeStack.tsx", "utf8");

/** The feed's fixed chrome below the page, in points. */
const TAB_BAR = 62;

/** The screen's own height: what `feed.tsx` measures and hands `feedPage`. */
const contentOf = (h: number, top: number, bottom: number) =>
	h - top - (TAB_BAR + bottom);

/** width, height, top safe inset, bottom safe inset — points. */
const DEVICES: readonly [string, number, number, number, number][] = [
	["iPhone 13 mini", 375, 812, 50, 34],
	["iPhone 14 / 13", 390, 844, 47, 34],
	["iPhone 15 / 16", 393, 852, 59, 34],
	["iPhone 16 Pro", 402, 874, 62, 34],
	["iPhone 14 Plus", 428, 926, 47, 34],
	["iPhone 15 Pro Max", 430, 932, 59, 34],
	["iPhone 16 Pro Max", 440, 956, 62, 34],
];

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
			const page = feedPage(w, contentOf(h, top, bottom));
			const aspect = page.cardWidth / page.cardHeight;
			expect(
				sideCrop(aspect),
				`${name}: card aspect ${aspect.toFixed(3)} crops ${(sideCrop(aspect) * 100).toFixed(1)}% of the film`,
			).toBeLessThan(0.005);
		}
	});

	/**
	 * Both rows of the place block — the place line with Map, and the three
	 * figures — on every one of them, with paper left under it.
	 */
	it("has room for the whole place block under the card", () => {
		for (const [name, w, h, top, bottom] of DEVICES) {
			const content = contentOf(h, top, bottom);
			const page = feedPage(w, content);
			expect(page.rows, `${name}: rows`).toBe("both");
			const block = (PLACE_ROW + ROW_GAP + FACTS_ROW) * headerScale(w);
			const under =
				content - CARD_TOP - page.cardHeight - page.blockGap - block;
			expect(under, `${name}: paper under the block`).toBeGreaterThanOrEqual(
				BLOCK_FOOT,
			);
			expect(page.blockGap).toBe(BLOCK_GAP);
		}
	});

	/**
	 * The SE is the one body the page does not fit whole. Under the header it
	 * lost ~5% of the film's width (5.2% at phase183.5); now the figures row
	 * gives way instead and the film is whole, with the place line and Map
	 * under it.
	 */
	it("keeps the SE's film whole by dropping the figures row", () => {
		const page = feedPage(375, contentOf(667, 20, 0));
		expect(page.rows).toBe("place");
		expect(sideCrop(page.cardWidth / page.cardHeight)).toBe(0);
	});

	/** The block goes before the film is touched, and the film is cut only
	 * when it does not fit on its own. */
	it("gives up the block before it cuts the film", () => {
		const film = (390 - GUTTER * 2) / CANVAS_ASPECT;
		const justTheFilm = feedPage(390, film + CARD_TOP * 2);
		expect(justTheFilm.rows).toBe("none");
		expect(justTheFilm.cardHeight).toBeCloseTo(film, 5);
		const tooShort = feedPage(390, film - 40);
		expect(tooShort.rows).toBe("none");
		expect(tooShort.cardHeight).toBeLessThan(film);
	});

	it("draws nothing before the screen is measured", () => {
		// Pre-layout: the card must not paint a wrong frame and then jump.
		expect(feedPage(390, 0).cardHeight).toBe(0);
	});

	/**
	 * The stage is given exactly the card's height, so `SwipeStack` — which
	 * still shares out slack by `restTop` for any caller that leaves some —
	 * finds none and rests the card at the stage's top. Asserted as source
	 * because neither file can be executed in this RN-free suite.
	 */
	it("gives the stage the card's own height", () => {
		expect(FEED).toContain("height: CARD_TOP + page.cardHeight");
		expect(FEED).toContain("paddingTop: CARD_TOP");
		expect(STACK).toContain("(stageHeight - frameHeight) / 3");
	});

	/**
	 * The card is 1080px wide on a 3x screen at 360pt. Past that it is
	 * upsampling its own source. The Max phones have sat a little over since
	 * 2026-08-23 (1.13x at a 16pt gutter); the 8pt gutter of phase378 takes
	 * the widest of them to 1.18x, which is what the wider card costs. This
	 * is a ceiling on the OVERSHOOT — it fails if someone widens the card
	 * further without a bigger canvas.
	 */
	it("does not outrun the 1080px source by more than ~18%", () => {
		for (const [name, w, , ,] of DEVICES) {
			const k = ((w - GUTTER * 2) * 3) / 1080;
			expect(
				k,
				`${name}: card is ${k.toFixed(2)}x the source width`,
			).toBeLessThan(1.18);
		}
	});
});
