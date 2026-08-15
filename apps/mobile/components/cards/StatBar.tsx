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
		minWidth: 0,
		/**
		 * `flex: 2` — the bar takes the bottom row's left two-thirds against
		 * the Explore CTA's `flex: 1` (owner 2026-08-19: 展开分隔信息,别和
		 * Explore 重合). NO `gap` on the row: with 7 children (4 cells +
		 * 3 dividers) a gap would shave ~56pt of cell width and force the
		 * values to shrink — the divider itself is the separator.
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
		/**
		 * Inner padding instead of row `gap` — cells flex-split the whole bar
		 * width, and the text breathing room comes out of the cell's own box.
		 */
		paddingHorizontal: 4,
	},
	/**
	 * The number — 16/600, white, never auto-shrunk. Started at the listing
	 * card's specs token (12.5) so all three card kinds matched, but the
	 * owner called that too small (2026-08-19: "还是小") — bumped to 16 while
	 * keeping `fontFamily` from the shared token. All 4 cells stay locked to
	 * this exact size (owner: 同一类型的文字大小要统一); it's the LABEL below
	 * that shrinks to fit a long string like "Cost of Living", never this.
	 */
	value: {
		...redlineText.listingCard.specs,
		fontSize: 16,
		lineHeight: 19,
		fontWeight: "600",
		color: "#FFFFFF",
	},
	/** The label — 9.5/500 muted white, under the value. FIXED size: no
	 *  auto-shrink, so a long label ("Cost of Living") never renders visibly
	 *  smaller than a short one ("Jobs") — owner 2026-08-19: 同一类型文字
	 *  大小要统一. Labels that don't fit are shortened in `place-stats`,
	 *  not scaled here. */
	label: {
		...redlineText.listingCard.specs,
		fontSize: 9.5,
		lineHeight: 12,
		fontWeight: "500",
		color: "rgba(255,255,255,0.65)",
		marginTop: 1,
	},
});
