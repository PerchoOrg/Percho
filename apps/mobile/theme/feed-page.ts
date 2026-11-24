/**
 * The feed page's arithmetic (phase380): the place block and the card sit
 * together at the BOTTOM of the page, the card a fixed step above the tab
 * bar, and whatever the screen has left over goes above the block.
 *
 *     status bar
 *     ── room (whatever is left; 20–46pt on the shipping phones) ──
 *     place row · 8 · figures row        ← `PlaceBlock`
 *     14
 *     card, the film's own shape
 *     12
 *     tab bar
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * Owner on phase379 (block above the card, card where it always was): "card
 * 下方空隙多了 整体向下或者增大上面的文字 你重新设计". The card was capped at the
 * film's shape and floated with two thirds of the page's slack under it —
 * 52–71pt between the card and the tab bar. Both of his ways out are taken:
 * everything moves down (the card hangs 12 above the tab bar), and the text
 * above it is larger (`PlaceBlock`: a 16pt line, 26pt figures). The card is
 * also 16pt wider (an 8pt gutter, as phase378 had it), which is the film
 * taking the room rather than paper.
 *
 * ── Why the page is laid out by sum ─────────────────────────────────────────
 *
 * The stage is given exactly the card's height, so `SwipeStack` finds no
 * slack to share out and the card rests at the stage's top; the room above
 * the block is a flex spacer. Only the short-screen fallback needs this
 * module to know the block's height.
 *
 * ── The block gives way before the film does ────────────────────────────────
 *
 * Every phone from the 13 mini up shows both rows. On a shorter one the
 * figures row goes first, then the whole block; the film is cut only when it
 * does not fit on its own.
 *
 * React-native-free, so `theme/*.test.ts` can run it per device.
 */
import { CANVAS_ASPECT } from "./card-frame";
import { headerScale } from "./header-scale";

/**
 * Paper each side of the card. 8 makes the card 16pt wider than the 16 it
 * had through phase379 — on a 3x screen up to 1.18x the 1080px source;
 * `theme/card-aspect.test.ts` holds the ceiling.
 */
export const GUTTER = 8;
/** Card → tab bar. */
export const CARD_FOOT = 12;
/** Block → card. */
export const BLOCK_GAP = 14;
/** Status bar → block, at least. */
export const MIN_ROOM = 8;

/** The block's rows at 390 wide; all three scale with `headerScale`. */
export const PLACE_ROW = 44;
export const ROW_GAP = 8;
export const FACTS_ROW = 48;

/** Which of the block's rows the screen has room for. */
export type BlockRows = "both" | "place" | "none";

export interface FeedPage {
	cardWidth: number;
	/** 0 until the screen has been measured. */
	cardHeight: number;
	rows: BlockRows;
}

/** The block's height at a screen width, for the rows given. */
export function blockHeight(width: number, rows: BlockRows): number {
	const k = headerScale(width);
	if (rows === "both") return (PLACE_ROW + ROW_GAP + FACTS_ROW) * k;
	if (rows === "place") return PLACE_ROW * k;
	return 0;
}

/**
 * @param width          the window's width
 * @param contentHeight  the page's own height, between the status bar (and
 *                       the offline bar, when shown) and the tab bar; 0
 *                       before it is measured
 */
export function feedPage(width: number, contentHeight: number): FeedPage {
	const cardWidth = Math.max(0, width - GUTTER * 2);
	if (!(contentHeight > 0) || cardWidth === 0) {
		return { cardWidth, cardHeight: 0, rows: "both" };
	}
	const film = cardWidth / CANVAS_ASPECT;
	const room = contentHeight - CARD_FOOT - film - BLOCK_GAP - MIN_ROOM;
	if (room >= blockHeight(width, "both")) {
		return { cardWidth, cardHeight: film, rows: "both" };
	}
	if (room >= blockHeight(width, "place")) {
		return { cardWidth, cardHeight: film, rows: "place" };
	}
	return {
		cardWidth,
		// The film whole when it fits alone; otherwise the screen caps it and
		// `cover` trims its sides.
		cardHeight: Math.min(film, contentHeight - CARD_FOOT - MIN_ROOM),
		rows: "none",
	};
}
