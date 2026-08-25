/**
 * Shared values that let interactive chrome (a card's tap targets) live inside
 * the pan-gesture area without a Pressable-vs-Pan conflict, plus the tiny
 * tap detector both readers use.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The stack's card is wrapped in `GestureDetector` running the `Gesture.Pan`.
 * RNGH's pan, configured with `activeOffsetX(±10)` (see use-swipe-card), FAILS
 * (never activates) on a stationary tap — so it cannot be the thing that
 * swallows taps. But once a native `Pressable` sits inside the detector, its
 * touch + the pan's touch race, and the pan's `activeOffsetX` wins: a child
 * button inside the pan area silently stops firing (RNGH discussion #3172).
 * The feed has exactly two such interactive children:
 *
 *   1. the card's save heart (top-right) — must fire on tap only,
 *   2. (via `TapDecision`) the explore link — a tap on the card face that
 *      does NOT reach the swipe threshold.
 *
 * The cure for both is a second gesture composed with the pan via
 * `Gesture.Exclusive(pan, tap)`:
 *
 *   - the Tap has NO `maxDistance` beyond its activation (RNGH only activates
 *     a tap whose finger stays still), so a swipe never fires it — the pan
 *     wins the exclusive because the finger moved,
 *   - the child `Pressable`s inside the card keep their own touches (the tap
 *     gesture is attached to the same container, not to the buttons), and
 *     their native touches are no longer fighting a pan that the tap now
 *     represents at the RNGH level — the press fires, the tap does not.
 *
 * `tapSlot`/`tapStatus` are consumed by `useSwipeCard`'s worklets and by the
 * faces' tiny `tapSlot` readers; `isTapEnd` is the pure detector, tested in
 * `tap-slot.test.ts`.
 */

/**
 * How far a finger may travel before a release stops being a tap.
 *
 * `decideSwipe` commits at 35% of the card width; this is far below it, so a
 * tap and a swipe cannot overlap: either the finger stayed still (tap) or the
 * pan activated and owned the release (swipe). Not zero: a finger resting on
 * the heart jitters by a couple of points.
 */
export const TAP_MAX_DX = 6;

/**
 * A release faster than this is a FLICK, not a tap, even if the finger barely
 * moved (a quick tap is ~10-20 pt/s; a flick is 800+). The velocity guard
 * keeps a fast but tiny flick on the heart from reading as a tap.
 */
export const TAP_MAX_VX = 200;

/**
 * The target the tap gesture dispatches when the touch began on NO
 * interactive target — a bare tap on the card face. The feed toggles the top
 * card's playback on it (owner, 2026-08-25: "when tapping on the card, we
 * should pause and resume"). Never written into `tapSlot` by anyone; the tap
 * gesture substitutes it for an empty slot at release.
 */
export const CARD_TAP_TARGET = "card";

/** The exclusive-tap gesture's slot; never read by the card faces. */
export interface TapSlot {
	/** Latest tap-target id, or `null` when the last release was not a tap. */
	target: string | null;
}

/** The tap gesture's state; read by `isTapEnd` on every pan release. */
export interface TapStatus {
	/** Whether the tap gesture ever activated during this touch. */
	active: boolean;
}

/** Both live inside a single `useSharedValue` each, created in `useSwipeCard`. */
export type TapSlotValue = SharedValueLike<TapSlot>;
export type TapStatusValue = SharedValueLike<TapStatus>;

/** Minimal SharedValue shape — keeps this module free of reanimated imports. */
interface SharedValueLike<T> {
	value: T;
}

/**
 * Whether a pan release was really a tap on a target.
 *
 * `target` arrives from `tapSlot` (the exclusive tap gesture only writes it
 * when it ACTIVATED, and the pan only runs `onEnd` when IT activated — the
 * two can never both have activated, so the slot can never be stale).
 * `tapStatus` is the `onTouchesDown`-set "tap gesture is live" flag, which
 * clears the moment the tap activates.
 *
 * `"worklet"` is LOAD-BEARING: the only caller is the pan's `onEnd`, which runs
 * on the UI thread. Without the directive Reanimated captures this as a plain JS
 * function in the worklet's closure — callable only through `runOnJS` — and the
 * synchronous call throws "Tried to synchronously call a non-worklet function on
 * the UI thread" out of the gesture callback, i.e. the app dies at the end of
 * every swipe. Every other helper the gesture worklets call (`decideSwipe`,
 * `clampDisplacement`, `panLive`, `advanceFromDrag`, …) carries it for the same
 * reason. The directive is an inert string statement under vitest, so this stays
 * a plain pure function to its tests.
 */
export function isTapEnd(
	slot: TapSlot | undefined | null,
	status: TapStatus | undefined | null,
	dx: number,
	vx: number,
): { target: string | null; tapped: boolean } {
	"worklet";
	if (!slot || !slot.target) return { target: null, tapped: false };
	if (!status || !status.active) return { target: null, tapped: false };
	if (Math.abs(dx) > TAP_MAX_DX || Math.abs(vx) > TAP_MAX_VX) {
		return { target: null, tapped: false };
	}
	return { target: slot.target, tapped: true };
}
