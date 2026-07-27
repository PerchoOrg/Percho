/**
 * Per-card gesture capability — what the top card is allowed to do.
 *
 * This lives in `lib/gesture` (not `lib/feed`) on purpose: `useSwipeCard` and
 * `SwipeStack` are generic over the card data type and must stay ignorant of
 * feed semantics. They consume this resolved capability; the feed layer decides
 * it (`lib/feed/behavior.ts`). A gesture handler therefore never branches on a
 * card kind — the §1.1 engineering red-line ("every handler must handle all 8
 * kinds") is satisfied structurally rather than by 8 null checks.
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
	/** Tap crossfades to a data face (§0.5). */
	flippable: boolean;
}

/** A normal decide-and-fly card with a data face. */
export const DEFAULT_CAPABILITY: CardCapability = {
	pannable: true,
	commits: true,
	maxDisplacementRatio: 1,
	flippable: true,
};

/**
 * Nothing is interactive. Used when there is no top card at all, so the hook is
 * still called unconditionally (React's rules) but the gesture is dead.
 */
export const INERT_CAPABILITY: CardCapability = {
	pannable: false,
	commits: false,
	maxDisplacementRatio: 1,
	flippable: false,
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
 * §1.1 red line ("翻面态禁 swipe"): a flipped card does not pan.
 *
 * Takes the flip PROGRESS rather than a JS `flipped` boolean so the answer is
 * available on the UI thread mid-crossfade. Any progress at all blocks: a card
 * half-way through the 350ms fade is showing two faces, and swiping it out then
 * commits a verdict against a face the buyer was in the middle of leaving.
 */
export function panAllowed(pannable: boolean, flipProgress: number): boolean {
	"worklet";
	return pannable && flipProgress === 0;
}

/**
 * Whether the pan may run at all this frame.
 *
 * `committed` is the second gate, and it exists because of a card that got
 * STUCK on device — permanently, not for a frame.
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
 * This was originally found via the challenge card, whose 900ms post-commit hold
 * made the window ~1.2s wide. That hold is gone (the card is answered by buttons
 * now), so the window is back to a single flyout — but the gate stays: the race
 * is real at any width, and a fast double-swipe still hits it.
 *
 * A committed card is therefore inert until the handoff clears the flag. This
 * cannot be expressed with `.enabled()`: the flag flips without rebuilding the
 * gesture, and a rebuild mid-gesture would drop the touch binding (§1.1).
 */
export function panLive({
	pannable,
	flipProgress,
	committed,
}: {
	pannable: boolean;
	flipProgress: number;
	committed: boolean;
}): boolean {
	"worklet";
	return !committed && panAllowed(pannable, flipProgress);
}
