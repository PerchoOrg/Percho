/**
 * SeenBadge (§1.9) — the micro-mark on a looped card.
 *
 * Once the pool is exhausted the feed is allowed to recycle cards, and this is
 * the honesty marker for that: without it a returning card reads as a bug ("why
 * am I being asked this again?"). `generateFeed` reports which ids were looped
 * via `loopedIds`, so the caller renders this only on genuine repeats.
 */
import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export function SeenBadge() {
	return (
		<View style={styles.badge}>
			<Text style={styles.label}>SEEN</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	badge: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: radii.pill,
		backgroundColor: colors.glass,
	},
	label: { ...textStyles.caption, color: colors.ink2 },
});
