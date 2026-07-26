/**
 * useSwipeCard — binds the §0.5 gesture contract to a Reanimated pan.
 *
 * Responsibilities:
 *   - drive tx/ty shared values while dragging (top card only),
 *   - ±8° follow-rotation (§0.5),
 *   - fire `swipeThreshold` (selectionAsync) once when a RIGHT drag crosses the
 *     commit threshold — LEFT crossings stay silent (pass = no haptic, §0.5),
 *   - on release, delegate the decision to the pure `decideSwipe`, fly the card
 *     out and fire `cardSettle` for a like, or spring back for a non-commit.
 *
 * The hook owns none of the feed semantics — it reports `'left' | 'right'` to
 * `onDecision` and lets the caller (task-1) map that to like/pass/agree/etc.
 */
import { useCallback } from "react";
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
} from "../lib/gesture/decide-swipe";
import { haptics } from "../lib/haptics";

const FOLLOW_ROTATION_DEG = 8; // §0.5
const FLY_OUT_MS = 220;

interface UseSwipeCardArgs {
	cardWidth: number;
	enabled: boolean;
	/** Called on the JS thread once a swipe commits. */
	onDecision: (decision: Exclude<SwipeDecision, "none">) => void;
}

interface UseSwipeCardResult {
	gesture: ReturnType<typeof Gesture.Pan>;
	topStyle: AnimatedStyle<ViewStyle>;
	/** Horizontal drag offset — cards behind read this to rise toward the top. */
	tx: SharedValue<number>;
	ty: SharedValue<number>;
	/** Zero the card back to rest (call after the caller advances the stack). */
	reset: () => void;
}

export function useSwipeCard({
	cardWidth,
	enabled,
	onDecision,
}: UseSwipeCardArgs): UseSwipeCardResult {
	const tx = useSharedValue(0);
	const ty = useSharedValue(0);
	const crossedRight = useSharedValue(false);

	const settle = useCallback(
		(decision: Exclude<SwipeDecision, "none">) => {
			if (decision === "right") haptics.cardSettle();
			else haptics.pass();
			onDecision(decision);
		},
		[onDecision],
	);

	const reset = useCallback(() => {
		tx.value = 0;
		ty.value = 0;
		crossedRight.value = false;
	}, [tx, ty, crossedRight]);

	const gesture = Gesture.Pan()
		.enabled(enabled)
		.minDistance(6)
		.onBegin(() => {
			crossedRight.value = false;
		})
		.onUpdate((e) => {
			tx.value = e.translationX;
			ty.value = e.translationY;
			const pastRight = e.translationX >= cardWidth * SWIPE_THRESHOLD_RATIO;
			if (pastRight && !crossedRight.value) {
				crossedRight.value = true;
				runOnJS(haptics.swipeThreshold)();
			} else if (!pastRight && crossedRight.value) {
				crossedRight.value = false;
			}
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
				ty.value = withSpring(0);
				return;
			}
			const dest = decision === "right" ? cardWidth * 1.6 : -cardWidth * 1.6;
			tx.value = withTiming(dest, { duration: FLY_OUT_MS }, (finished) => {
				if (finished) runOnJS(settle)(decision);
			});
		});

	const topStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: tx.value },
			{ translateY: ty.value },
			{
				rotate: `${interpolate(
					tx.value,
					[-cardWidth, 0, cardWidth],
					[-FOLLOW_ROTATION_DEG, 0, FOLLOW_ROTATION_DEG],
					"clamp",
				)}deg`,
			},
		],
	}));

	return { gesture, topStyle, tx, ty, reset };
}
