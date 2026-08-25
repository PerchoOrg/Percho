/**
 * useSwipeCard — binds the §0.5 gesture contract to a Reanimated pan + tap.
 *
 * Responsibilities:
 *   - drive tx while dragging horizontally (top card only); vertical carries no
 *     semantics on the card face, so the card never translates vertically and
 *     the pan only claims horizontally-dominant touches (§0.5 ±30° sector),
 *   - ±8° follow-rotation across the usable drag range (§0.5),
 *   - fire `swipeThreshold` (selectionAsync) once when a RIGHT swipe's direction
 *     is decided — by distance mid-drag or by velocity on release. LEFT stays
 *     silent (pass = no haptic, §0.5),
 *   - on release, delegate the decision to the pure `decideSwipe`, fly the card
 *     out and fire `cardSettle` for a like, or spring back for a non-commit.
 *
 * There is NO tap gesture. A tap used to crossfade the card to a data face over
 * 350ms (§0.5); the owner cut that mechanic on 2026-07-30 ("砍掉flip back的功能"),
 * so the card is single-faced and the pan is the only gesture on it. The
 * `flipProgress` shared value, the `Gesture.Exclusive(pan, tap)` composition and
 * the "a flipped card must not pan" gate all went with it.
 *
 * The hook owns none of the feed semantics — it reports `'left' | 'right'` to
 * `onDecision` and lets the caller (task-1) map that to like/pass/agree/etc.
 * What a given card is ALLOWED to do arrives as a resolved `CardCapability`
 * (§1.3), so no handler in here ever branches on a card kind.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Gesture } from "react-native-gesture-handler";
import {
	type SharedValue,
	runOnJS,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import {
	type CardCapability,
	clampDisplacement,
	commitDecision,
	panLive,
} from "../lib/gesture/capability";
import {
	type SwipeDecision,
	decideSwipe,
	stepThresholdLatch,
} from "../lib/gesture/decide-swipe";
import { advanceFromDrag } from "../lib/gesture/stack-layer";
import {
	CARD_TAP_TARGET,
	TAP_MAX_DX,
	type TapSlot,
	type TapStatus,
	isTapEnd,
} from "../lib/gesture/tap-slot";
import { haptics } from "../lib/haptics";

/**
 * §1.8 flyout: a spring at damping 26, NOT the `withTiming` 220ms task-0 shipped.
 *
 * `duration` is absent on purpose. Reanimated has two spring families — physics
 * (`mass`/`stiffness`/`damping`) and duration (`duration`/`dampingRatio`) — and
 * supplying both silently drops one, taking `damping: 26` with it. Damping is the
 * number §1.8 names, so this is the physics form.
 *
 * `stiffness: 220` at `mass: 1` puts ζ = 26/(2·√220) ≈ 0.88 and ω ≈ 14.8 rad/s,
 * i.e. a ~260-280ms settle — §1.8's 260ms as closely as a damping-26 spring can
 * express it. `overshootClamping` because the target is off-screen: a bounce back
 * into frame would show the outgoing card after its verdict was taken.
 */
const FLY_OUT_SPRING = {
	damping: 26,
	mass: 1,
	stiffness: 220,
	overshootClamping: true,
} as const;
const ACTIVE_OFFSET_X = 10;
const FAIL_OFFSET_Y = 20;

// Referenced from worklets: naming the functions keeps the whole `haptics`
// object out of the UI-thread closure.
const fireThreshold = haptics.swipeThreshold;

interface UseSwipeCardArgs {
	cardWidth: number;
	/**
	 * What THIS top card is allowed to do (§1.3). Resolved by the caller before
	 * the gesture is built, which is what lets every handler below stay ignorant
	 * of card kinds. `SwipeStack` derives it per item and ANDs `flippable` with
	 * whether a back face actually rendered (§1.1 red line).
	 */
	capability: CardCapability;
	/** Called on the JS thread after the card has flown out and settled. */
	onDecision: (decision: Exclude<SwipeDecision, "none">) => void;
	/**
	 * Called when a release is a TAP on an interactive card target (the save
	 * heart / the explore link). `target` is the tap target's id; the card
	 * faces write it into `tapSlot` on their own touches. The feed wires this
	 * to the routing/emitting callbacks — see `lib/gesture/tap-slot.ts` for
	 * why a tap inside the pan gesture has to be detected here rather than by
	 * a nested `Pressable`.
	 */
	onTapTarget?: (target: string) => void;
}

