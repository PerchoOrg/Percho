/**
 * CostBlock (phase118 spec §3.7) — "What you'd actually pay".
 *
 * The big number is the estimated MONTHLY payment; the four bars break it into
 * P&I / tax / insurance / HOA at widths proportional to their share. All the
 * math and the assumptions line live in `lib/listing/cost.ts`; this file only
 * draws. The Adjust affordance is P1 — no dead link is rendered for it.
 */
import { StyleSheet, Text, View } from "react-native";
import type { CostBreakdown } from "../../../lib/listing/cost";
import { formatUsd } from "../../../lib/listing/monthly";
import { explore, fonts } from "../../../theme/tokens";

/** Bar tints, darkest = largest component (from the reference). */
const TINTS = [
	explore.brand,
	explore.costBar2,
	explore.costBar3,
	explore.costBar4,
] as const;
/** Widest bar's track length in pt. */
const MAX_BAR = 148;

export interface CostBlockProps {
	cost: CostBreakdown;
	assumptionLine: string;
}

export function CostBlock({ cost, assumptionLine }: CostBlockProps) {
	const rows = [
		{ label: "Principal & interest", value: cost.principalInterestUsd },
		{ label: "Property tax", value: cost.taxUsd },
		{ label: "Insurance", value: cost.insuranceUsd },
		...(cost.hoaUsd !== undefined
			? [{ label: "HOA", value: cost.hoaUsd }]
			: []),
	];
	const max = Math.max(...rows.map((r) => r.value), 1);

	return (
		<View>
			<View style={styles.head}>
				<Text style={styles.big}>{formatUsd(cost.totalUsd)}</Text>
				<Text style={styles.per}>/ month estimated</Text>
			</View>
			<View style={styles.bars}>
				{rows.map((row, i) => (
					<View key={row.label} style={styles.bar}>
						<View
							style={[
								styles.fill,
								{
									width: Math.max((row.value / max) * MAX_BAR, 4),
									backgroundColor: TINTS[i] ?? explore.brand,
								},
							]}
						/>
						<Text style={styles.label}>{row.label}</Text>
						<Text style={styles.value}>{formatUsd(row.value)}</Text>
					</View>
				))}
			</View>
			<Text style={styles.assume}>{assumptionLine}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	head: { flexDirection: "row", alignItems: "baseline", gap: 9 },
	big: {
		fontSize: 28,
		fontWeight: "700",
		letterSpacing: -0.8,
		color: explore.ink,
		fontFamily: fonts.ui,
		fontVariant: ["tabular-nums"],
	},
	per: { fontSize: 12.5, color: explore.muted, fontFamily: fonts.ui },
	bars: { marginTop: 15 },
	bar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginBottom: 8,
	},
	fill: { height: 8, borderRadius: 4 },
	label: { fontSize: 12, color: explore.ink, fontFamily: fonts.ui },
	value: {
		marginLeft: "auto",
		fontSize: 12,
		color: explore.muted,
		fontFamily: fonts.ui,
		fontVariant: ["tabular-nums"],
	},
	assume: {
		fontSize: 10.5,
		lineHeight: 15.5,
		color: explore.muted,
		marginTop: 11,
		fontFamily: fonts.ui,
	},
});
