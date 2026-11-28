/**
 * The feed page's arithmetic (phase380): the place block and the card sit
 * together low on the page, and whatever the screen has left over is shared
 * out — three quarters above the block, a quarter under the card (phase381).
 *
 *     status bar
 *     ── room: ¾ of what is left (22–41pt on the shipping phones) ──
 *     place row · 8 · figures row        ← `PlaceBlock`
 *     14
 *     card, the film's own shape
 *     12 + ¼ of what is left (19–26pt)
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
 * slack to share out and the card rests at the stage's top; the leftover is
 * two flex spacers, `ROOM_ABOVE` : `ROOM_BELOW`. Only the short-screen
 * fallback needs this module to know the block's height.
 *
 * ── The share (owner, 2026-11-24) ───────────────────────────────────────────
 *
 * phase380 put all of it above the block and hung the card 12 above the tab
 * bar. Owner: "整体向上再一点点". A quarter of the leftover now goes under the
 * card, so the whole moves up by that much: ~12pt on his 428, ~5 on the mini
 * — a little everywhere, and never so much that the gap under the card he
 * asked to close comes back.
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
/**
 * The paper between two cards, and how much of the NEXT card shows past it at
 * the screen's right edge (phase414). The deck pages sideways now, and with
 * the card a gutter from both edges nothing on the page said there was a
 * second one. The card gives up 6pt of width for that strip — 9pt of height,
 * which the room above the block and the foot take 3 : 1. A wider strip costs
 * the film more than it tells the buyer.
 *
 * The gap equals `GUTTER` on purpose: the card BEFORE then ends exactly at the
 * screen's left edge, so the strip is only ever the next card — a 2pt sliver
 * of the last one on the left would read as a fault.
 */
export const CARD_GAP = 8;
export const NEXT_PEEK = 6;
/** Card → tab bar, at least; a share of the leftover is added to it. */
export const CARD_FOOT = 12;
/** How the leftover is shared: above the block : under the card. */
export const ROOM_ABOVE = 3;
export const ROOM_BELOW = 1;
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
/** The card: a gutter on its left, the gap and the next card's strip on its right. */
export function cardWidthFor(width: number): number {
	return Math.max(0, width - GUTTER - CARD_GAP - NEXT_PEEK);
}

export function feedPage(width: number, contentHeight: number): FeedPage {
	const cardWidth = cardWidthFor(width);
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