interface UseSwipeCardResult {
	/**
	 * The composed gesture — `Gesture.Exclusive(pan, tap)`. The tap half gives
	 * interactive children (the save heart, the explore link) their own
	 * activation inside the pan area; it only ever activates on a stationary
	 * touch, so a swipe always wins the exclusive and nothing that drags the
	 * card can fire a tap.
	 */
	gesture: ReturnType<typeof Gesture.Exclusive>;
	/**
	 * The pan half on its own, so a gesture inside a card can declare a relation
	 * to it — `blocksExternalGesture` takes a base gesture and refuses a
	 * `ComposedGesture`, which is what `gesture` above is.
	 *
	 * The pan is also the only half worth blocking: the tap needs a stationary
	 * finger, so it can never contend with a drag.
	 *
	 * The community card's progress scrubber is the caller. Without the relation
	 * a scrub and a swipe race for the same horizontal drag, and losing that race
	 * throws away the card the buyer was trying to rewind.
	 */
	panGesture: ReturnType<typeof Gesture.Pan>;
	/** Horizontal drag offset — cards behind read this to rise toward the top. */
	tx: SharedValue<number>;
	/**
	 * Absolute index of the current top card, on the UI thread. Advanced in the
	 * SAME worklet frame that zeroes `tx`, so the stack's geometry never passes
	 * through a state where the outgoing card sits at the top with a zeroed
	 * offset — that discontinuity was the post-swipe jump. React's `activeIndex`
	 * catches up a frame or two later, and writing it back here is idempotent
	 * because this worklet already moved it to the same value.
	 */
	topAbs: SharedValue<number>;
	/** Where the committed card is flying out to; read by cards with rel < 0. */
	exitX: SharedValue<number>;
	/** Stack-shuffle progress in [0,1], continuous across the handoff. */
	advance: SharedValue<number>;
	/**
	 * The tap gesture's target slot. The card faces write `{ target }` into it
	 * on their own touch start (the heart / explore link) and clear it on
	 * release; the pan's `onEnd` reads it to decide whether the release was a
	 * tap on that target. Faces are the only writers; the worklets are the only
	 * readers.
	 */
	tapSlot: SharedValue<TapSlot>;
	/** The tap gesture's live state, set on `onTouchesDown` / cleared on activate. */
	tapStatus: SharedValue<TapStatus>;
}

/**
 * Module-level dispatcher for tap targets. The pan's `onEnd` runs on the UI
 * thread and cannot read `handlers` (a ref); this runs on the JS thread via
 * `runOnJS` and derefs the ref there, where it is valid.
 */
function dispatchTapTarget(target: string) {
	if (target === "__touchdown__") return;
	lastTapTarget?.(target);
}

/** The latest tap-target handler, set by `useSwipeCard` (JS thread only). */
let lastTapTarget: ((target: string) => void) | null = null;

