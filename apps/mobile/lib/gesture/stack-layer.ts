/**
 * The resting + dragging visuals of the three-card window (§0.6 #7), as one
 * pure function over the layer role.
 *
 * Why this exists rather than three hand-written animated styles: cards in
 * `SwipeStack` are keyed by ITEM identity, not by position, so that promoting
 * the next card to top preserves its subtree (the CardVideo player survives the
 * swipe). The consequence is that a single view's animated style is SWAPPED as
 * it is promoted — and Reanimated does not revert the native props a detached
 * style already wrote. A `topStyle` that sets only `transform` therefore
 * inherits the `opacity: 0.5` the previous `nextStyle` left behind, which
 * renders the promoted card semi-transparent and lets the cards underneath
 * bleed through it — two or three titles legible at once.
 *
 * So every role must write the SAME set of props. Funnelling all three through
 * one function makes that structural instead of a comment someone has to
 * remember, and `stack-layer.test.ts` asserts the key parity directly.
 */
import { SWIPE_THRESHOLD_RATIO } from "./decide-swipe";

export type CardLayerRole = "top" | "next" | "after";

/** ±8° follow-rotation (§0.5), applied to the top card only. */
export const FOLLOW_ROTATION_DEG = 8;

export interface CardLayerVisual {
	translateX: number;
	rotateDeg: number;
	scale: number;
	opacity: number;
}

const RESTING: Record<CardLayerRole, { scale: number; opacity: number }> = {
	top: { scale: 1, opacity: 1 },
	next: { scale: 0.94, opacity: 0.5 },
	after: { scale: 0.88, opacity: 0.25 },
};

/**
 * @param tx live horizontal drag offset of the TOP card (already clamped).
 * @param cardWidth used both for the rotation span and the rise progress.
 */
export function cardLayerVisual(
	role: CardLayerRole,
	tx: number,
	cardWidth: number,
): CardLayerVisual {
	"worklet";
	if (role === "top") {
		// ±8° across the drag the user can actually perform: the card commits at
		// 35% of its width, so interpolating over the full width would cap at ~2.8°.
		const span = cardWidth * SWIPE_THRESHOLD_RATIO;
		const unit = span > 0 ? Math.max(-1, Math.min(1, tx / span)) : 0;
		return {
			translateX: tx,
			rotateDeg: unit * FOLLOW_ROTATION_DEG,
			scale: 1,
			opacity: 1,
		};
	}

	const rest = RESTING[role];
	// Only the card directly behind rises toward the top as the top card leaves.
	const p =
		role === "next" && cardWidth > 0
			? Math.min(Math.abs(tx) / cardWidth, 1)
			: 0;
	return {
		translateX: 0,
		rotateDeg: 0,
		scale: rest.scale + (1 - rest.scale) * p,
		opacity: rest.opacity + (1 - rest.opacity) * p,
	};
}
