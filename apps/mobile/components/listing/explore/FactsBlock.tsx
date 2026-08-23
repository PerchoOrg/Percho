/**
 * FactsBlock (phase118 spec §3.8) — "The rest of it", a 2-column grid of at
 * most 6 real fields (`lib/listing/facts.ts` owns which). The long tail of
 * questions belongs to the Ask entry, which ships in P1 with its LiteLLM
 * wiring — no dead pill is rendered meanwhile.
 */
import { StyleSheet, Text, View } from "react-native";
import type { FactItem } from "../../../lib/listing/facts";
import { explore, exploreRadii, fonts } from "../../../theme/tokens";

export function FactsBlock({ facts }: { facts: readonly FactItem[] }) {
	return (
		<View style={styles.grid}>
			{facts.map((f) => (
				<View key={f.label} style={styles.cell}>
					<Text style={styles.label}>{f.label}</Text>
					<Text style={styles.value} numberOfLines={1}>
						{f.value}
					</Text>
				</View>
			))}
			{/* Odd count: an empty filler keeps the last row's left cell half-width. */}
			{facts.length % 2 === 1 && <View style={styles.cell} />}
		</View>
	);
}

const styles = StyleSheet.create({
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		borderRadius: exploreRadii.sm,
		overflow: "hidden",
		backgroundColor: explore.line,
		gap: 1,
	},
	cell: {
		flexGrow: 1,
		flexBasis: "48%",
		backgroundColor: explore.bg,
		paddingHorizontal: 12,
		paddingVertical: 11,
	},
	label: {
		fontSize: 10,
		letterSpacing: 0.5,
		color: explore.muted,
		fontFamily: fonts.ui,
	},
	value: {
		fontSize: 13,
		fontWeight: "600",
		color: explore.ink,
		marginTop: 3,
		fontFamily: fonts.ui,
	},
});
