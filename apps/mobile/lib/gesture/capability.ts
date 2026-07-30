/**
 * Per-card gesture capability — what the top card is allowed to do.
 *
 * This lives in `lib/gesture` (not `lib/feed`) on purpose: `useSwipeCard` and
 * `SwipeStack` are generic over the card data type and must stay ignorant of
 * feed semantics. They consume this resolved capability; the feed layer decides
 * it (`lib/feed/behavior.ts`). A gesture handler therefore never branches on a
 * card kind — the §1.1 engineering red-line ("every handler must handle all 8
 * kinds") is satisfied structurally rather than by 8 null checks.
 *
 * ## No `flippable`
 *
 * The card used to have a second face: a tap crossfaded to a data face over
 * 350ms (§0.5), and that flip carried a whole sub-system — a `flipProgress`
 * shared value, a per-card face-opacity function, a `canFlipCard` predicate over
 * the rendered back node, and a rule that a flipped card must not pan. The owner
 * cut the mechanic entirely (2026-07-30: "砍掉flip back的功能"), so the card is
 * now single-faced and the only gesture on it is the pan. Every part of the flip
 * is gone rather than merely disabled — a dormant `flippable: false` flag would
 * keep the dead code compiling and re-attract the three device bugs it caused
 * (back-face flash on promotion, mid-crossfade swipe, stale static style).
 */

export interface CardCapability {
	/** False = the card does not follow the finger at all. */
	pannable: boolean;
	/**
	 * False = a past-threshold release still springs back. Milestone (§1.5) is
	 * `pannable: true, commits: false` — it follows the finger and returns. An
	 * unpannable card would be dead to the touch, which is not what §1.5 asks for.
	 */
	commits: boolean;
	/** Fraction of card width the drag is clamped to. 1 = unclamped. */
	maxDisplacementRatio: number;
}

/** A normal decide-and-fly card. */
export const DEFAULT_CAPABILITY: CardCapability = {
	pannable: true,
	commits: true,
	maxDisplacementRatio: 1,
};

/**
 * Nothing is interactive. Used when there is no top card at all, so the hook is
 * still called unconditionally (React's rules) but the gesture is dead.
 */
export const INERT_CAPABILITY: CardCapability = {
	pannable: false,
	commits: false,
	maxDisplacementRatio: 1,
};

/**
 * Clamp the drag to the card's allowed displacement (§1.5's "capped at 30%").
 *
 * Applied where `tx` is WRITTEN, not where it is read, because `tx` is published
 * to the caller: `TradeoffFace` brightens by it, `SwipeLabels` fades by it, and
 * the next card in the stack rises by it. An unclamped `tx` styled through a
 * clamped transform would keep all three responding past a cap the card visibly
 * honours, and would let the §0.5 threshold haptic fire on a milestone card —
 * telling the buyer "this vote counts" on a card that never commits.
 */
export function clampDisplacement(
	translationX: number,
	cardWidth: number,
	maxDisplacementRatio: number,
): number {
	"worklet";
	const cap = cardWidth * maxDisplacementRatio;
	if (cap <= 0) return translationX;
	if (translationX > cap) return cap;
	if (translationX < -cap) return -cap;
	return translationX;
}

/**
 * A committed direction, or "none" for a card that must always spring back.
 *
 * §1.5's milestone is `pannable: true, commits: false`: it follows the finger to
 * its cap and returns, and it must NOT reach `onDecision` at all. A
 * milestone that flies out is the exact opposite of a ceremony card — it would
 * consume the stage advance it exists to celebrate as if it were a swipe verdict.
 */
export function commitDecision<T extends string>(
	decision: T | "none",
	commits: boolean,
): T | "none" {
	"worklet";
	return commits ? decision : "none";
}

/**
 * Whether the pan may run at all this frame.
 *
 * `committed` exists because of a card that got STUCK on device — permanently,
 * not for a frame.
 *
 * The flyout is driven by animating `tx` to the exit position and doing the
 * handoff (advance the cursor, promote the next card) in that animation's
 * completion callback. Between commit and handoff the card is still on screen
 * with its gesture live for the length of the flyout spring. A second touch in
 * that window writes `tx` directly — which CANCELS the pending animation, and a
 * cancelled Reanimated animation never calls its callback. So the handoff never
 * ran, the cursor never advanced, and the card stayed on top forever: the buyer
 * could drag it around and it would spring back every time.
 *
 * A committed card is therefore inert until the handoff clears the flag. This
 * cannot be expressed with `.enabled()`: the flag flips without rebuilding the
 * gesture, and a rebuild mid-gesture would drop the touch binding (§1.1).
 *
 * This used to take `flipProgress` too, blocking the pan on a flipped card. The
 * flip is gone (see the module comment), so `committed` is the only gate left.
 */
export function panLive({
	pannable,
	committed,
}: {
	pannable: boolean;
	committed: boolean;
}): boolean {
	"worklet";
	return pannable && !committed;
}
