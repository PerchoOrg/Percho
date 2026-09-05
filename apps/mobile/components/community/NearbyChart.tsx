/**
 * NearbyChart — how many real places of each kind are near this community.
 *
 * The counts already existed: `fetchPoiCounts` has always fed the reason
 * tiles' evidence ("39 restaurants"), but only three or four of them ever
 * reached the screen, one sentence at a time. Sending the whole map and
 * charting it turns the page's densest text section into its densest numbers
 * (owner 2026-09-05: "better visualization, with numbers as much as possible").
 *
 * Bars are scaled to the LARGEST count on this community, not to a fixed
 * ceiling — the question a buyer asks here is "what is this neighbourhood
 * heavy on", which is a comparison within the place, not against other places.
 * Counting rule and what is deliberately not charted: see
 * `apps/web/lib/communities/detail.ts`.
 *
 * Interactive because the list is long (13 kinds on Peachtree Corners): the
 * top five are open, the rest are one tap away.
 */
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { bucketLabel } from "../../lib/community/tour-buckets";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export interface NearbyChartProps {
	nearby: readonly { bucket: string; count: number }[];
}

/** How many bars are open before the buyer asks for the rest. */
const COLLAPSED = 5;

export function NearbyChart({ nearby }: NearbyChartProps) {
	const [expanded, setExpanded] = useState(false);

	// A bucket the phone has no label for is not charted: an unnamed bar is a
	// number attached to nothing. Same rule the jump strip follows.
	const rows = nearby
		.map((n) => ({ ...n, label: bucketLabel(n.bucket) }))
		.filter((n): n is typeof n & { label: string } => n.label !== null);
	if (rows.length === 0) return null;

	const max = Math.max(...rows.map((r) => r.count));
	const shown = expanded ? rows : rows.slice(0, COLLAPSED);
	const hidden = rows.length - shown.length;

	return (
		<View style={styles.chart}>
			{shown.map((r) => (
				<View key={r.bucket} style={styles.row}>
					<Text style={styles.label}>{r.label}</Text>
					<View style={styles.track}>
						<View
							style={[styles.fill, { width: `${(r.count / max) * 100}%` }]}
						/>
					</View>
					<Text style={styles.count}>{r.count}</Text>
				</View>
			))}
			{hidden > 0 && (
				<Pressable
					onPress={() => setExpanded(true)}
					accessibilityRole="button"
					style={styles.more}
				>
					<Text style={styles.moreTxt}>{`Show ${hidden} more`}</Text>
				</Pressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	chart: { gap: 9 },
	row: { flexDirection: "row", alignItems: "center", gap: 10 },
	/** Fixed so every bar starts on the same x — a ragged left reads as noise. */
	label: { ...textStyles.footnote, color: colors.ink2, width: 74 },
	track: {
		flex: 1,
		height: 8,
		borderRadius: radii.pill,
		backgroundColor: colors.surface2,
		overflow: "hidden",
	},
	fill: { height: 8, borderRadius: radii.pill, backgroundColor: colors.accent },
	count: {
		...textStyles.headline,
		color: colors.ink,
		width: 30,
		textAlign: "right",
		fontVariant: ["tabular-nums"],
	},
	more: { paddingTop: 2, alignSelf: "flex-start" },
	moreTxt: { ...textStyles.footnote, color: colors.accent },
});
