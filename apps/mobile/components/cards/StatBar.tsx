/**
 * StatBar — the divided 4-cell info row shared by the Community and City
 * cards (owner 2026-08-19: same gradient + info cell layout as the listing
 * card's specs bar).
 *
 * Renders `Schools 8/10 | Safety 9/10 | Convenience 106 | Growth +6.2%` —
 * each cell is label (small, muted) over value (larger, white), separated by
 * 1px vertical hairlines. Pure presentational: data comes in via `cells`.
 */
import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StatCell } from "../../lib/feed/place-stats";
import { redlineText } from "../../theme/typography";

interface StatBarProps {
	cells: StatCell[];
}

export function StatBar({ cells }: StatBarProps) {
	return (
		<View style={styles.bar}>
			{cells.map((cell, i) => (
				<Fragment key={cell.label}>
					{i > 0 && <View style={styles.divider} />}
					<View style={styles.cell}>
						<Text style={styles.value} numberOfLines={1}>
							{cell.value}
						</Text>
						<Text style={styles.label} numberOfLines={1}>
							{cell.label}
						</Text>
					</View>
				</Fragment>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minWidth: 0,
		flex: 1,
	},
	divider: {
		width: 1,
		height: 22,
		backgroundColor: "rgba(255,255,255,0.35)",
	},
	cell: {
		flex: 1,
		minWidth: 0,
	},
	/** The number — 14/600 white, the row's anchor. */
	value: {
		...redlineText.listingCard.specs,
		fontSize: 14,
		lineHeight: 17,
		fontWeight: "600",
		color: "#FFFFFF",
	},
	/** The label — 9.5/500 muted white, under the value. */
	label: {
		...redlineText.listingCard.specs,
		fontSize: 9.5,
		lineHeight: 12,
		fontWeight: "500",
		color: "rgba(255,255,255,0.65)",
		marginTop: 1,
	},
});
