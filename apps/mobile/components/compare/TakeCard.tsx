/**
 * TakeCard (phase270) — a compare screen's opening move: the suggestion
 * itself, spoken like a person, sitting above the numbers that back it.
 *
 * The lead wears the serif (`serifBody`) on purpose — §0.4 reserves that face
 * for "worth reading slowly", and one honest paragraph of advice is exactly
 * that. The points beneath it are evidence, so they drop back to the UI face
 * the tables use.
 */
import { StyleSheet, Text, View } from "react-native";
import type { CompareTake } from "../../lib/compare/take";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export function TakeCard({ take }: { take: CompareTake }) {
	return (
		<View style={styles.card}>
			<Text style={styles.head}>Percho’s take</Text>
			<Text style={styles.lead}>{take.lead}</Text>
			{take.points.map((p) => (
				<View key={p} style={styles.pointRow}>
					<Text style={styles.bullet}>—</Text>
					<Text style={styles.point}>{p}</Text>
				</View>
			))}
			{take.caveat ? <Text style={styles.caveat}>{take.caveat}</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: 1,
		borderColor: colors.border,
		padding: 16,
		gap: 8,
		marginBottom: 20,
	},
	head: { ...textStyles.caption, color: colors.accent },
	lead: { ...textStyles.serifBody, color: colors.ink, lineHeight: 25 },
	pointRow: { flexDirection: "row", gap: 8, paddingRight: 8 },
	bullet: { ...textStyles.footnote, color: colors.ink3 },
	point: {
		...textStyles.footnote,
		color: colors.ink2,
		flex: 1,
		lineHeight: 18,
	},
	caveat: {
		...textStyles.footnote,
		color: colors.ink2,
		fontStyle: "italic",
		lineHeight: 18,
		marginTop: 2,
	},
});
