/**
 * SwipeLabels (§1.8) — the direction labels that fade in with the drag.
 *
 * Copy is never authored here: it comes from `swipeLabelsFor(card)`, which is the
 * single resolution point for a card kind's swipe semantics. That is what keeps
 * "LIKE / PASS" on a listing and "TELL ME MORE / NOT FOR ME" on an area card
 * without this component knowing either exists. A ceremony (milestone) card
 * returns no labels and renders nothing — it never commits.
 *
 * §1.8: opacity tracks the displacement ratio, z-20, red left / green right, and
 * a text shadow because these sit over bright photography.
 *
 * ## Why the labels have to be armed
 *
 * `tx` is UI-thread state and it outlives any React remount of this component.
 * When the top card changes for a reason other than a completed swipe — a deck
 * rebuild, an undo, a tap-driven advance — this component remounts while `tx`
 * still holds the offset from the gesture that just finished. The label then
 * paints at full strength on a card the buyer never dragged: a white word
 * flashing past and disappearing.
 *
 * `armed` closes that. A freshly mounted label stays hidden until the drag has
 * been observed at rest at least once, so it can only ever be revealed by a
 * gesture that began under THIS card. The decision itself lives in
 * `labelOpacity` so it is unit-testable rather than trapped in a worklet.
 */
import { StyleSheet, Text, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { swipeLabelsFor } from "../../lib/feed/behavior";
import type { FeedCardV3 } from "../../lib/feed/card-types";
import { SWIPE_THRESHOLD_RATIO } from "../../lib/gesture/decide-swipe";
import { labelOpacity } from "../../lib/gesture/label-reveal";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

interface SwipeLabelsProps {
	card: FeedCardV3;
	/** Live horizontal drag offset from `useSwipeCard`. */
	tx: SharedValue<number>;
	cardWidth: number;
}

export function SwipeLabels({ card, tx, cardWidth }: SwipeLabelsProps) {
	const labels = swipeLabelsFor(card);
	// The card commits at 35% of its width, so the label must be at full
	// strength by then rather than at the full card width.
	const span = cardWidth * SWIPE_THRESHOLD_RATIO;

	/**
	 * Whether rest has been observed since mount. Starts false, latches true and
	 * never re-arms, so it costs one comparison per frame.
	 */
	const armed = useSharedValue(false);

	const rightStyle = useAnimatedStyle(() => {
		const r = labelOpacity({
			tx: tx.value,
			span,
			side: "right",
			armed: armed.value,
		});
		armed.value = r.armed;
		return { opacity: r.opacity };
	});
	const leftStyle = useAnimatedStyle(() => {
		// Reads the same latch but must not write it: two styles evaluating in one
		// frame would otherwise race to arm, and whichever ran second would see a
		// latch the first had already flipped and reveal on the inherited offset.
		const r = labelOpacity({
			tx: tx.value,
			span,
			side: "left",
			armed: armed.value,
		});
		return { opacity: r.opacity };
	});

	if (!labels) return null;

	return (
		<View style={styles.layer} pointerEvents="none">
			<Animated.View style={[styles.badge, styles.right, rightStyle]}>
				<Text style={[styles.label, styles.posLabel]}>{labels.right}</Text>
			</Animated.View>
			<Animated.View style={[styles.badge, styles.left, leftStyle]}>
				<Text style={[styles.label, styles.negLabel]}>{labels.left}</Text>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	layer: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
	badge: {
		position: "absolute",
		top: 72,
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: radii.btn,
		borderWidth: 2,
	},
	right: { left: 20, borderColor: colors.pos },
	left: { right: 20, borderColor: colors.neg },
	label: {
		...textStyles.caption,
		// §1.8: these sit over bright photos, so they need a shadow to stay legible.
		textShadowColor: "rgba(0,0,0,0.5)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 3,
	},
	posLabel: { color: colors.pos },
	negLabel: { color: colors.neg },
});
