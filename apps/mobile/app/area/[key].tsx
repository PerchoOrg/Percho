/**
 * `/area/[key]?lens=<lensId>` — one county's cost, and where it ranks.
 *
 * Both halves of this page used to live inside the Search tab's bottom sheet,
 * where they covered the map they were describing (owner, 2026-09-09: "show
 * those ranking only in detail page, not here … the map page only shows a
 * preview, not a full screen details that hide map itself"). The map keeps the
 * one-line preview and pushes here for the rest.
 *
 * Two sections, in the order a buyer asks them:
 *
 *   1. What this county costs — the breakdown, not just the total. The study's
 *      complaint was that nobody could tell buyers WHAT the money went to, and
 *      a single number repeats that. Every line names its own figure and its
 *      supplier, and the note underneath says which lines are still estimates.
 *   2. Where it stands — the same ranking the map's colours are painted from,
 *      for whichever lens the buyer had open, with this county marked. Tapping
 *      another county swaps the page to it rather than stacking a new one:
 *      the buyer is comparing, not navigating.
 */
import {
	type Area,
	LENSES,
	classBreaks,
	colorFor,
	costBreakdown,
	estimateNoteFor,
	lensById,
	listOf,
	rankedBy,
} from "@percho/shared/lenses";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAreas } from "../../hooks/use-areas";
import { areasByKey } from "../../lib/areas/areas-dto";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export default function AreaDetailScreen() {
	const insets = useSafeAreaInsets();
	const { key, lens: lensParam } = useLocalSearchParams<{
		key?: string;
		lens?: string;
	}>();
	const { areas: data, loading } = useAreas();

	// Falls back to the COST lens, not to `LENSES[0]`. Since phase274 the
	// catalogue leads with schools, and this page's top half is the cost
	// breakdown — a missing `?lens=` would have paired a tax-and-utilities
	// sheet with a school-proficiency ranking underneath it.
	const lens = lensById(lensParam ?? "") ?? lensById("true_cost") ?? LENSES[0];
	const area = key ? areasByKey(data.areas).get(key) : undefined;

	const ranked = useMemo(
		() => (lens ? rankedBy(lens, data.areas) : []),
		[lens, data.areas],
	);
	const breaks = useMemo(
		() => (lens ? classBreaks(lens, data.areas) : []),
		[lens, data.areas],
	);
	const estimateNote = useMemo(
		() => (lens ? estimateNoteFor(lens, data.areas) : undefined),
		[lens, data.areas],
	);

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
			<Pressable onPress={() => router.back()} hitSlop={10}>
				<Text style={styles.back}>‹ Map</Text>
			</Pressable>
			<Text style={styles.title}>
				{area ? `${area.name} County` : "This county"}
			</Text>

			<ScrollView
				style={styles.body}
				contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
			>
				{area ? (
					<CostSection area={area} />
				) : (
					<Text style={styles.empty}>
						{loading ? "Loading…" : "We don’t have this county’s figures yet."}
					</Text>
				)}

				{lens && ranked.length > 0 && (
					<>
						<Text style={styles.rankTitle}>{lens.rankTitle}</Text>
						<Text style={styles.rankCaption}>{lens.caption}</Text>
						{ranked.map((hit) => {
							const here = hit.area.key === key;
							return (
								<Pressable
									key={hit.area.key}
									style={[styles.rankRow, here && styles.rankRowHere]}
									onPress={() =>
										router.replace(`/area/${hit.area.key}?lens=${lens.id}`)
									}
								>
									<View
										style={[
											styles.rankSwatch,
											{ backgroundColor: colorFor(lens, hit.value, breaks) },
										]}
									/>
									<Text
										style={[styles.rankName, here && styles.rankNameHere]}
										numberOfLines={1}
									>
										{hit.area.name}
									</Text>
									<Text style={styles.rankValue}>
										{lens.format(hit.value)}
										{hit.estimated ? "*" : ""}
									</Text>
								</Pressable>
							);
						})}
						{estimateNote ? (
							<Text style={styles.estimateNote}>{estimateNote}</Text>
						) : null}
					</>
				)}
			</ScrollView>
		</View>
	);
}

/**
 * The county's monthly cost, broken into the lines that make it up.
 *
 * Moved verbatim from the Search tab's sheet (phase264 and earlier); the only
 * change is that it no longer carries a back link of its own — the page has one.
 */
