/**
 * Search tab — a placeholder until task 4 (spec-v3 `04-search.md`).
 *
 * Exists so `TabBar`'s 4-tab contract has 4 real routes. It states what is
 * coming rather than pretending to be a search screen: a fake input that returns
 * nothing is worse than an honest empty tab.
 */
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export default function SearchTab() {
	return (
		<View style={styles.screen}>
			<Text style={styles.title}>Search</Text>
			<Text style={styles.sub}>The map and journey layer land in task 4.</Text>
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
