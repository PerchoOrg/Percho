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
	const absX = Math.abs(translationX);
	const absY = Math.abs(translationY);

	// Sector gate first: a gesture more than ±30° off horizontal is vertical
	// territory and carries no feed semantics — hand it back to the ScrollView.
	const angleDeg = (Math.atan2(absY, absX) * 180) / Math.PI;
	if (angleDeg > SWIPE_SECTOR_DEG) return "none";

	const passedThreshold = absX >= cardWidth * SWIPE_THRESHOLD_RATIO;
	const passedVelocity = Math.abs(velocityX) > SWIPE_VELOCITY_PTS;
	if (!passedThreshold && !passedVelocity) return "none";

	// Direction: distance decides when the threshold is met; otherwise the
	// fast flick's velocity sign decides.
	const signSource = passedThreshold ? translationX : velocityX;
	if (signSource === 0) return "none";
	return signSource > 0 ? "right" : "left";
}
