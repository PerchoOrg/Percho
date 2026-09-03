/**
 * CardSkeleton (§1.9) — the first-load state.
 *
 * §1.9 is explicit that this is a card-shaped breathing skeleton and NOT a
 * spinner: the feed's first paint target is <800ms to interactive, and a spinner
 * reads as "something is wrong" where a card silhouette reads as "your cards are
 * coming". Breathing is opacity-only so it costs nothing on the UI thread.
 */
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { colors, radii } from "../../theme/tokens";

const BREATH_MS = 900;
const DIM = 0.45;

export function CardSkeleton() {
	const breath = useSharedValue(1);

	useEffect(() => {
		breath.value = withRepeat(
			withTiming(DIM, {
				duration: BREATH_MS,
				easing: Easing.inOut(Easing.quad),
			}),
			-1,
			true,
		);
	}, [breath]);

	const style = useAnimatedStyle(() => ({ opacity: breath.value }));

	return <Animated.View style={[styles.card, style]} />;
}

const styles = StyleSheet.create({
	card: {
		...StyleSheet.absoluteFill,
		backgroundColor: colors.surface2,
		borderRadius: radii.card,
	},
});
