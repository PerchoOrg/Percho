/**
 * You tab — a placeholder until task 5 (spec-v3 `05-tabs.md`).
 *
 * Exists so `TabBar`'s 4-tab contract has 4 real routes. Deliberately does NOT
 * offer the scope-reset control yet: `clearSignals()` exists in the session
 * store, but §5's You tab is meant to show the buyer what it is about to erase
 * before erasing it, and a bare "reset" button with no scope recap is a
 * destructive action with no preview.
 */
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export default function YouTab() {
	return (
		<View style={styles.screen}>
			<Text style={styles.title}>You</Text>
			<Text style={styles.sub}>
				Your scope, persona and saved searches land in task 5.
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.bg,
		alignItems: "center",
		justifyContent: "center",
		padding: 24,
		gap: 8,
	},
	title: { ...textStyles.title1, color: colors.ink },
	sub: { ...textStyles.body, color: colors.ink2, textAlign: "center" },
});
