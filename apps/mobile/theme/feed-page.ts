/**
 * The feed page's arithmetic (phase378): the card at the top of the screen
 * at the film's own shape, the place block under it, and whatever is left
 * under that.
 *
 * ── Why the page is laid out by sum, not by flex ────────────────────────────
 *
 * Until phase378 the stage was `flex: 1` under a header and the card floated
 * in it, a third of the slack above and two thirds below (`SwipeStack`'s
 * `restTop`). The film is 1080×1576 and is never cropped (owner, 2026-09-06:
 * 「Don't cut film」), so on every phone ~180pt of the page was not card, and
 * the header was drawn to occupy it — "感觉还是以填充为主" (owner, 2026-11-23).
 *
 * His pick ("方案2", `/demos/feed-above-card-v1`): no header. The card starts
 * under the status bar and the place line, Map and three figures sit under
 * it, beside the name and Explore. That is a fixed order of fixed things, so
 * the screen measures its own height once and this module says what fits:
 *
 *     8  · card (width ÷ 0.685) · 18 · place row · 10 · figures row · rest
 *
 * The stage is given exactly the card's height, so `SwipeStack` finds no
 * slack to share out and the card rests at its top.
 *
 * ── The block gives way before the film does ────────────────────────────────
 *
 * On a short screen the figures row goes first, then the whole block; the
 * film is cut only when it does not fit on its own. Every phone from the 13
 * mini up shows both rows; a 375×667 shows the place row and the whole film
 * (it lost ~5% of the film's width to the old header).
 *
 * React-native-free, so `theme/*.test.ts` can run it per device.
 */
import { CANVAS_ASPECT } from "./card-frame";
import { headerScale } from "./header-scale";

/**
 * Paper each side of the card. 16 until phase378; 8 makes the card 16pt wider
 * and the film ~9% larger in area, which is where the header's room went. On
 * a 3x screen the card is then up to 1.18x the 1080px source (it was 1.13x) —
 * `theme/card-aspect.test.ts` holds the ceiling.
 */
export const GUTTER = 8;
/** Under the status bar, above the card. */
export const CARD_TOP = 8;

/** The block's rows at 390 wide; both scale with `headerScale`. */
export const PLACE_ROW = 44;
export const FACTS_ROW = 44;
export const ROW_GAP = 10;
/** Card → block, and the least paper left under the block. */
export const BLOCK_GAP = 18;
export const BLOCK_FOOT = 12;
/** Card → block when only the place row fits — the short screen's version. */
export const BLOCK_GAP_TIGHT = 8;

/** Which of the block's rows the screen has room for. */
export type BlockRows = "both" | "place" | "none";

export interface FeedPage {
	cardWidth: number;
	/** 0 until the screen has been measured. */
	cardHeight: number;
	rows: BlockRows;
	/** Card → block, for the `rows` chosen. */
	blockGap: number;
}

/**
 * @param width          the window's width
 * @param contentHeight  the screen's own height between the status bar (and
 *                       the offline bar, when shown) and the tab bar; 0 before
 *                       it is measured
 */
export function feedPage(width: number, contentHeight: number): FeedPage {
	const cardWidth = Math.max(0, width - GUTTER * 2);
	if (!(contentHeight > 0) || cardWidth === 0) {
		return { cardWidth, cardHeight: 0, rows: "both", blockGap: BLOCK_GAP };
	}
	const k = headerScale(width);
	const film = cardWidth / CANVAS_ASPECT;
	const room = contentHeight - CARD_TOP - film;

	if (room >= BLOCK_GAP + (PLACE_ROW + ROW_GAP + FACTS_ROW) * k + BLOCK_FOOT) {
		return { cardWidth, cardHeight: film, rows: "both", blockGap: BLOCK_GAP };
	}
	if (room >= BLOCK_GAP_TIGHT + PLACE_ROW * k) {
		return {
			cardWidth,
			cardHeight: film,
			rows: "place",
			blockGap: BLOCK_GAP_TIGHT,
		};
	}
	return {
		cardWidth,
		// The film whole when it fits alone; otherwise the screen caps it and
		// `cover` trims its sides.
		cardHeight: Math.min(film, contentHeight - CARD_TOP * 2),
		rows: "none",
		blockGap: 0,
	};
}
