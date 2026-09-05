/**
 * RatingBars — the review dimension averages as bars out of 5.
 *
 * They used to be one run-on line ("Quiet 4.5 · Walkable 3.8 · Neighbourly
 * 4.7 · Value 4.1"), which is four numbers a reader has to compare in their
 * head. Four bars answer "which of these is this neighbourhood actually good
 * at" without being read.
 *
 * Fixed 0–5 scale, unlike `NearbyChart`'s relative one: a rating means the
 * same thing everywhere, so scaling it to the best dimension on this
 * community would flatter every community equally.
 */
import { StyleSheet, Text, View } from "react-native";
import {
	REVIEW_DIMENSION_LABELS,
	type ReviewDimension,
} from "../../lib/reviews/reviews";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export interface RatingBarsProps {
	dimensionAvgs: Partial<Record<ReviewDimension, number>>;
}

const MAX_RATING = 5;

export function RatingBars({ dimensionAvgs }: RatingBarsProps) {
	const rows = Object.entries(dimensionAvgs) as [ReviewDimension, number][];
	if (rows.length === 0) return null;
	return (
		<View style={styles.bars}>
			{rows.map(([dim, avg]) => (
				<View key={dim} style={styles.row}>
					<Text style={styles.label}>{REVIEW_DIMENSION_LABELS[dim]}</Text>
					<View style={styles.track}>
						<View
							style={[styles.fill, { width: `${(avg / MAX_RATING) * 100}%` }]}
						/>
					</View>
					<Text style={styles.value}>{avg.toFixed(1)}</Text>
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	bars: { gap: 9, paddingVertical: 12 },
	row: { flexDirection: "row", alignItems: "center", gap: 10 },
	label: { ...textStyles.footnote, color: colors.ink2, width: 74 },
	track: {
		flex: 1,
		height: 8,
		borderRadius: radii.pill,
		backgroundColor: colors.surface2,
		overflow: "hidden",
	},
	fill: { height: 8, borderRadius: radii.pill, backgroundColor: colors.accent },
	value: {
		...textStyles.headline,
		color: colors.ink,
		width: 30,
		textAlign: "right",
		fontVariant: ["tabular-nums"],
	},
});
