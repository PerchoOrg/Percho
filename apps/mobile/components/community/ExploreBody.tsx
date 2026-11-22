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
	Image,
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import {
	againstBaseline,
	axisTop,
	closeBy,
	linkGroups,
	localDay,
	logoFor,
	nearbyStops,
	schoolName,
	schoolRanks,
	topShare,
	upcomingEvents,
} from "../../lib/community/explore";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { BottomSheet } from "../BottomSheet";
import { Lines } from "./ExploreCharts";
import { ExploreSheet, type ExploreSheetKey } from "./ExploreSheets";

/** The page's side padding and the gap between two tiles — a half tile's width follows from both. */
const PAGE_PAD = 18;
const GAP = 10;

/** Sheets tall enough to need most of the screen; the rest open half-way. */
const TALL: ReadonlySet<ExploreSheetKey> = new Set([
	"cost",
	"schools",
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
	const schools = schoolRanks(profile.ranks);
	const { homeValue, dues, words, verdict, safety } = profile;
	const holding = homeValue?.holding;
	const resources = useMemo(() => linkGroups(profile.links), [profile.links]);
	const againstMetro = homeValue ? againstBaseline(homeValue) : null;
	const sparkMax = homeValue
		? axisTop(homeValue.series.flatMap((p) => [p.value, p.baseline]))
		: 1;
	// Half tiles sit two to a row; when their number is odd the last one takes
	// the row, so the grid never ends on a hole. A computed profile often has
	// one or none (no dues without research, no words without Nextdoor).
	const halves = [dues && "dues", words && "words"].filter(Boolean);
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
				{/* The page's four directions, in the order the owner names them
				    (安 学 便 潜 — spec-v3 03 §3.3), then what it costs. Titles are
				    his, 2026-11-22: "safety, schools, convenience, potential,
				    cost". */}
				{safety && (
					<Tile
						label="Safety"
						wide
						width={half}
						onPress={() => setSheet("safety")}
					>
						<View style={styles.rows}>
							{safety.rows.map((r) => (
								<View key={r.label} style={styles.row}>
									<Text style={styles.rowKind} numberOfLines={1}>
										{r.label}
									</Text>
									<Text style={styles.rowName} numberOfLines={1}>
										{r.name}
									</Text>
									{!!r.note && <Text style={styles.rowAside}>{r.note}</Text>}
								</View>
							))}
						</View>
					</Tile>
				)}

				{/* One line a school: its name in full, how far it is, and its
				    standing as a share — in the row's own type, not a headline
				    figure (owner 2026-11-22: "太多行了 学校名字用全称在一行里 去掉底下
				    的说明", then "school不要绿色的大字 正常就行 加上距离"). What the
				    share is of, and that these are nearby rather than assigned, is
				    said in the sheet. Before phase368 this was "Where it ranks":
				    "#452 / of 1,220 in GA", which he read as noise. */}
				{schools.length > 0 && (
					<Tile
						label="Schools"
						wide
						width={half}
						onPress={() => setSheet("schools")}
					>
						<View style={styles.rows}>
							{schools.map((r) => (
								<View key={r.label} style={styles.row}>
									<Text
										style={styles.rowName}
										numberOfLines={1}
										adjustsFontSizeToFit
										minimumFontScale={0.85}
									>
										{schoolName(r)}
									</Text>
									{!!r.distance && (
										<Text style={styles.rowAside}>{r.distance}</Text>
									)}
									<Text style={styles.rowShare}>{topShare(r)}</Text>
								</View>
							))}
						</View>
					</Tile>
				)}

				{/* A place of each kind and how far it is (phase369) — it was
				    "15 of 15" over a strip of dots, a count of the film's stops. */}
				{nearby && (
					<Tile
						label="Convenience"
						wide
						width={half}
						onPress={() => setSheet("nearby")}
					>
						<View style={styles.rows}>
							{closeBy(nearby).map((s) => (
								<View key={s.group} style={styles.row}>
									<Text style={styles.rowKind} numberOfLines={1}>
										{s.group}
									</Text>
									<Text style={styles.rowName} numberOfLines={1}>
										{s.name}
									</Text>
									<Text style={styles.rowAside}>{s.miles} mi</Text>
								</View>
							))}
						</View>
					</Tile>
				)}

				{homeValue && (
					<Tile
						label="Potential"
						wide
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
						{againstMetro && (
							<Text
								style={styles.footSecond}
								numberOfLines={1}
								adjustsFontSizeToFit
								minimumFontScale={0.85}
							>
								{againstMetro}
							</Text>
						)}
					</Tile>
				)}

				{/* A month of owning before the mortgage. On every computed
				    profile since phase340, and until phase370 only inside the
				    home value sheet. Potential has a row to itself and this sits
				    under it (owner 2026-11-22: "Potential 单独一行 Cost 放下面"). */}
				{holding && (
					<Tile label="Cost" wide width={half} onPress={() => setSheet("cost")}>
						<View style={styles.costSplit}>
							<Text style={styles.figure}>
								{holding.display}
								<Text style={styles.figureUnit}>{"  a month"}</Text>
							</Text>
							<View style={styles.costRows}>
								{holding.rows.slice(0, 4).map((r) => (
									<View key={r.label} style={styles.costRow}>
										<Text style={styles.costLabel} numberOfLines={1}>
											{r.label}
										</Text>
										<Text style={styles.costValue}>${r.usd}</Text>
									</View>
								))}
							</View>
						</View>
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

			{/* Resources: the links under their headings, each with its site's
			    own mark before the word (owner 2026-11-22: "链接最好用logo和文字
			    更醒目"). A row scrolls sideways, so a heading costs one line
			    however many links it holds. */}
			{resources.length > 0 && (
				<View style={styles.resources}>
					<Text style={styles.tileLabel}>Resources</Text>
					{resources.map((g) => (
						<View key={g.group} style={styles.resourceRow}>
							<Text style={styles.resourceGroup} numberOfLines={1}>
								{g.group}
							</Text>
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								style={styles.resourceScroll}
								contentContainerStyle={styles.pills}
							>
								{g.links.map((l) => {
									const logo = logoFor(l.url);
									return (
										<Pressable
											key={l.url}
											style={({ pressed }) => [
												styles.pill,
												pressed && styles.pressed,
											]}
											onPress={() =>
												void Linking.openURL(l.url).catch(() => {})
											}
											accessibilityRole="link"
										>
											{!!logo && (
												<Image source={{ uri: logo }} style={styles.pillLogo} />
											)}
											<Text style={styles.pillText}>{l.label}</Text>
										</Pressable>
									);
								})}
							</ScrollView>
						</View>
					))}
				</View>
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
	markWatch: { backgroundColor: colors.watch },
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
	 * `ink2`, not the accent (phase367). Six coloured labels were the loudest
	 * thing in the grid, ahead of the figures they name. The accent on this
	 * page is the finding itself — a rank, the community's line on a chart.
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
	footSecond: {
		...textStyles.footnote,
		fontSize: 11.5,
		color: colors.ink2,
		marginTop: 1,
	},

	/** A wide tile's rows: a name on one line, its figure at the right edge. */
	rows: { marginTop: 4 },
	row: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 10,
		paddingVertical: 4,
	},
	rowKind: {
		...textStyles.footnote,
		fontSize: 12,
		color: colors.ink2,
		width: 84,
	},
	rowName: {
		...textStyles.footnote,
		fontSize: 14,
		fontWeight: "600",
		color: colors.ink,
		flex: 1,
		minWidth: 0,
	},
	/** A distance, a zone: the row's quieter second fact. */
	rowAside: {
		...textStyles.footnote,
		fontSize: 13,
		color: colors.ink2,
		fontVariant: ["tabular-nums"],
	},
	/** A school's standing, in the row's own type. Wide enough for "Top 100%". */
	rowShare: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "600",
		color: colors.ink,
		width: 62,
		textAlign: "right",
		fontVariant: ["tabular-nums"],
	},
	/** The figure on the left, what it is made of on the right. */
	costSplit: { flexDirection: "row", alignItems: "flex-start", gap: 20 },
	costRows: { flex: 1, marginTop: 8, gap: 2 },
	costRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
	costLabel: {
		...textStyles.footnote,
		fontSize: 11.5,
		color: colors.ink2,
		flexShrink: 1,
	},
	costValue: {
		...textStyles.footnote,
		fontSize: 11.5,
		fontWeight: "600",
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},

	spark: { marginTop: 6 },
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
	resources: { marginTop: 18, gap: 8 },
	resourceRow: { flexDirection: "row", alignItems: "center" },
	resourceGroup: {
		...textStyles.footnote,
		fontSize: 12,
		color: colors.ink2,
		width: 76,
	},
	// A row of links runs to the screen's right edge; the heading keeps the
	// page's inset.
	resourceScroll: { marginRight: -PAGE_PAD },
	pills: { paddingRight: PAGE_PAD, gap: 7 },
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 11,
		paddingVertical: 7,
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
	pillLogo: { width: 16, height: 16, borderRadius: 4 },
});
