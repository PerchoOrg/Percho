/**
 * The resting + dragging visuals of the card window (§0.6 #7), as one pure
 * function of a card's position in the stack.
 *
 * ## Why this is a pure function of an ABSOLUTE position
 *
 * Two independent problems forced this shape, both of which showed up on device
 * as visual artefacts and neither of which is a tuning issue.
 *
 * **1. Reanimated does not revert props a detached style wrote.** Cards are keyed
 * by ITEM identity so a promoted card keeps its subtree (the `CardVideo` player
 * survives the swipe). That means the animated style attached to a given view is
 * swapped as it is promoted. A style that set only `transform` inherited the
 * `opacity: 0.5` its predecessor wrote and the promoted card stayed translucent —
 * two or three titles legible at once. So every layer must write the SAME prop
 * set, which is why there is exactly one function and it always returns all four
 * keys (asserted in `stack-layer.test.ts`).
 *
 * **2. The index advance and the offset reset land on different frames.** The
 * swipe ends on the UI thread; the deck advances through React state. Resetting
 * the drag offset in one pipeline and the index in the other means that for a
 * frame or two the outgoing card is still in the top slot with a zeroed offset —
 * it snaps back to centre and flashes before being replaced. That was the "jump"
 * after every swipe.
 *
 * The fix is to make the visual a function of the card's absolute index rather
 * than its slot, and to advance the UI-thread cursor, zero the drag and hand the
 * flyout position to `exitX` in ONE worklet. Because a card's absolute index
 * never changes, the value this function returns for a given card is identical
 * before and after React's re-render — so the late re-render is a visual no-op
 * no matter which frame it lands on. `rel` is the only thing that moves, and
 * `advance` moves with it by exactly the same amount:
 *
 *     depth = rel - advance
 *     before the atomic frame:  rel = 1, advance → 1   ⇒ depth 0
 *     after  the atomic frame:  rel = 0, advance = 0   ⇒ depth 0   (identical)
 *
 * That identity is the whole design; `stack-layer.test.ts` asserts it directly
 * as the handoff-continuity case.
 */
import { SWIPE_THRESHOLD_RATIO } from "./decide-swipe";

/** ±8° follow-rotation (§0.5), applied to the card under the finger only. */
export const FOLLOW_ROTATION_DEG = 8;

/**
 * How many cards the buyer can see at once (§0.6 #7): the top card plus the two
 * behind it. `SwipeStack` mounts exactly this many live cards.
 *
 * Exported because anything that SPLICES the deck has to know it. A card within
 * this distance of the cursor has already been seen — it was peeking out from
 * under the card being dragged — so inserting there swaps a card out from under
 * the buyer's eyes. `insertMilestone` depends on this for exactly that reason;
 * two independent copies of "3" would let the two drift apart silently.
 */
export const VISIBLE_WINDOW = 3;

/**
 * §0.6 #7 resting values by integer depth: top, the one behind, the one behind
 * that. Depth is continuous, so these are the interpolation knots.
 */
export const STACK_RESTING: readonly { scale: number; opacity: number }[] = [
	{ scale: 1, opacity: 1 },
	{ scale: 0.94, opacity: 0.5 },
	{ scale: 0.88, opacity: 0.25 },
];

export interface CardLayerVisual {
	translateX: number;
	rotateDeg: number;
	scale: number;
	opacity: number;
}

export interface CardStackInput {
	/**
	 * This card's index minus the cursor: 0 = top, 1 = behind it, 2 = behind
	 * that, and NEGATIVE for a card that has already been swiped away and is
	 * still flying out (or waiting to unmount).
	 */
	rel: number;
	/** Stack-shuffle progress in [0,1] — how far the top card is toward gone. */
	advance: number;
	/** Live drag offset of the card under the finger. */
	dragX: number;
	/** Where a card that has already committed is flying out to. */
	exitX: number;
	cardWidth: number;
}

/** Linear interpolation across the resting knots at a continuous depth. */
function restingAt(depth: number): { scale: number; opacity: number } {
	"worklet";
	const last = STACK_RESTING.length - 1;
	const d = Math.max(0, Math.min(depth, last));
	const lo = Math.floor(d);
	const hi = Math.min(lo + 1, last);
	const t = d - lo;
	const a = STACK_RESTING[lo] as { scale: number; opacity: number };
	const b = STACK_RESTING[hi] as { scale: number; opacity: number };
	return {
		scale: a.scale + (b.scale - a.scale) * t,
		opacity: a.opacity + (b.opacity - a.opacity) * t,
	};
}

export function cardStackVisual({
	rel,
	advance,
	dragX,
	exitX,
	cardWidth,
}: CardStackInput): CardLayerVisual {
	"worklet";
	// A card at or past the top is the only one that translates. `rel < 0` is the
	// outgoing card: it reads `exitX`, which was handed its final flyout position
	// in the same worklet that moved the cursor, so it stays off-screen through
	// the frames before React unmounts it instead of snapping back to centre.
	const isMoving = rel <= 0;
	const offset = rel < 0 ? exitX : dragX;
	const translateX = isMoving ? offset : 0;

	// ±8° across the drag the user can actually perform: the card commits at 35%
	// of its width, so interpolating over the full width would cap at ~2.8°.
	const span = cardWidth * SWIPE_THRESHOLD_RATIO;
	const unit =
		isMoving && span > 0 ? Math.max(-1, Math.min(1, offset / span)) : 0;

	const { scale, opacity } = restingAt(rel - advance);

	return {
		translateX,
		rotateDeg: unit * FOLLOW_ROTATION_DEG,
		scale,
		opacity,
	};
}

/**
 * How far the top card is toward being gone, from its drag offset. Drives the
 * shuffle while the finger is down; the commit path animates the same value to 1
 * so the stack keeps moving after the finger lifts.
 */
export function advanceFromDrag(dragX: number, cardWidth: number): number {
	"worklet";
	if (cardWidth <= 0) return 0;
	return Math.min(Math.abs(dragX) / cardWidth, 1);
}
