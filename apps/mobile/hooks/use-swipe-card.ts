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
 *     out and fire `cardSettle` for a like, or spring back for a non-commit,
 *   - tap flips to the data face as a 350ms opacity crossfade (§0.5 — 3D
 *     rotateY is forbidden), exposed as `flipProgress` + `frontStyle`/`backStyle`.
 *
 * The hook owns none of the feed semantics — it reports `'left' | 'right'` to
 * `onDecision` and lets the caller (task-1) map that to like/pass/agree/etc.
 * What a given card is ALLOWED to do arrives as a resolved `CardCapability`
 * (§1.3), so no handler in here ever branches on a card kind.
 */
import { useCallback, useMemo } from "react";
import type { ViewStyle } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
	type AnimatedStyle,
	type SharedValue,
	interpolate,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import {
	type CardCapability,
	clampDisplacement,
	commitDecision,
	panAllowed,
} from "../lib/gesture/capability";
import {
	SWIPE_THRESHOLD_RATIO,
	type SwipeDecision,
	decideSwipe,
	stepThresholdLatch,
} from "../lib/gesture/decide-swipe";
import { advanceFromDrag } from "../lib/gesture/stack-layer";
import { haptics } from "../lib/haptics";

const FOLLOW_ROTATION_DEG = 8; // §0.5
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
const FLIP_MS = 350; // §0.5 — opacity crossfade, never rotateY
const ACTIVE_OFFSET_X = 10;
const FAIL_OFFSET_Y = 20;

// Referenced from worklets: naming the functions keeps the whole `haptics`
// object out of the UI-thread closure.
const fireThreshold = haptics.swipeThreshold;
const fireSettle = haptics.cardSettle;

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
	 * Called on the JS thread the instant a direction commits — BEFORE the
	 * `revealMs` hold and the flyout. This is what makes §1.6's challenge reveal
	 * possible at all: the card needs to change its own content while it is still
	 * on screen, and by `onDecision` it is already gone.
	 */
	onCommit?: (decision: Exclude<SwipeDecision, "none">) => void;
}

interface UseSwipeCardResult {
	/** Pan + tap, composed exclusively — the pan wins a contested touch. */
	gesture: ReturnType<typeof Gesture.Exclusive>;
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
	/** 0 = video face, 1 = data face. */
	flipProgress: SharedValue<number>;
	/** Video face — visible at flipProgress 0. */
	frontStyle: AnimatedStyle<ViewStyle>;
	/** Data face — visible at flipProgress 1. */
	backStyle: AnimatedStyle<ViewStyle>;
}

export function useSwipeCard({
	cardWidth,
	capability,
	onDecision,
	onCommit,
}: UseSwipeCardArgs): UseSwipeCardResult {
	const tx = useSharedValue(0);
	const crossedRight = useSharedValue(false);
	const flipProgress = useSharedValue(0);
	const topAbs = useSharedValue(0);
	const exitX = useSharedValue(0);
	const advance = useSharedValue(0);

	// JS-side bookkeeping only. Everything that affects a pixel this frame has
	// already happened on the UI thread in `handoff` below — by the time this
	// runs, the new top card is already drawn centred and the outgoing one is
	// already parked off-screen. Resetting `tx` here (the old behaviour) raced
	// React's index advance: for a frame or two the outgoing card was still in
	// the top slot with a zeroed offset, so it snapped back to centre and
	// flashed. That was the post-swipe jump.
	const settle = useCallback(
		(decision: Exclude<SwipeDecision, "none">) => {
			if (decision === "right") haptics.cardSettle();
			else haptics.pass();
			onDecision(decision);
		},
		[onDecision],
	);

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
	 *
	 * `flipProgress` is reset here rather than at commit: zeroing it at commit
	 * time would crossfade the outgoing card back to its video face over the
	 * 350ms it is flying out — the buyer would watch the face they just acted on
	 * dissolve into a different one mid-air.
	 */
	const handoff = useCallback(
		(dest: number, decision: Exclude<SwipeDecision, "none">) => {
			"worklet";
			exitX.value = dest;
			topAbs.value = topAbs.value + 1;
			tx.value = 0;
			advance.value = 0;
			crossedRight.value = false;
			flipProgress.value = 0;
			runOnJS(settle)(decision);
		},
		[exitX, topAbs, tx, advance, crossedRight, flipProgress, settle],
	);

	// Destructured out of the capability object so the memo depends on the five
	// VALUES, not on object identity. The caller resolves a capability per render
	// (`capability(item)`), so a fresh-but-equal object arrives every frame during
	// a drag — keying the memo on it would rebuild the gesture mid-gesture.
	const { pannable, commits, maxDisplacementRatio, flippable, revealMs } =
		capability;

	const gesture = useMemo(() => {
		const pan = Gesture.Pan()
			.enabled(pannable)
			.activeOffsetX([-ACTIVE_OFFSET_X, ACTIVE_OFFSET_X])
			.failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
			.onBegin(() => {
				crossedRight.value = false;
			})
			.onUpdate((e) => {
				// §1.1: a flipped card does not pan. Checked here rather than through
				// `.enabled()` because the flip state changes without rebuilding the
				// gesture, and a static enable would go stale mid-crossfade.
				if (!panAllowed(pannable, flipProgress.value)) return;
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
				if (!panAllowed(pannable, flipProgress.value)) return;
				const clamped = clampDisplacement(
					e.translationX,
					cardWidth,
					maxDisplacementRatio,
				);
				// `commits: false` (§1.5 milestone) turns every verdict into a spring
				// back. Resolved here, before anything fires, so a ceremony card can
				// never reach `onCommit` / `onDecision` at all.
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
				if (onCommit) runOnJS(onCommit)(decision);
				const dest = decision === "right" ? cardWidth * 1.6 : -cardWidth * 1.6;
				// The cards behind keep rising on the same spring the outgoing card
				// flies out on, so the shuffle finishes exactly as the handoff fires
				// rather than jumping the last of the way.
				advance.value = withSpring(1, FLY_OUT_SPRING);
				const flyOut = withSpring(dest, FLY_OUT_SPRING, (finished) => {
					if (finished) handoff(dest, decision);
				});
				// §1.6: hold the committed card in place for `revealMs` so it can show
				// its answer, THEN fly out. The card freezes where the finger left it
				// — spring-back-then-fly-out would read as an undo followed by a
				// second, unexplained swipe.
				tx.value =
					revealMs !== undefined && revealMs > 0
						? withDelay(revealMs, flyOut)
						: flyOut;
			});

		const tap = Gesture.Tap()
			.enabled(flippable)
			.onEnd((_e, success) => {
				if (!success) return;
				const target = flipProgress.value < 0.5 ? 1 : 0;
				flipProgress.value = withTiming(
					target,
					{ duration: FLIP_MS },
					(finished) => {
						if (finished) runOnJS(fireSettle)();
					},
				);
			});

		return Gesture.Exclusive(pan, tap);
	}, [
		cardWidth,
		pannable,
		commits,
		maxDisplacementRatio,
		flippable,
		revealMs,
		onCommit,
		handoff,
		tx,
		advance,
		crossedRight,
		flipProgress,
	]);

	const frontStyle = useAnimatedStyle(() => ({
		opacity: 1 - flipProgress.value,
	}));

	const backStyle = useAnimatedStyle(() => ({
		opacity: flipProgress.value,
	}));

	return {
		gesture,
		tx,
		topAbs,
		exitX,
		advance,
		flipProgress,
		frontStyle,
		backStyle,
	};
}