export function useSwipeCard({
	cardWidth,
	capability,
	onDecision,
	onTapTarget,
}: UseSwipeCardArgs): UseSwipeCardResult {
	const tx = useSharedValue(0);
	const crossedRight = useSharedValue(false);
	const topAbs = useSharedValue(0);
	const exitX = useSharedValue(0);
	const advance = useSharedValue(0);
	/**
	 * The tap gesture's two slots. `tapSlot.target` is written by the card
	 * faces (on their own touch start) and read by the pan's `onEnd`; the
	 * exclusive tap gesture itself only ever ACTIVATES on a stationary touch,
	 * so the pan and the tap can never both be active for one release.
	 */
	const tapSlot = useSharedValue<TapSlot>({ target: null });
	const tapStatus = useSharedValue<TapStatus>({ active: false });
	/**
	 * `onDecision`, read through a ref so it is NOT a gesture-memo input.
	 *
	 * `SwipeStack` builds it as an inline arrow closing over the current top item,
	 * so a fresh identity arrives on every render. While a callback like this sat
	 * in the memo's dependency list, EVERY render rebuilt the gesture — including
	 * the renders that happen while a swipe is still resolving (the deck appends a
	 * page, the funnel advances, a milestone splices in).
	 *
	 * Replacing a live `Gesture.Pan` mid-gesture drops the in-flight touch, so
	 * `onEnd` never fires on the handler that saw `onBegin`: the flyout is never
	 * scheduled, the handoff never runs, and the card stays on top permanently.
	 *
	 * A ref keeps the latest callback reachable without making its identity a
	 * reason to rebuild.
	 */
	const handlers = useRef({ onDecision, onTapTarget });
	handlers.current = { onDecision, onTapTarget };
	// Mirror into the module-level slot so `dispatchTapTarget` (which runs on
	// the JS thread via runOnJS) can reach it without a ref deref in a worklet.
	lastTapTarget = onTapTarget ?? null;
	// Clear on unmount so a late runOnJS hop can never call a dead callback.
	// The cleanup closure compares identity to avoid clobbering a newer mount.
	useEffect(() => {
		const installed = onTapTarget ?? null;
		return () => {
			if (lastTapTarget === installed) lastTapTarget = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	/**
	 * True from the instant a direction commits until the handoff completes.
	 *
	 * The gap between those two moments is not a frame: the flyout spring is
	 * ~280ms. Any touch inside it used to write `tx`, cancelling the pending
	 * flyout animation — and
	 * a cancelled animation never runs its completion callback, so the handoff
	 * that advances the deck never fired and the card was stuck on top for good.
	 */
	const committed = useSharedValue(false);

	// JS-side bookkeeping only. Everything that affects a pixel this frame has
	// already happened on the UI thread in `handoff` below — by the time this
	// runs, the new top card is already drawn centred and the outgoing one is
	// already parked off-screen. Resetting `tx` here (the old behaviour) raced
	// React's index advance: for a frame or two the outgoing card was still in
	// the top slot with a zeroed offset, so it snapped back to centre and
	// flashed. That was the post-swipe jump.
	const settle = useCallback((decision: Exclude<SwipeDecision, "none">) => {
		if (decision === "right") haptics.cardSettle();
		else haptics.pass();
		handlers.current.onDecision(decision);
	}, []);

	/**
	 * The atomic handoff, all on the UI thread in one frame:
	 *   - park the outgoing card at its final flyout position (`exitX`), which
	 *     the card keeps reading while `rel < 0`, so it stays off-screen instead
	 *     of snapping back when `tx` is zeroed;
	 *   - advance `topAbs`, which promotes the next card;
	 *   - zero `tx` and `advance` for the NEW top card.
	 *
	 * `topAbs` and `advance` move together by exactly 1 and 1, and a card's style
	 * is a function of `rel - advance`, so every card's computed depth is
	 * unchanged across this frame. Nothing moves that the buyer can see except
	 * the card that left.
	 */
	const handoff = useCallback(
		(dest: number, decision: Exclude<SwipeDecision, "none">) => {
			"worklet";
			exitX.value = dest;
			topAbs.value = topAbs.value + 1;
			tx.value = 0;
			advance.value = 0;
			crossedRight.value = false;
			// Re-arm LAST: the new top card is only touchable once the cursor has
			// actually moved, so a touch landing on this very frame cannot be
			// attributed to the card that just left.
			committed.value = false;
			runOnJS(settle)(decision);
		},
		[exitX, topAbs, tx, advance, crossedRight, committed, settle],
	);

	// Destructured out of the capability object so the memo depends on the three
	// VALUES, not on object identity. The caller resolves a capability per render
	// (`capability(item)`), so a fresh-but-equal object arrives every frame during
	// a drag — keying the memo on it would rebuild the gesture mid-gesture.
	const { pannable, commits, maxDisplacementRatio } = capability;

	const gesture = useMemo(() => {
		return Gesture.Pan()
			.enabled(pannable)
			.activeOffsetX([-ACTIVE_OFFSET_X, ACTIVE_OFFSET_X])
			.failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
			.onBegin(() => {
				crossedRight.value = false;
			})
			.onUpdate((e) => {
				// Checked here rather than through `.enabled()` because `committed`
				// flips without rebuilding the gesture, and a rebuild mid-gesture
				// would drop the in-flight touch (§1.1).
				if (!panLive({ pannable, committed: committed.value })) return;
				const clamped = clampDisplacement(
					e.translationX,
					cardWidth,
					maxDisplacementRatio,
				);
				tx.value = clamped;
				// Drives the shuffle of the cards behind while the finger is down.
				advance.value = advanceFromDrag(clamped, cardWidth);
				// The latch reads the CLAMPED offset, so a card capped short of the
				// commit threshold never fires the §0.5 "this vote counts" tick.
				const step = stepThresholdLatch({
					translationX: clamped,
					cardWidth,
					latched: crossedRight.value,
				});
				crossedRight.value = step.latched;
				if (step.fire) runOnJS(fireThreshold)();
			})
			.onEnd((e) => {
				if (!panLive({ pannable, committed: committed.value })) return;
				const clamped = clampDisplacement(
					e.translationX,
					cardWidth,
					maxDisplacementRatio,
				);

				/**
				 * Tap-target dispatch. A stationary release (≤6pt, no flick) whose
				 * touch began on an interactive card target is a TAP — the explore
				 * link or the save heart — and it goes to `onTapTarget`, NOT through
				 * the swipe machinery. The pan only runs `onEnd` when the pan
				 * actually activated; the exclusive tap only writes `tapSlot` when
				 * IT activated, and the two cannot both activate for one touch, so
				 * a swipe release can never be mistaken for a tap.
				 */
				const tap = isTapEnd(
					tapSlot.value,
					tapStatus.value,
					e.translationX,
					e.velocityX,
				);
				if (tap.tapped && tap.target) {
					// `handlers.current` is a REF — not readable from a worklet.
					// Route through the module-level dispatcher, which reads the
					// ref on the JS thread (inside `runOnJS`'s target).
					runOnJS(dispatchTapTarget)(tap.target);
					// Clear the slot so a stale target cannot fire twice.
					tapSlot.value = { target: null };
					return;
				}
				// `commits: false` (§1.5 milestone) turns every verdict into a spring
				// back. Resolved here, before anything fires, so a ceremony card can
				// never reach `onDecision` at all.
				const decision = commitDecision(
					decideSwipe({
						translationX: clamped,
						translationY: e.translationY,
						velocityX: e.velocityX,
						cardWidth,
					}),
					commits,
				);
				if (decision === "none") {
					tx.value = withSpring(0);
					advance.value = withSpring(0);
					crossedRight.value = false;
					return;
				}
				// A >800pt/s flick decides direction without ever crossing the
				// distance threshold, so the §0.5 tick has not fired yet.
				if (decision === "right" && !crossedRight.value) {
					runOnJS(fireThreshold)();
				}

				// Before any animation is scheduled: from here until the handoff, this
				// card takes no further input. Writing `tx` from a second gesture
				// cancels the flyout below, and a cancelled animation never calls its
				// callback — which is the handoff, so the deck would never advance.
				committed.value = true;
				const dest = decision === "right" ? cardWidth * 1.6 : -cardWidth * 1.6;
				// The cards behind keep rising on the same spring the outgoing card
				// flies out on, so the shuffle finishes exactly as the handoff fires
				// rather than jumping the last of the way.
				advance.value = withSpring(1, FLY_OUT_SPRING);
				tx.value = withSpring(dest, FLY_OUT_SPRING, (finished) => {
					if (finished) handoff(dest, decision);
				});
			});
	}, [
		cardWidth,
		pannable,
		commits,
		maxDisplacementRatio,
		handoff,
		tx,
		advance,
		crossedRight,
		committed,
		tapSlot,
		tapStatus,
	]);

	const tapGesture = useMemo(() => {
		return (
			Gesture.Tap()
				.enabled(pannable)
				// RNGH's tap needs a small radius to call itself a tap; anything
				// beyond it fails and hands the touch back to the pan (exclusive).
				.maxDistance(TAP_MAX_DX)
				.onTouchesDown((_e, _mgr) => {
					tapStatus.value = { active: true };
					// The face's own `onTouchStart` (a real React handler on the
					// JS thread) already armed `tapSlot.target` before the
					// gesture's touchesDown fired. Nothing to do here.
				})
				.onStart(() => {
					tapStatus.value = { active: false };
					// The tap ACTIVATED — the finger stayed still. This is a
					// real tap; the pan FAILED (it needs ±10pt), so the pan's
					// onEnd will never run. Keep `tapSlot` armed: the tap's
					// own `onEnd` (below) dispatches it.
				})
				.onEnd((_e, success) => {
					tapStatus.value = { active: false };
					// ONLY dispatch when the tap actually ENDED successfully
					// (the finger stayed still). In `Gesture.Exclusive(pan,
					// tap)`, when the pan wins a swipe, the tap FAILS — and
					// RNGH still fires `onEnd` with `success: false`. Without
					// this guard, a swipe that started on the heart would
					// dispatch the stale armed target and fire the save/explore
					// action on a card the user was swiping away.
					// Cleared on EVERY release, successful or not: a face arms the
					// slot on touch start and nothing else clears it, so a swipe that
					// began on the heart used to leave "save" armed for the next bare
					// tap anywhere on the card. (When the pan wins, its own `onEnd`
					// is a swipe by construction — `isTapEnd` needs ≤6pt and the pan
					// needs ≥10pt to activate — so it never wanted the slot.)
					const target = tapSlot.value.target;
					tapSlot.value = { target: null };
					if (!success) return;
					// A bare tap on the face is a tap on the CARD.
					runOnJS(dispatchTapTarget)(target ?? CARD_TAP_TARGET);
				})
		);
	}, [pannable, tapStatus, tapSlot]);

	return {
		gesture: Gesture.Exclusive(gesture, tapGesture),
		// The pan ALONE, for a card face that needs to block it. See `panGesture`
		// on the return type.
		panGesture: gesture,
		tx,
		topAbs,
		exitX,
		advance,
		tapSlot,
		tapStatus,
	};
}
