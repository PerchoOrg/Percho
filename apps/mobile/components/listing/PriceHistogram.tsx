/**
 * PriceHistogram (§2.1 #5 / §2.4 #3) — the 7-bucket distribution, at two sizes.
 *
 * One component for the mini chart on the data face and the full-size one in the
 * Comps section, because they must be the same chart: the bar the buyer taps at
 * 44pt tall is provably the bar they land on at 120pt.
 *
 * All three renderings of `PriceDistribution` are handled here so no caller can
 * forget the degraded ones:
 *   `chart`   → bars, subject bar in accent.
 *   `summary` → "median $612K · 30 sales" on ONE line, no bars. §2.1 #5's iron
 *               law: fewer than 5 samples must not be drawn as a distribution.
 *   `empty`   → nothing at all. Not an axis with no bars.
 *
 * The bar heights are proportional to the tallest bucket rather than to the
 * sample count, so a thin cohort still reads as a shape. A minimum height keeps
 * a 1-count bucket visible — a bar rounded to 0px reads as "no homes here",
 * which is a different claim than "one home here".
 */
import { StyleSheet, Text, View } from "react-native";
import type { PriceDistribution } from "../../lib/listing/histogram";
import { formatCompactUsd } from "../../lib/listing/histogram";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

interface PriceHistogramProps {
	distribution: PriceDistribution;
	/** `mini` = data face (§2.1 #5); `full` = Comps section (§2.4 #3). */
	size?: "mini" | "full";
}

const BAR_AREA: Record<"mini" | "full", number> = { mini: 44, full: 120 };
const MIN_BAR = 3;

export function PriceHistogram({
	distribution,
	size = "mini",
}: PriceHistogramProps) {
	if (distribution.kind === "empty") return null;

	if (distribution.kind === "summary") {
		return (
			<Text style={styles.summary}>
				{`median ${formatCompactUsd(distribution.medianUsd)} · ${distribution.sampleSize} ${
					distribution.sampleSize === 1 ? "listing" : "listings"
				}`}
			</Text>
		);
	}

	const area = BAR_AREA[size];
	const tallest = Math.max(...distribution.buckets.map((b) => b.count), 1);
	const first = distribution.buckets[0];
	const last = distribution.buckets[distribution.buckets.length - 1];

	return (
		<View>
			<View style={[styles.bars, { height: area }]}>
				{distribution.buckets.map((bucket) => (
					<View
						key={bucket.fromUsd}
						style={[
							styles.bar,
							{
								height: Math.max((bucket.count / tallest) * area, MIN_BAR),
								backgroundColor: bucket.isSubject
									? colors.accentOnCard
									: colors.onCardDim,
							},
						]}
					/>
				))}
			</View>
			{size === "full" && !!first && !!last && (
				<View style={styles.axis}>
					<Text style={styles.axisLabel}>
						{formatCompactUsd(first.fromUsd)}
					</Text>
					<Text style={styles.axisLabel}>{formatCompactUsd(last.toUsd)}</Text>
				</View>
			)}
			<Text style={styles.caption}>
				{distribution.subjectBucketIndex === -1
					? // The subject sits outside the cohort's range. Saying so is the
						// honest rendering; clamping it into the end bar would tell the
						// buyer this home is merely "at the top of the range".
						`${distribution.cohortLabel} · ${distribution.sampleSize} listings · this home is outside this range`
					: `${distribution.cohortLabel} · ${distribution.sampleSize} listings · this home highlighted`}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	bars: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 4,
		marginTop: 10,
	},
	bar: { flex: 1, borderRadius: radii.tile / 4 },
	axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
	axisLabel: { ...textStyles.caption, color: colors.onCardDim },
	caption: { ...textStyles.caption, color: colors.onCardDim, marginTop: 8 },
	summary: { ...textStyles.body, color: colors.onCard, marginTop: 8 },
});
