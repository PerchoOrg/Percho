/**
 * OfflineBar (§1.9) — a thin bar stating that cached cards are being shown.
 *
 * Wording matters here: §1.9 says "Offline — showing cached homes", i.e. it tells
 * the user what they ARE seeing rather than what failed. Swipes keep working and
 * queue locally (`state/event-queue.ts`), so this is informational, not an error
 * and not a blocker — it has no retry button and no dismiss.
 */
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export function OfflineBar() {
	return (
		<View style={styles.bar} accessibilityRole="alert">
			<Text style={styles.text}>Offline — showing cached homes</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		paddingVertical: 6,
		paddingHorizontal: 16,
		backgroundColor: colors.surface2,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
		alignItems: "center",
	},
	text: { ...textStyles.caption, color: colors.ink2 },
});
