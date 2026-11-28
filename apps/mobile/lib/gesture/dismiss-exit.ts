/**
 * A disliked card's exit, as numbers (phase418).
 *
 * phase415's exit — the card sank 44pt, shrank and faded in a fifth of a
 * second — was over before it had said anything (owner, 2026-11-28: 「大拇指
 * 不喜欢的效果不够明显」). His pick off `/demos/card-round4-v1` is "A": a
 * thumbs-down lands on the middle of the card, the picture greys, and then the
 * card falls off the bottom. Three acts, so the buyer reads WHAT happened
 * before the card is gone:
 *
 *     0 ──── 0.19 ─────────── 0.60 ─────────── 1
 *     mark lands   it is read       the card falls
 *     grey comes on (to 0.24)
 *
 * `t` is `gone`: 0 → 1, linear, over the whole exit (`useSwipeCard`). Pure,
 * and a worklet, so the card's style can call it on the UI thread and a test
 * can call it here.
 */

/** The mark has landed by here. */
export const MARK_IN = 0.19;
/** The grey is fully on by here. */
export const WASH_IN = 0.24;
/** The card starts to fall here. */
export const FALL_FROM = 0.6;
/** How big the mark is when it first shows; it lands at 1. */
export const MARK_FROM_SCALE = 1.7;
/** The grey over the picture, at its fullest. */
export const WASH_OPACITY = 0.6;
/** How far the card turns as it falls. */
export const FALL_TURN_DEG = 7;
/** How far it falls, in card heights — past its own bottom edge. */
export const FALL_HEIGHTS = 1.12;

export interface DismissExit {
	/** The mark's opacity and size. */
	markOpacity: number;
	markScale: number;
	/** The grey wash over the picture. */
	wash: number;
	/** The card itself: how far down, how far turned, how solid. */
	dropY: number;
	turnDeg: number;
	opacity: number;
}

function unit(v: number): number {
	"worklet";
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function dismissExit(t: number, cardHeight: number): DismissExit {
	"worklet";
	const land = unit(t / MARK_IN);
	// Ease out: the mark arrives fast and settles.
	const settled = 1 - (1 - land) * (1 - land);
	const fall = unit((t - FALL_FROM) / (1 - FALL_FROM));
	// Ease in: it lets go, then drops.
	const dropped = fall * fall;
	return {
		markOpacity: land,
		markScale: MARK_FROM_SCALE - (MARK_FROM_SCALE - 1) * settled,
		wash: WASH_OPACITY * unit(t / WASH_IN),
		dropY: cardHeight * FALL_HEIGHTS * dropped,
		turnDeg: FALL_TURN_DEG * dropped,
		opacity: 1 - fall,
	};
}
