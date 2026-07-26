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
	withSpring,
	withTiming,
} from "react-native-reanimated";
import {
	SWIPE_THRESHOLD_RATIO,
	type SwipeDecision,
	decideSwipe,
	stepThresholdLatch,
} from "../lib/gesture/decide-swipe";
import { haptics } from "../lib/haptics";

const FOLLOW_ROTATION_DEG = 8; // §0.5
const FLY_OUT_MS = 220;
const FLIP_MS = 350; // §0.5 — opacity crossfade, never rotateY
const ACTIVE_OFFSET_X = 10;
const FAIL_OFFSET_Y = 20;

// Referenced from worklets: naming the functions keeps the whole `haptics`
// object out of the UI-thread closure.
const fireThreshold = haptics.swipeThreshold;
const fireSettle = haptics.cardSettle;

interface UseSwipeCardArgs {
	cardWidth: number;
	enabled: boolean;
	/** Called on the JS thread once a swipe commits. */
	onDecision: (decision: Exclude<SwipeDecision, "none">) => void;
	/**
	 * Whether this card has a data face to flip to (§1.1 red line). Defaults to
	 * true for backward compatibility with task-0's callers.
	 *
	 * A card with no back face must treat a tap as a NO-OP: ask / tradeoff /
	 * milestone cards have nothing behind them, and flipping anyway crossfades
	 * the visible face out to an empty one. `renderBack` being *supplied* is not
	 * evidence a given item has a back — one `renderBack` serves a mixed deck
	 * and returns null for the kinds that don't flip, so the decision has to be
	 * made per item, by its result.
	 */
	canFlip?: boolean;
}

interface UseSwipeCardResult {
	/** Pan + tap, composed exclusively — the pan wins a contested touch. */
	gesture: ReturnType<typeof Gesture.Exclusive>;
	topStyle: AnimatedStyle<ViewStyle>;
	/** Horizontal drag offset — cards behind read this to rise toward the top. */
	tx: SharedValue<number>;
	/** 0 = video face, 1 = data face. */
	flipProgress: SharedValue<number>;
	/** Video face — visible at flipProgress 0. */
	frontStyle: AnimatedStyle<ViewStyle>;
	/** Data face — visible at flipProgress 1. */
	backStyle: AnimatedStyle<ViewStyle>;
}

export function useSwipeCard({
	cardWidth,
	enabled,
	onDecision,
	canFlip = true,
}: UseSwipeCardArgs): UseSwipeCardResult {
	const tx = useSharedValue(0);
	const crossedRight = useSharedValue(false);
	const flipProgress = useSharedValue(0);

	// Lands in the same JS tick as the caller's index advance, so the promoted
	// card is never drawn at the outgoing card's off-screen offset.
	const settle = useCallback(
		(decision: Exclude<SwipeDecision, "none">) => {
			tx.value = 0;
			crossedRight.value = false;
			flipProgress.value = 0;
			if (decision === "right") haptics.cardSettle();
			else haptics.pass();
			onDecision(decision);
		},
		[onDecision, tx, crossedRight, flipProgress],
	);

	const gesture = useMemo(() => {
		const pan = Gesture.Pan()
			.enabled(enabled)
			.activeOffsetX([-ACTIVE_OFFSET_X, ACTIVE_OFFSET_X])
			.failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
			.onBegin(() => {
				crossedRight.value = false;
			})
			.onUpdate((e) => {
				tx.value = e.translationX;
				const step = stepThresholdLatch({
					translationX: e.translationX,
					cardWidth,
					latched: crossedRight.value,
				});
				crossedRight.value = step.latched;
				if (step.fire) runOnJS(fireThreshold)();
			})
			.onEnd((e) => {
				const decision = decideSwipe({
					translationX: e.translationX,
					translationY: e.translationY,
					velocityX: e.velocityX,
					cardWidth,
				});
				if (decision === "none") {
					tx.value = withSpring(0);
					return;
				}
				// A >800pt/s flick decides direction without ever crossing the
				// distance threshold, so the §0.5 tick has not fired yet.
				if (decision === "right" && !crossedRight.value) {
					runOnJS(fireThreshold)();
				}
				const dest = decision === "right" ? cardWidth * 1.6 : -cardWidth * 1.6;
				tx.value = withTiming(dest, { duration: FLY_OUT_MS }, (finished) => {
					if (finished) runOnJS(settle)(decision);
				});
			});

		const tap = Gesture.Tap()
			.enabled(enabled && canFlip)
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
	}, [cardWidth, enabled, canFlip, settle, tx, crossedRight, flipProgress]);

	const topStyle = useAnimatedStyle(() => {
		// ±8° across the drag the user can actually perform: the card commits at
		// 35% of its width, so interpolating over the full width would cap at ~2.8°.
		const rotationSpan = cardWidth * SWIPE_THRESHOLD_RATIO;
		return {
			transform: [
				{ translateX: tx.value },
				{
					rotate: `${interpolate(
						tx.value,
						[-rotationSpan, 0, rotationSpan],
						[-FOLLOW_ROTATION_DEG, 0, FOLLOW_ROTATION_DEG],
						"clamp",
					)}deg`,
				},
			],
		};
	});

	const frontStyle = useAnimatedStyle(() => ({
		opacity: 1 - flipProgress.value,
	}));

	const backStyle = useAnimatedStyle(() => ({
		opacity: flipProgress.value,
	}));

	return { gesture, topStyle, tx, flipProgress, frontStyle, backStyle };
}
