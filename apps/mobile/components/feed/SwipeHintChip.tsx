/**
 * The feed's one line of teaching (phase414): "Swipe for the next place", on
 * the first card of a first visit, leaning the way the swipe goes.
 *
 * It replaces the card moving by itself. That showed a like and then a pass
 * (phase365) — what a swipe meant until it stopped being a verdict — and the
 * owner's report was that a new buyer still did not know what to do with the
 * first card (2026-11-27: 「看到第一个有点不知所措」). A sentence says it.
 *
 * When it shows is `state/swipe-hint.ts`'s business, not this file's.
 */
import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/** How far the chip leans, and how long one lean takes. */
const LEAN_PT = 10;
const LEAN_MS = 650;

export function SwipeHintChip() {
	const x = useSharedValue(0);
	useEffect(() => {
		x.value = withRepeat(
			withTiming(-LEAN_PT, {
				duration: LEAN_MS,
				easing: Easing.inOut(Easing.quad),
			}),
			-1,
			true,
		);
	}, [x]);
	const lean = useAnimatedStyle(() => ({
		transform: [{ translateX: x.value }],
	}));
	return (
		<Animated.View style={[styles.chip, lean]}>
			<Text style={styles.text}>← Swipe for the next place</Text>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	chip: {
		height: 36,
		paddingHorizontal: 16,
		borderRadius: 18,
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.94)",
		shadowColor: "rgba(0,0,0,0.25)",
		shadowOffset: { width: 0, height: 2 },
		shadowRadius: 10,
		shadowOpacity: 1,
	},
	text: { ...textStyles.footnote, fontWeight: "600", color: colors.ink },
});
