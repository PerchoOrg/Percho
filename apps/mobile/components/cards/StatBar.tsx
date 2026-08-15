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
						<Text
							style={styles.value}
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.7}
						>
							{cell.value}
						</Text>
						<Text
							style={styles.label}
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.7}
						>
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
		gap: 8,
		minWidth: 0,
		/**
		 * `flex: 2` — the bar takes the bottom row's left two-thirds against
		 * the Explore CTA's `flex: 1` (owner 2026-08-19: 展开分隔信息,别和
		 * Explore 重合). With 1:1 the 4 cells got squeezed and labels
		 * ellipsized.
		 */
		flex: 2,
	},
	divider: {
		width: 1,
		height: 20,
		backgroundColor: "rgba(255,255,255,0.35)",
	},
	cell: {
		flex: 1,
		minWidth: 0,
	},
	/** The number — 13/600 white, the row's anchor. */
	value: {
		...redlineText.listingCard.specs,
		fontSize: 13,
		lineHeight: 16,
		fontWeight: "600",
		color: "#FFFFFF",
	},
	/** The label — 9/500 muted white, under the value. */
	label: {
		...redlineText.listingCard.specs,
		fontSize: 9,
		lineHeight: 11,
		fontWeight: "500",
		color: "rgba(255,255,255,0.65)",
		marginTop: 1,
	},
});
