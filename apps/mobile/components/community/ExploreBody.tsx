/**
 * The community explore page for a community that has a profile (phase339):
 * six verdict lines, then tiles.
 *
 * Owner 2026-11-15 asked for "信息量 … real insights … 不要太多文字 多一点图表",
 * then said of the eight-section answer "太长了 没人会看这么多". So the page is
 * one screen. A tile is a finding — a figure or a word, one small chart, at
 * most one line — and tapping it opens the chart that proves it
 * (`ExploreSheets.tsx`). Nobody has to open a sheet to get the page.
 *
 * A tile is drawn only when its block exists: a profile is researched one
 * block at a time, and the nearby tile comes from the film, not the profile.
 */
import type { CommunityProfile } from "@percho/shared/community-profile";
import type { TourSegment } from "@percho/shared/tour-buckets";
import { useMemo, useState } from "react";
import {
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import {
	NEAR_MILES,
	axisTop,
	localDay,
	nearbyStops,
	tileRanks,
	upcomingEvents,
} from "../../lib/community/explore";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { BottomSheet } from "../BottomSheet";
import { Lines, RankTrack, StopStripMini } from "./ExploreCharts";
import { ExploreSheet, type ExploreSheetKey } from "./ExploreSheets";

/** The page's side padding and the gap between two tiles — a half tile's width follows from both. */
const PAGE_PAD = 18;
const GAP = 10;

/** Sheets tall enough to need most of the screen; the rest open half-way. */
const TALL: ReadonlySet<ExploreSheetKey> = new Set([
	"ranks",
	"homeValue",
	"dues",
	"words",
]);

function Tile({
	label,
	wide,
	width,
	onPress,
	children,
}: {
	label: string;
	wide?: boolean;
	width: number;
	onPress: () => void;
	children: React.ReactNode;
}) {
	return (
		<Pressable
			style={({ pressed }) => [
				styles.tile,
				{ width: wide ? width * 2 + GAP : width },
				pressed && styles.pressed,
			]}
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${label} — more`}
		>
			<View style={styles.tileHead}>
				<Text style={styles.tileLabel}>{label}</Text>
				<Text style={styles.chevron}>›</Text>
			</View>
			{children}
		</Pressable>
	);
}

export function ExploreBody({
	profile,
	segments,
	interests,
}: {
	profile: CommunityProfile;
	segments: readonly TourSegment[] | undefined;
	interests: readonly string[];
}) {
	const { width: screenW } = useWindowDimensions();
	// Floored, so two halves and their gap never round up past the row.
	const half = Math.floor((screenW - PAGE_PAD * 2 - GAP) / 2);
	const [sheet, setSheet] = useState<ExploreSheetKey | null>(null);

	const nearby = useMemo(() => nearbyStops(segments), [segments]);
	const events = useMemo(
		() => upcomingEvents(profile.events, localDay(new Date())),
		[profile.events],
	);
	const ranks = tileRanks(profile.ranks);
	const { homeValue, dues, words, verdict } = profile;
	const sparkMax = homeValue
		? axisTop(homeValue.series.flatMap((p) => [p.value, p.baseline]))
		: 1;
	// Half tiles sit two to a row; when their number is odd the last one takes
	// the row, so the grid never ends on a hole. A computed profile often has
	// only one or three (no dues without research, no nearby without a film).
	const halves = [
		homeValue && "homeValue",
		dues && "dues",
		nearby && "nearby",
		words && "words",
	].filter(Boolean);
	const lone = halves.length % 2 === 1 ? halves[halves.length - 1] : null;

	return (
		<>
			{/* A computed profile leads with a finding only when one is strong
			    enough; with none, the page opens on its tiles. */}
			{verdict.good.length + verdict.watch.length > 0 && (
				<View style={styles.verdict}>
					{verdict.good.length > 0 && (
						<View style={styles.verdictCol}>
							{verdict.good.map((line) => (
								<View key={line} style={styles.verdictLine}>
									<View style={[styles.mark, styles.markGood]}>
										<Text style={styles.markText}>✓</Text>
									</View>
									<Text style={styles.verdictText}>{line}</Text>
								</View>
							))}
						</View>
					)}
					{verdict.watch.length > 0 && (
						<View style={styles.verdictCol}>
							{verdict.watch.map((line) => (
								<View key={line} style={styles.verdictLine}>
									<View style={[styles.mark, styles.markWatch]}>
										<Text style={styles.markText}>!</Text>
									</View>
									<Text style={styles.verdictText}>{line}</Text>
								</View>
							))}
						</View>
					)}
				</View>
			)}

			<View style={styles.grid}>
				{ranks.length > 0 && (
					<Tile
						label="Where it ranks"
						wide
						width={half}
						onPress={() => setSheet("ranks")}
					>
						<View style={styles.rankCells}>
							{ranks.map((r) => (
								<View key={r.label} style={styles.rankCell}>
									<Text style={styles.rankFigure}>{r.tile}</Text>
									<Text style={styles.rankLabel} numberOfLines={1}>
										{r.label}
									</Text>
									<Text style={styles.tiny} numberOfLines={1}>
										{r.of}
									</Text>
									<RankTrack percentile={r.percentile} small />
								</View>
							))}
						</View>
						{/* Whose schools these are — nearby, not assigned — belongs
						    beside the ranks, not behind a tap. */}
						{!!profile.ranks?.note && (
							<Text style={styles.tileNote} numberOfLines={2}>
								{profile.ranks.note}
							</Text>
						)}
					</Tile>
				)}

				{homeValue && (
					<Tile
						label="Home value"
						wide={lone === "homeValue"}
						width={half}
						onPress={() => setSheet("homeValue")}
					>
						<Text style={styles.figure}>{homeValue.display}</Text>
						<View style={styles.spark}>
							<Lines
								height={34}
								max={sparkMax}
								series={[
									{
										values: homeValue.series.map((p) => p.baseline),
										color: colors.seriesMuted,
										weight: 1.5,
									},
									{
										values: homeValue.series.map((p) => p.value),
										color: colors.accent,
										weight: 2,
										endDot: true,
									},
								]}
							/>
						</View>
						<Text style={styles.foot}>{homeValue.change}</Text>
					</Tile>
				)}

				{dues && (
					<Tile
						label="Dues"
						wide={lone === "dues"}
						width={half}
						onPress={() => setSheet("dues")}
					>
						<Text style={styles.figure}>
							{dues.display}
							<Text style={styles.figureUnit}>{`  ${dues.period}`}</Text>
						</Text>
						<View style={styles.covers}>
							<Text style={styles.cover}>
								<Text style={styles.coverYes}>✓ </Text>
								{dues.tile.included}
							</Text>
							<Text style={[styles.cover, styles.coverOff]}>
								<Text style={styles.coverNo}>✕ </Text>
								{dues.tile.separate}
							</Text>
						</View>
					</Tile>
				)}

				{nearby && (
					<Tile
						label="Nearby"
						wide={lone === "nearby"}
						width={half}
						onPress={() => setSheet("nearby")}
					>
						<Text style={styles.figure}>
							{nearby.near} of {nearby.stops.length}
						</Text>
						<View style={styles.strip}>
							<StopStripMini view={nearby} />
						</View>
						<Text style={styles.foot}>stops within {NEAR_MILES} miles</Text>
					</Tile>
				)}

				{words && (
					<Tile
						label="Residents say"
						wide={lone === "words"}
						width={half}
						onPress={() => setSheet("words")}
					>
						<Text
							style={styles.figure}
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.7}
						>
							“{words.lead}”
						</Text>
						<Text style={styles.foot}>{words.leadNote}</Text>
					</Tile>
				)}

				{events.length > 0 && (
					<Tile
						label="Coming up"
						wide
						width={half}
						onPress={() => setSheet("events")}
					>
						<View style={styles.eventCells}>
							{events.slice(0, 3).map((e) => (
								<View key={e.key} style={styles.eventCell}>
									<Text style={styles.eventWhen} numberOfLines={1}>
										{e.when}
									</Text>
									<Text style={styles.eventTitle} numberOfLines={2}>
										{e.title}
									</Text>
								</View>
							))}
						</View>
					</Tile>
				)}
			</View>

			{(profile.links?.length ?? 0) > 0 && (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={styles.pillsBleed}
					contentContainerStyle={styles.pills}
				>
					{profile.links?.map((l) => (
						<Pressable
							key={l.url}
							style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
							onPress={() => void Linking.openURL(l.url).catch(() => {})}
							accessibilityRole="link"
						>
							<Text style={styles.pillText}>
								{l.label}
								<Text style={styles.pillMark}> ↗</Text>
							</Text>
						</Pressable>
					))}
				</ScrollView>
			)}

			<BottomSheet
				visible={sheet !== null}
				detent={sheet && TALL.has(sheet) ? "large" : "medium"}
				onClose={() => setSheet(null)}
			>
				{sheet && (
					<ExploreSheet
						which={sheet}
						profile={profile}
						nearby={nearby}
						events={events}
						interests={interests}
					/>
				)}
			</BottomSheet>
		</>
	);
}

const styles = StyleSheet.create({
	pressed: { opacity: 0.7 },

	verdict: { flexDirection: "row", gap: GAP, marginTop: 14 },
	verdictCol: { flex: 1, gap: 7 },
	verdictLine: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
	mark: {
		width: 16,
		height: 16,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 1,
	},
	markGood: { backgroundColor: colors.pos },
	markWatch: { backgroundColor: colors.accent },
	markText: {
		...textStyles.footnote,
		fontSize: 10.5,
		fontWeight: "700",
		lineHeight: 14,
		color: colors.surface,
	},
	verdictText: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "600",
		lineHeight: 17,
		color: colors.ink,
		flex: 1,
	},

	grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, marginTop: 16 },
	tile: {
		backgroundColor: colors.surface,
		borderRadius: radii.btn,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
		paddingHorizontal: 12,
		paddingTop: 10,
		paddingBottom: 12,
	},
	tileHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	/**
	 * `ink2`, not amber (phase367). Six amber labels were the loudest thing in
	 * the grid, ahead of the figures they name. Amber on this page is now the
	 * finding itself — a rank, the community's line on a chart.
	 */
	tileLabel: { ...textStyles.caption, fontSize: 10.5, color: colors.ink2 },
	chevron: {
		...textStyles.footnote,
		fontSize: 18,
		lineHeight: 18,
		color: colors.ink3,
	},
	figure: {
		...textStyles.title2,
		fontSize: 24,
		color: colors.ink,
		marginTop: 4,
	},
	figureUnit: { ...textStyles.footnote, fontSize: 12, color: colors.ink2 },
	foot: {
		...textStyles.footnote,
		fontSize: 11.5,
		color: colors.ink2,
		marginTop: 5,
	},
	tiny: { ...textStyles.footnote, fontSize: 10.5, color: colors.ink2 },
	tileNote: {
		...textStyles.footnote,
		fontSize: 10.5,
		lineHeight: 14,
		color: colors.ink2,
		marginTop: 6,
	},

	rankCells: { flexDirection: "row", gap: GAP, marginTop: 6 },
	rankCell: { flex: 1, minWidth: 0 },
	rankFigure: { ...textStyles.title2, fontSize: 20, color: colors.accent },
	rankLabel: {
		...textStyles.footnote,
		fontSize: 11.5,
		fontWeight: "600",
		color: colors.ink,
		marginTop: 1,
	},

	spark: { marginTop: 6 },
	strip: { marginTop: 6 },
	covers: { marginTop: 7, gap: 3 },
	cover: {
		...textStyles.footnote,
		fontSize: 12,
		fontWeight: "500",
		color: colors.ink,
	},
	coverOff: { color: colors.ink2 },
	coverYes: { color: colors.pos, fontWeight: "700" },
	coverNo: { color: colors.neg, fontWeight: "700" },

	eventCells: { flexDirection: "row", gap: 8, marginTop: 7 },
	eventCell: {
		flex: 1,
		minWidth: 0,
		backgroundColor: colors.surface2,
		borderRadius: 10,
		paddingHorizontal: 8,
		paddingVertical: 7,
	},
	eventWhen: {
		...textStyles.caption,
		fontSize: 9.5,
		letterSpacing: 0.8,
		color: colors.ink2,
	},
	eventTitle: {
		...textStyles.footnote,
		fontSize: 12,
		fontWeight: "600",
		lineHeight: 15,
		color: colors.ink,
		marginTop: 1,
	},

	// The pill row runs to the screen's edges; its content keeps the page's inset.
	pillsBleed: { marginHorizontal: -PAGE_PAD, marginTop: 14 },
	pills: { paddingHorizontal: PAGE_PAD, gap: 7 },
	pill: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: radii.pill,
		backgroundColor: colors.surface,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.border,
	},
	pillText: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "500",
		color: colors.ink,
	},
	pillMark: { color: colors.accent, fontWeight: "600" },
});
