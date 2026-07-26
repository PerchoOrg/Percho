/**
 * Pure swipe-decision core — the one place the §0.5 gesture contract is
 * encoded as testable logic. Given a pan's end state, decide whether it is a
 * committed horizontal swipe and in which direction.
 *
 * Contract (spec-v3 §0.5, non-negotiable):
 *   - threshold  = card width × 35%  → commit
 *   - velocity   > 800 pt/s          → commit (direct decision, any distance)
 *   - sector     = ±30° off horizontal; outside the sector it is NOT a
 *                  horizontal swipe (the ScrollView owns vertical gestures)
 *
 * Spec ambiguity resolved here (§0.5 is silent; DEVLOG 2026-07-26): a release
 * velocity above the velocity threshold that points AGAINST the drag direction
 * is a reversal, and nothing commits. A yank-back cancels a past-threshold drag,
 * and a card dragged left never flies out right.
 *
 * Marked `'worklet'` so it can run inline on the UI thread from a gesture
 * handler; it is a plain function otherwise and is unit-tested on the JS
 * thread (see decide-swipe.test.ts).
 */

export interface SwipeInput {
	translationX: number;
	translationY: number;
	velocityX: number;
	cardWidth: number;
}

export type SwipeDecision = "none" | "left" | "right";

export const SWIPE_THRESHOLD_RATIO = 0.35;
export const SWIPE_VELOCITY_PTS = 800;
export const SWIPE_SECTOR_DEG = 30;

export function decideSwipe(input: SwipeInput): SwipeDecision {
	"worklet";
	const { translationX, translationY, velocityX, cardWidth } = input;

	// An unmeasured card (onLayout hasn't run) would make the threshold 0, so a
	// pixel of jitter would commit. Nothing is swipeable until it has a width.
	if (cardWidth <= 0) return "none";

	const absX = Math.abs(translationX);
	const absY = Math.abs(translationY);

	// Sector gate first: a gesture more than ±30° off horizontal is vertical
	// territory and carries no feed semantics — hand it back to the ScrollView.
	const angleDeg = (Math.atan2(absY, absX) * 180) / Math.PI;
	if (angleDeg > SWIPE_SECTOR_DEG) return "none";

	const passedThreshold = absX >= cardWidth * SWIPE_THRESHOLD_RATIO;
	const passedVelocity = Math.abs(velocityX) > SWIPE_VELOCITY_PTS;
	if (!passedThreshold && !passedVelocity) return "none";

	// A decisive velocity pointing against the drag means the finger reversed:
	// the user is pulling the card back, so nothing commits. This covers both a
	// yank-back from past the threshold and a small leftward drag released with a
	// fast rightward flick — neither should fly the card out.
	if (passedVelocity) {
		if (translationX !== 0 && translationX * velocityX < 0) return "none";
		return velocityX > 0 ? "right" : "left";
	}

	if (translationX === 0) return "none";
	return translationX > 0 ? "right" : "left";
}

export interface ThresholdLatchInput {
	translationX: number;
	cardWidth: number;
	/** Whether the threshold crossing has already fired for this drag. */
	latched: boolean;
}

export interface ThresholdLatchResult {
	/** Fire `haptics.swipeThreshold` (selectionAsync) now. */
	fire: boolean;
	/** New latch value to carry into the next frame. */
	latched: boolean;
}

/**
 * Threshold-haptic latch (§0.5): `selectionAsync` fires the instant a swipe
 * crosses the commit threshold, but only rightward — pass (left) is silent.
 * Re-crossing after a retreat fires again; holding past the threshold does not.
 */
export function stepThresholdLatch(
	input: ThresholdLatchInput,
): ThresholdLatchResult {
	"worklet";
	const { translationX, cardWidth, latched } = input;
	const pastRight =
		cardWidth > 0 && translationX >= cardWidth * SWIPE_THRESHOLD_RATIO;
	if (pastRight && !latched) return { fire: true, latched: true };
	if (!pastRight && latched) return { fire: false, latched: false };
	return { fire: false, latched };
}
