import { estimateNoteForRows } from "@percho/shared/lenses";
/**
 * `/compare-areas?keys=cobb,forsyth[,dekalb]` — 2–3 areas side by side.
 *
 * Pushed from the Saved tab when two or more saved areas resolve to counties
 * we have figures for. The table is `lib/areas/compare-areas.ts`; this screen
 * only renders it.
 *
 * The lens map answers "where should I look?"; this answers "which of my
 * two or three?" — which the buyer study says is where most of our users
 * actually are. It marks the best cell in each row, because every row here is
 * one measured quantity with an agreed direction. The table still marks no
 * overall winner; since phase270 the OPINION lives above it instead, in the
 * take (`lib/areas/take.ts`, owner: results "should look like a real
 * suggestion from a friend or agent"), labelled as an opinion and built from
 * exactly the rows below.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TakeCard } from "../components/compare/TakeCard";
import { useAreas } from "../hooks/use-areas";
import { areasByKey } from "../lib/areas/areas-dto";
import {
	AREA_COMPARE_MAX,
	AREA_COMPARE_MIN,
	buildAreaCompareTable,
} from "../lib/areas/compare-areas";
import { buildAreaTake } from "../lib/areas/take";
import { splitRows } from "../lib/compare/take";
import { usePriorityStore } from "../state/priorities";
import { colors, explore, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

export default function CompareAreasScreen() {
	const insets = useSafeAreaInsets();
	const { keys } = useLocalSearchParams<{ keys?: string }>();
	const { areas: data, loading } = useAreas();
	// The buyer's declared priorities reorder the rows so the table opens on
	// what they said matters. Nothing is added, dropped or reweighted.
	const weights = usePriorityStore((s) => s.weights);
	const [showAll, setShowAll] = useState(false);

	const wanted = (keys ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, AREA_COMPARE_MAX);

	const byKey = areasByKey(data.areas);
	// Keep the caller's order — it is the order the buyer saved them in.
	const areas = wanted.flatMap((k) => {
		const a = byKey.get(k);
		return a ? [a] : [];
	});

	const table = buildAreaCompareTable(areas, weights);
	// Owner: "reduce the numbers part it is not very useful." Ordered by the
	// buyer's priorities first, so the rows that survive are the ones they
	// asked for; the rest are one tap away.
	const { shown, collapsible } = splitRows(table.rows, showAll);
	// Names which ROWS are guesses rather than implying the table is one. The
	// property tax row comes from the GA DOR; the old sentence covered it too.
	const estimateNote = estimateNoteForRows(table.rows);

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
			<Text style={styles.back} onPress={() => router.back()}>
				‹ Back
			</Text>
			<Text style={styles.title}>Side by side</Text>
			<Text style={styles.sub}>
				The same $500k home, in each of your areas.
			</Text>

			{areas.length === 0 ? (
				<Text style={styles.empty}>
					{loading ? "Loading…" : "We don’t have figures for these areas yet."}
				</Text>
			) : (
				<ScrollView
					style={styles.body}
					contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
				>
					{areas.length >= AREA_COMPARE_MIN && (
						<TakeCard take={buildAreaTake(areas, weights)} />
					)}
					<View style={styles.headerRow}>
						{table.headers.map((h) => (
							<View key={h.key} style={styles.headerCell}>
								<Text style={styles.headerName} numberOfLines={2}>
									{h.name}
								</Text>
								<Text style={styles.headerSub}>County</Text>
							</View>
						))}
					</View>

					{shown.map((row) => (
						<View key={row.label} style={styles.rowBlock}>
							<Text style={styles.rowLabel}>{row.label}</Text>
							{row.note ? <Text style={styles.rowNote}>{row.note}</Text> : null}
							<View style={styles.cells}>
								{row.cells.map((cell, i) => (
									<View
										// Column position is the identity here — the same area can
										// legitimately appear under two different labels.
										key={`${row.label}-${table.headers[i]?.key ?? i}`}
										style={[styles.cell, cell.best && styles.cellBest]}
									>
										<Text
											style={[
												styles.cellValue,
												cell.best && styles.cellBestTxt,
											]}
										>
											{cell.text ?? "—"}
											{cell.estimated ? "*" : ""}
										</Text>
									</View>
								))}
							</View>
						</View>
					))}

					{collapsible && (
						<Pressable
							style={styles.more}
							onPress={() => setShowAll((v) => !v)}
							accessibilityRole="button"
						>
							<Text style={styles.moreTxt}>
								{showAll
									? "Show fewer"
									: `Show all ${table.rows.length} figures`}
							</Text>
						</Pressable>
					)}

					<Text style={styles.foot}>
						Green marks the better figure in a row. The take at the top is our
						read of these rows and nothing else — how much schools weigh against
						cost is still your call, and no row below marks an overall winner.
						{estimateNote ? ` ${estimateNote}` : ""}
					</Text>
				</ScrollView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
	back: {
		...textStyles.headline,
		color: colors.accent,
		minHeight: 44,
		paddingTop: 10,
	},
	title: { ...textStyles.title1, color: colors.ink },
	sub: { ...textStyles.footnote, color: colors.ink2, marginTop: 4 },
	body: { flex: 1, marginTop: 16 },
	empty: { ...textStyles.body, color: colors.ink2, marginTop: 32 },
	headerRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
	headerCell: { flex: 1, alignItems: "center" },
	headerName: {
		...textStyles.headline,
		color: colors.ink,
		textAlign: "center",
	},
	headerSub: { ...textStyles.caption, color: colors.ink3 },
	rowBlock: { marginTop: 14 },
	rowLabel: {
		...textStyles.caption,
		color: colors.ink3,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	rowNote: { ...textStyles.caption, color: colors.ink3, marginTop: 1 },
	cells: { flexDirection: "row", gap: 8, marginTop: 6 },
	cell: {
		flex: 1,
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: 1,
		borderColor: colors.border,
		paddingVertical: 10,
		alignItems: "center",
	},
	// The explore page's "match" pair — this cell means the same thing there
	// (a figure that goes the buyer's way), so it wears the same colour.
	cellBest: { backgroundColor: explore.posBg, borderColor: explore.posBg },
	cellValue: { ...textStyles.headline, color: colors.ink },
	cellBestTxt: { color: explore.posInk },
	more: { minHeight: 44, justifyContent: "center", marginTop: 16 },
	moreTxt: { ...textStyles.footnote, fontWeight: "600", color: colors.accent },
	foot: {
		...textStyles.caption,
		color: colors.ink3,
		marginTop: 20,
		lineHeight: 15,
	},
});
