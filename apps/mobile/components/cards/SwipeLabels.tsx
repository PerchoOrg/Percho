/**
 * SwipeLabels (§1.8) — the verdict a drag is about to give, drawn over the card.
 *
 * Until phase363 this was the owner's pick "D2": an 11pt word in a hairline box
 * near the top corner, fading in with the drag. On device it did not do its job
 * (owner, 2026-11-20: 「like pass太不明显了 没有起到作用」) — it was caption-sized,
 * sat among the card's own chrome, and looked the same at the commit threshold
 * as just short of it. It is now three things that all track the finger:
 *
 *   - a WASH of the verdict's colour over the whole card, so the direction
 *     reads from the edge of vision;
 *   - a MARK in the middle of the card — a disc with a heart or a cross and the
 *     word under it — that grows as the drag nears the threshold;
 *   - a LOCK: at the threshold the disc fills with the colour and pops, so the
 *     buyer can see that letting go now decides. A right swipe's haptic tick
 *     (§0.5) lands on the same frame.
 *
 * Copy is never authored here: it comes from `swipeLabelsFor(card)`, which is the
 * single resolution point for a card kind's swipe semantics. That is what keeps
 * "LIKE / PASS" on a listing and "TELL ME MORE / NOT FOR ME" on an area card
 * without this component knowing either exists.
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
	interpolateColor,
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { swipeLabelsFor } from "../../lib/feed/behavior";
import type { FeedCardV3 } from "../../lib/feed/card-types";
import { SWIPE_THRESHOLD_RATIO } from "../../lib/gesture/decide-swipe";
import { labelOpacity, verdictVisual } from "../../lib/gesture/label-reveal";
import { colors, fonts } from "../../theme/tokens";
import {
	TAB_BAR_BOX_CENTER_Y,
	TAB_BAR_FONT_FILL,
	TAB_BAR_GLYPH,
	TAB_BAR_GLYPH_CENTER_Y,
} from "../TabBarIconFont";

const DISC = 96;
const DISC_BORDER = 3;
/** The disc before the lock: a scrim, so the white mark reads over any frame. */
const DISC_REST = "rgba(0,0,0,0.35)";
/** How much the mark grows when it locks, and how fast. */
const LOCK_POP = 0.14;
const LOCK_MS = 120;
/**
 * The heart is the Saved tab's own drawing (the tab bar's fill font) — the card
 * icon font has no heart, and a second heart in the app should be the same one.
 */
const HEART = 50;
const HEART_SHIFT_Y =
	(TAB_BAR_GLYPH_CENTER_Y.saved - TAB_BAR_BOX_CENTER_Y) * HEART;
/** The cross is two bars: neither icon font carries one. */
const CROSS_LENGTH = 46;
const CROSS_WEIGHT = 7;

interface SwipeLabelsProps {
	card: FeedCardV3;
	/** Live horizontal drag offset from `useSwipeCard`. */
	tx: SharedValue<number>;
	cardWidth: number;
}

export function SwipeLabels({ card, tx, cardWidth }: SwipeLabelsProps) {
	const labels = swipeLabelsFor(card);
	// The card commits at 35% of its width, so the verdict must be at full
	// strength by then rather than at the full card width.
	const span = cardWidth * SWIPE_THRESHOLD_RATIO;

	/**
	 * Whether rest has been observed since mount. Starts false, latches true and
	 * never re-arms, so it costs one comparison per frame.
	 */
	const armed = useSharedValue(false);

	/**
	 * The drag as a share of the way to the commit threshold: 0 at rest, +1 at
	 * the right threshold, −1 at the left. Both sides read the latch as it was
	 * at the START of the frame, so the frame that arms it can never also reveal
	 * on the offset it inherited.
	 */
	const signed = useDerivedValue(() => {
		const was = armed.value;
		const right = labelOpacity({
			tx: tx.value,
			span,
			side: "right",
			armed: was,
		});
		const left = labelOpacity({ tx: tx.value, span, side: "left", armed: was });
		armed.value = right.armed;
		return right.opacity - left.opacity;
	});

	const washStyle = useAnimatedStyle(() => ({
		backgroundColor: signed.value >= 0 ? colors.pos : colors.neg,
		opacity: verdictVisual(Math.abs(signed.value)).wash,
	}));

	if (!labels) return null;

	return (
		<View style={styles.layer} pointerEvents="none">
			<Animated.View style={[StyleSheet.absoluteFill, washStyle]} />
			<VerdictMark signed={signed} side="right" label={labels.right} />
			<VerdictMark signed={signed} side="left" label={labels.left} />
		</View>
	);
}

interface VerdictMarkProps {
	signed: SharedValue<number>;
	side: "left" | "right";
	label: string;
}

function VerdictMark({ signed, side, label }: VerdictMarkProps) {
	const dir = side === "right" ? 1 : -1;
	const color = side === "right" ? colors.pos : colors.neg;

	const lock = useDerivedValue(() =>
		withTiming(verdictVisual(signed.value * dir).locked ? 1 : 0, {
			duration: LOCK_MS,
		}),
	);
	const markStyle = useAnimatedStyle(() => {
		const v = verdictVisual(signed.value * dir);
		return {
			opacity: v.markOpacity,
			transform: [{ scale: v.markScale * (1 + LOCK_POP * lock.value) }],
		};
	});
	const discStyle = useAnimatedStyle(() => ({
		backgroundColor: interpolateColor(lock.value, [0, 1], [DISC_REST, color]),
	}));

	return (
		<Animated.View style={[styles.mark, markStyle]}>
			<Animated.View style={[styles.disc, discStyle]}>
				{side === "right" ? (
					<Text allowFontScaling={false} style={styles.heart}>
						{TAB_BAR_GLYPH.saved}
					</Text>
				) : (
					<>
						<View style={[styles.crossBar, styles.crossDown]} />
						<View style={[styles.crossBar, styles.crossUp]} />
					</>
				)}
			</Animated.View>
			<Text
				allowFontScaling={false}
				numberOfLines={1}
				adjustsFontSizeToFit
				style={styles.label}
			>
				{label}
			</Text>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	layer: { ...StyleSheet.absoluteFill, zIndex: 20 },
	// The whole card, so the mark sits in its middle — clear of the place pill
	// and the corner control above and the title and rail below.
	mark: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
	},
	disc: {
		width: DISC,
		height: DISC,
		borderRadius: DISC / 2,
		borderWidth: DISC_BORDER,
		borderColor: colors.onCard,
		alignItems: "center",
		justifyContent: "center",
	},
	heart: {
		fontFamily: TAB_BAR_FONT_FILL,
		fontSize: HEART,
		lineHeight: HEART,
		width: HEART,
		textAlign: "center",
		includeFontPadding: false,
		color: colors.onCard,
		transform: [{ translateY: HEART_SHIFT_Y }],
	},
	crossBar: {
		position: "absolute",
		width: CROSS_LENGTH,
		height: CROSS_WEIGHT,
		borderRadius: CROSS_WEIGHT / 2,
		backgroundColor: colors.onCard,
	},
	crossDown: { transform: [{ rotate: "45deg" }] },
	crossUp: { transform: [{ rotate: "-45deg" }] },
	label: {
		marginTop: 14,
		fontFamily: fonts.ui,
		fontSize: 28,
		fontWeight: "800",
		letterSpacing: 2,
		color: colors.onCard,
		// §1.8: these sit over bright photos, so they need a shadow to stay legible.
		textShadowColor: "rgba(0,0,0,0.5)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 6,
	},
});
