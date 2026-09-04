/**
 * RoiBlock (phase D) — "If you rented it out", directly under the cost block.
 *
 * One editable input (monthly rent, prefilled with the ZIP's typical
 * single-family rent when we have it) and four figures the buyer study
 * asked for. The math is `lib/listing/roi.ts`; this file draws and owns the
 * text field. The rent line names its source and month so the default is
 * never mistaken for "this house rents for".
 */
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { CostBreakdown } from "../../../lib/listing/cost";
import type { RentEstimateDTO } from "../../../lib/listing/detail-dto";
import { formatUsd } from "../../../lib/listing/monthly";
import {
	DEFAULT_VACANCY_RATE,
	computeRoi,
	formatPct,
} from "../../../lib/listing/roi";
import { explore, exploreRadii, fonts } from "../../../theme/tokens";

export interface RoiBlockProps {
	priceUsd: number;
	downFraction: number;
	cost: CostBreakdown;
	rentEstimate?: RentEstimateDTO;
}

/** "2026-07-31" → "Jul 2026". */
function monthLabel(iso: string): string {
	const d = new Date(`${iso}T00:00:00Z`);
	return Number.isNaN(d.getTime())
		? iso
		: d.toLocaleDateString("en-US", {
				month: "short",
				year: "numeric",
				timeZone: "UTC",
			});
}

export function RoiBlock({
	priceUsd,
	downFraction,
	cost,
	rentEstimate,
}: RoiBlockProps) {
	const [rentText, setRentText] = useState(
		rentEstimate ? String(rentEstimate.monthlyUsd) : "",
	);
	const rent = Number.parseInt(rentText.replace(/[^0-9]/g, ""), 10);
	const roi =
		Number.isFinite(rent) && rent > 0
			? computeRoi({ priceUsd, downFraction, monthlyRentUsd: rent, cost })
			: null;

	const figures = roi
		? [
				{
					label: "Cash flow",
					value: `${roi.monthlyCashFlowUsd < 0 ? "−" : "+"}${formatUsd(Math.abs(roi.monthlyCashFlowUsd))}/mo`,
					neg: roi.monthlyCashFlowUsd < 0,
				},
				{
					label: "Cap rate",
					value: formatPct(roi.capRate),
					neg: roi.capRate < 0,
				},
				{
					label: "Cash-on-cash",
					value: formatPct(roi.cashOnCash),
					neg: roi.cashOnCash < 0,
				},
				{ label: "Gross yield", value: formatPct(roi.grossYield), neg: false },
			]
		: [];

	return (
		<View>
			<View style={styles.inputRow}>
				<Text style={styles.inputLabel}>Monthly rent</Text>
				<View style={styles.field}>
					<Text style={styles.dollar}>$</Text>
					<TextInput
						value={rentText}
						onChangeText={setRentText}
						keyboardType="number-pad"
						placeholder="0"
						placeholderTextColor={explore.muted}
						style={styles.input}
						accessibilityLabel="Monthly rent"
					/>
				</View>
			</View>
			<Text style={styles.source}>
				{rentEstimate
					? `Typical single-family rent in ${rentEstimate.zip} — ${rentEstimate.source}, ${monthLabel(rentEstimate.asOf)}. Edit it.`
					: "No rent index for this ZIP — type what you'd charge."}
			</Text>
			{roi && (
				<View style={styles.grid}>
					{figures.map((f) => (
						<View key={f.label} style={styles.cell}>
							<Text style={[styles.figure, f.neg && styles.figureNeg]}>
								{f.value}
							</Text>
							<Text style={styles.figureLabel}>{f.label}</Text>
						</View>
					))}
				</View>
			)}
			<Text style={styles.assume}>
				{`After the costs above, ${Math.round(DEFAULT_VACANCY_RATE * 100)}% vacancy, before income tax and appreciation. Not investment advice.`}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	inputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	inputLabel: { fontSize: 12.5, color: explore.ink, fontFamily: fonts.ui },
	field: {
		marginLeft: "auto",
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: explore.chip,
		borderRadius: exploreRadii.sm,
		paddingHorizontal: 12,
		height: 36,
		minWidth: 120,
	},
	dollar: { fontSize: 14, color: explore.muted, fontFamily: fonts.ui },
	input: {
		flex: 1,
		fontSize: 15,
		fontWeight: "600",
		color: explore.ink,
		fontFamily: fonts.ui,
		fontVariant: ["tabular-nums"],
		paddingVertical: 0,
		paddingLeft: 2,
	},
	source: {
		fontSize: 10.5,
		lineHeight: 15,
		color: explore.muted,
		marginTop: 8,
		fontFamily: fonts.ui,
	},
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginTop: 14,
		rowGap: 12,
	},
	cell: { width: "50%" },
	figure: {
		fontSize: 19,
		fontWeight: "700",
		letterSpacing: -0.4,
		color: explore.brand,
		fontFamily: fonts.ui,
		fontVariant: ["tabular-nums"],
	},
	figureNeg: { color: explore.negInk },
	figureLabel: {
		fontSize: 11,
		color: explore.muted,
		marginTop: 2,
		fontFamily: fonts.ui,
	},
	assume: {
		fontSize: 10.5,
		lineHeight: 15.5,
		color: explore.muted,
		marginTop: 12,
		fontFamily: fonts.ui,
	},
});