function CostSection({ area }: { area: Area }) {
	const lines = costBreakdown(area);
	const total = lines?.reduce((n, l) => n + l.monthlyUsd, 0);
	const max = lines ? Math.max(...lines.map((l) => l.monthlyUsd)) : 0;
	const school = area.metrics.find(
		(m) => m.metric === "school_proficiency_pct",
	);
	// The state's own adopted rate, when we have it. Shown beside the estimate
	// rather than instead of it: it is the sourced fact, but it is the rate
	// BEFORE homestead exemptions and credits, so it is not what the cost lines
	// above are priced with. Saying both is the honest version of saying either.
	const statutory = area.metrics.find(
		(m) => m.metric === "property_tax_millage_statutory_pct",
	);
	// Which LINES are guesses, rather than whether the county has any guess in
	// it. Property tax and schools come from the state; water and trash have no
	// source at all. One banner over the whole sheet told a buyer to discount
	// figures we can defend.
	const estimatedLines = (lines ?? [])
		.filter((l) => l.estimated)
		.map((l) => l.label.toLowerCase());
	const asOf = area.metrics
		.filter((m) => !m.estimated)
		.map((m) => m.asOf)
		.sort()
		.at(-1);

	return (
		<View style={styles.cost}>
			{total !== undefined ? (
				<>
					<View style={styles.hero}>
						<Text style={styles.heroValue}>${total.toLocaleString()}</Text>
						<Text style={styles.heroUnit}>true cost /mo · $500k home</Text>
					</View>
					{lines?.map((line) => (
						<View key={line.label}>
							<View style={styles.row}>
								<Text style={styles.rowLabel} numberOfLines={1}>
									{line.label}
								</Text>
								<View style={styles.barTrack}>
									<View
										style={[
											styles.barFill,
											{
												width: `${Math.max(5, Math.round((line.monthlyUsd / max) * 100))}%`,
											},
										]}
									/>
								</View>
								<Text style={styles.rowValue}>
									${line.monthlyUsd}
									{line.estimated ? "*" : ""}
								</Text>
							</View>
							{/* Who supplies it, when we know. A bare "$157" is a number to
							    take on trust; "Georgia Power · 14.6¢ per kWh" is a number
							    the buyer can go and check. */}
							{line.note ? (
								<Text style={styles.rowNote} numberOfLines={2}>
									{line.note}
								</Text>
							) : null}
						</View>
					))}
				</>
			) : (
				<Text style={styles.empty}>
					We don’t have this county’s cost figures yet.
				</Text>
			)}

			{(school || statutory) && (
				<View style={styles.chips}>
					{school && (
						<View style={styles.chip}>
							<Text style={styles.chipText}>
								Schools{" "}
								<Text style={styles.chipValue}>
									{Math.round(school.value)}%
								</Text>{" "}
								proficient
							</Text>
						</View>
					)}
					{statutory && (
						<View style={styles.chip}>
							<Text style={styles.chipText}>
								Adopted tax rate{" "}
								<Text style={styles.chipValue}>
									{statutory.value.toFixed(2)}%
								</Text>{" "}
								before exemptions
							</Text>
						</View>
					)}
				</View>
			)}

			<Text style={styles.source}>
				{estimatedLines.length > 0
					? `Sourced from public records, except ${listOf(estimatedLines)} — those are still our estimate.`
					: "Every figure here is from a public record."}
				{asOf ? ` Most recent data ${asOf}.` : ""}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
	back: { ...textStyles.footnote, color: colors.accent, fontWeight: "600" },
	title: { ...textStyles.title2, color: colors.ink, marginTop: 6 },
	body: { flex: 1, marginTop: 12 },
	empty: { ...textStyles.body, color: colors.ink2, paddingVertical: 20 },

	// ── Cost breakdown ────────────────────────────────────────────────────────
	cost: { paddingBottom: 8 },
	hero: { flexDirection: "row", alignItems: "baseline", gap: 8 },
	heroValue: { ...textStyles.title1, color: colors.ink },
	heroUnit: { ...textStyles.caption, color: colors.ink2, flex: 1 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 7,
	},
	rowLabel: { ...textStyles.footnote, color: colors.ink2, width: 118 },
	barTrack: {
		flex: 1,
		height: 7,
		borderRadius: 4,
		backgroundColor: colors.surface2,
		overflow: "hidden",
	},
	barFill: { height: 7, borderRadius: 4, backgroundColor: colors.accent },
	rowValue: {
		...textStyles.footnote,
		color: colors.ink,
		width: 48,
		textAlign: "right",
	},
	rowNote: {
		...textStyles.caption,
		color: colors.ink3,
		marginTop: -3,
		marginBottom: 3,
		lineHeight: 14,
	},
	chips: { flexDirection: "row", gap: 6, marginTop: 10 },
	chip: {
		backgroundColor: colors.surface2,
		borderRadius: radii.tile,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	chipText: { ...textStyles.caption, color: colors.ink2 },
	chipValue: { color: colors.ink, fontWeight: "700" },
	source: {
		...textStyles.caption,
		color: colors.ink3,
		marginTop: 12,
		lineHeight: 15,
	},

	// ── Ranking ───────────────────────────────────────────────────────────────
	rankTitle: {
		...textStyles.caption,
		color: colors.ink3,
		textTransform: "uppercase",
		letterSpacing: 0.6,
		paddingTop: 26,
	},
	rankCaption: {
		...textStyles.footnote,
		color: colors.ink2,
		paddingTop: 4,
		paddingBottom: 8,
	},
	rankRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 9,
		paddingHorizontal: 8,
		borderRadius: radii.tile,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	rankRowHere: { backgroundColor: colors.surface2 },
	rankSwatch: { width: 14, height: 14, borderRadius: 4 },
	rankName: { ...textStyles.headline, color: colors.ink, flex: 1 },
	rankNameHere: { fontWeight: "700" },
	rankValue: { ...textStyles.headline, color: colors.ink2 },
	estimateNote: {
		...textStyles.caption,
		color: colors.ink3,
		paddingHorizontal: 8,
		paddingTop: 10,
	},
});
