/**
 * StatBand — the community's demographic figures as numerals, not sentences.
 *
 * Owner 2026-09-05: "with numbers as much as possible, text is not preferred".
 * These were `label ——— value` rows in a bordered card, which reads as a form.
 * Same three figures, printed the way the listing page prints a price: the
 * number large, its name small underneath.
 *
 * Values are rendered VERBATIM ("1,622", "84%", "48") — the seed decided how
 * they are punctuated and the page must not re-round them.
 */
import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export interface StatBandProps {
	stats: readonly { label: string; value: string }[];
}

export function StatBand({ stats }: StatBandProps) {
	if (stats.length === 0) return null;
	return (
		<View style={styles.band}>
			{stats.map((s) => (
				<View key={s.label} style={styles.tile}>
					<Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
						{s.value}
					</Text>
					<Text style={styles.label}>{s.label}</Text>
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	band: { flexDirection: "row", gap: 8 },
	tile: {
		flex: 1,
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		paddingVertical: 14,
		paddingHorizontal: 10,
		gap: 4,
	},
	value: {
		...textStyles.title1,
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	label: { ...textStyles.caption, color: colors.ink2, lineHeight: 13 },
});
