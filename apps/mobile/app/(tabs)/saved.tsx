/**
 * Saved tab — a placeholder until task 5 (spec-v3 `05-tabs.md`).
 *
 * Exists so `TabBar`'s 4-tab contract has 4 real routes. It shows no count and
 * no empty-state illustration: nothing reads the buyer's saves yet, and a "0
 * saved" would be a claim this screen cannot currently make.
 */
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export default function SavedTab() {
	return (
		<View style={styles.screen}>
			<Text style={styles.title}>Saved</Text>
			<Text style={styles.sub}>Your saved homes and areas land in task 5.</Text>
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
