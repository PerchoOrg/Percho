/**
 * TradeoffFace (§1.6) — the "force a priority" card: a visually split face whose
 * two halves track the drag.
 *
 * §1.6 red lines, both structural here:
 *   - NEVER a ✓ / ✗ or yes/no glyph anywhere on this card. The only feedback is
 *     brightness: the half being chosen goes to opacity 1, the discarded half to
 *     0.4, following the finger. Nothing in this file renders a mark.
 *   - The split is a 1.5px DASHED line.
 *
 * `tx` is the live drag offset owned by `useSwipeCard` (via `SwipeStack`), so the
 * brightening is a worklet with no JS-thread round trip. At rest both halves sit
 * at `REST_OPACITY` — dimmed, per §1.6's "两半各自渐变压暗".
 *
 * The option labels come off the card; the dim phrasing comes from the shared
 * `DIMS` vocabulary. No copy is authored here.
 */
import { DIMS } from "@percho/shared";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
	type SharedValue,
	interpolate,
	useAnimatedStyle,
} from "react-native-reanimated";
import type { TradeoffCardV3 } from "../../lib/feed/card-types";
import { SWIPE_THRESHOLD_RATIO } from "../../lib/gesture/decide-swipe";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { KindChip } from "../KindChip";
import { CardSurface } from "./CardSurface";

const REST_OPACITY = 0.72;
const CHOSEN_OPACITY = 1;
const DISCARDED_OPACITY = 0.4; // §1.6, verbatim
const SPLIT_WIDTH = 1.5; // §1.6, verbatim

interface TradeoffFaceProps {
	card: TradeoffCardV3;
	/** Live horizontal drag offset from `useSwipeCard`. */
	tx: SharedValue<number>;
	cardWidth: number;
}

export function TradeoffFace({ card, tx, cardWidth }: TradeoffFaceProps) {
	// The card commits at 35% of its width, so brightness must reach full
	// strength by then — interpolating over the whole width would barely move.
	const span = cardWidth * SWIPE_THRESHOLD_RATIO;

	const leftStyle = useAnimatedStyle(() => ({
		opacity: interpolate(
			tx.value,
			[-span, 0, span],
			[CHOSEN_OPACITY, REST_OPACITY, DISCARDED_OPACITY],
			"clamp",
		),
	}));

	const rightStyle = useAnimatedStyle(() => ({
		opacity: interpolate(
			tx.value,
			[-span, 0, span],
			[DISCARDED_OPACITY, REST_OPACITY, CHOSEN_OPACITY],
			"clamp",
		),
	}));

	return (
		<View style={styles.face}>
			<CardSurface />
			<View style={styles.head}>
				<KindChip label="TRADE-OFF" />
			</View>
			<View style={styles.split}>
				<Animated.View style={[styles.half, leftStyle]}>
					<Text style={styles.arrow}>←</Text>
					<Text style={styles.label}>{card.left.label}</Text>
					<Text style={styles.dim}>{DIMS[card.left.dim].label}</Text>
				</Animated.View>
				<View style={styles.rule} />
				<Animated.View style={[styles.half, rightStyle]}>
					<Text style={styles.arrow}>→</Text>
					<Text style={styles.label}>{card.right.label}</Text>
					<Text style={styles.dim}>{DIMS[card.right.dim].label}</Text>
				</Animated.View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: colors.cardPlainTo },
	head: {
		position: "absolute",
		top: 16,
		left: 16,
		zIndex: 2,
	},
	split: { flex: 1, flexDirection: "row" },
	half: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
		gap: 8,
	},
	rule: {
		width: SPLIT_WIDTH,
		borderLeftWidth: SPLIT_WIDTH,
		borderStyle: "dashed",
		borderLeftColor: colors.onCardDim,
	},
	arrow: { ...textStyles.title2, color: colors.onCardDim },
	label: { ...textStyles.title2, color: colors.onCard, textAlign: "center" },
	dim: { ...textStyles.caption, color: colors.onCardDim, textAlign: "center" },
});
