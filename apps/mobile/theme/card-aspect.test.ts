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
 * 「not well organized and immersive」), so the page is header, card at the
 * film's shape, and the slack CENTRED around the card (`SwipeStack`'s
 * `restTop`; owner: 「balance the empty space above and under card」).
 *
 * phase183: the header became the handoff's three-row block over the card —
 * 86pt where the old wordmark + place line were 78. phase183.4 added the
 * owner's 12pt of room above it and made the whole block scale with the
 * screen (`theme/header-scale.ts`), so the header is 94 on a 13 mini, 98 at
 * 390 and 107 on a 428. The model here is that page, and the SE case below is
 * the bill.
 *
 * phase379: the header is the place block now (the owner, 2026-11-23, on the
 * header: "信息本身也和卡片有重合"; then "numbers above the card"), at the
 * header's own 86. For one day before that (phase378) the block sat under the
 * card and the card hung from the top of the screen at an 8pt gutter.
 *
 * phase380, now: "card下方空隙多了 整体向下或者增大上面的文字". The page is laid
 * out from the bottom (`theme/feed-page.ts`): the card 12 above the tab bar
 * at an 8pt gutter, the larger block 14 above the card, and whatever is left
 * above the block. The tests below run that arithmetic per device.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANVAS_ASPECT, cardAspect, cardFrameHeight } from "./card-frame";
import {
	BLOCK_GAP,
	CARD_FOOT,
	MIN_ROOM,
	ROOM_ABOVE,
	ROOM_BELOW,
	blockHeight,
	cardWidthFor,
	feedPage,
} from "./feed-page";

const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");
const STACK = readFileSync("components/SwipeStack.tsx", "utf8");

/** The feed's fixed chrome below the page, in points. */
const TAB_BAR = 62;

/** The page's own height: what `feed.tsx` measures and hands `feedPage`. */
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
	 * "card下方空隙多了 整体向下或者增大上面的文字" (owner, 2026-11-24, on
	 * phase379): the gap under the card was 52–71pt. Then "整体向上再一点点":
	 * a quarter of the leftover goes back under the card. This pins it on every
	 * phone: the whole block fits, the room above it is real but not a hole,
	 * and the gap under the card stays small.
	 */
	it("sits the card low, the block on it, the leftover shared 3 : 1", () => {
		expect(CARD_FOOT).toBe(12);
		expect([ROOM_ABOVE, ROOM_BELOW]).toEqual([3, 1]);
		for (const [name, w, h, top, bottom] of DEVICES) {
			const content = contentOf(h, top, bottom);
			const page = feedPage(w, content);
			expect(page.rows, `${name}: rows`).toBe("both");
			const left =
				content -
				CARD_FOOT -
				page.cardHeight -
				BLOCK_GAP -
				blockHeight(w, "both");
			expect(left, `${name}: leftover`).toBeGreaterThanOrEqual(MIN_ROOM);
			const share = left / (ROOM_ABOVE + ROOM_BELOW);
			const above = share * ROOM_ABOVE;
			const under = CARD_FOOT + share * ROOM_BELOW;
			expect(above, `${name}: room above the block`).toBeGreaterThan(12);
			// 40 until phase414: the next card's strip took 6pt off the card's
			// width, 9 off its height, and the 14 Plus now has 41 above the block.
			expect(above, `${name}: room above the block`).toBeLessThan(42);
			expect(under, `${name}: gap under the card`).toBeLessThan(26);
		}
	});

	/**
	 * The SE is the one body the page does not fit whole. The block gives way
	 * instead of the film: the figures row, then the place row. Under the old
	 * header it lost 5.2% of the film's width.
	 */
	it("keeps the SE's film whole by giving up the block", () => {
		const page = feedPage(375, contentOf(667, 20, 0));
		expect(page.rows).toBe("none");
		expect(sideCrop(page.cardWidth / page.cardHeight)).toBe(0);
	});

	/** The figures row goes first, the film is cut only when it does not fit
	 * on its own. */
	it("gives up the block before it cuts the film", () => {
		const film = cardWidthFor(390) / CANVAS_ASPECT;
		const placeOnly =
			CARD_FOOT + film + BLOCK_GAP + MIN_ROOM + blockHeight(390, "place");
		expect(feedPage(390, placeOnly).rows).toBe("place");
		const justTheFilm = feedPage(390, film + CARD_FOOT + MIN_ROOM);
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
	 * finds none and rests the card at the stage's top. The room is a flex
	 * spacer ABOVE the block. Asserted as source because neither file can be
	 * executed in this RN-free suite.
	 */
	it("gives the stage the card's own height and the room above the block", () => {
		expect(FEED).toContain("height: page.cardHeight");
		expect(FEED).toContain("paddingBottom: CARD_FOOT");
		expect(FEED.indexOf("<View style={styles.room} />")).toBeLessThan(
			FEED.indexOf("<PlaceBlock"),
		);
		expect(FEED.indexOf("<View style={styles.foot} />")).toBeGreaterThan(
			FEED.indexOf("styles.stackWrap,"),
		);
		expect(FEED).toContain("room: { flex: ROOM_ABOVE");
		expect(FEED).toContain("foot: { flex: ROOM_BELOW }");
		expect(STACK).toContain("(stageHeight - frameHeight) / 3");
	});

	/**
	 * The card is 1080px wide on a 3x screen at 360pt. Past that it is
	 * upsampling its own source. The Max phones have sat a little over since
	 * 2026-08-23 (1.13x at a 16pt gutter); the 8pt gutter takes the widest of
	 * them to 1.18x, which is what the wider card costs. This is a ceiling on
	 * the OVERSHOOT — it fails if someone widens the card further without a
	 * bigger canvas.
	 */
	it("does not outrun the 1080px source by more than ~18%", () => {
		for (const [name, w, , ,] of DEVICES) {
			const k = (cardWidthFor(w) * 3) / 1080;
			expect(
				k,
				`${name}: card is ${k.toFixed(2)}x the source width`,
			).toBeLessThan(1.18);
		}
	});
});
