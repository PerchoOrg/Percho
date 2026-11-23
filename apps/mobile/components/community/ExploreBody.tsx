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
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
	againstBaseline,
	axisTop,
	closeBy,
	linkGroups,
	localDay,
	nearbyStops,
	schoolName,
	schoolRanks,
	topShare,
	upcomingEvents,
} from "../../lib/community/explore";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { BottomSheet } from "../BottomSheet";
import { Lines } from "./ExploreCharts";
import { GAP, PAGE_PAD, Resources, Tile, parts } from "./ExploreParts";
import { ExploreSheet, type ExploreSheetKey } from "./ExploreSheets";

/** Sheets tall enough to need most of the screen; the rest open half-way. */
const TALL: ReadonlySet<ExploreSheetKey> = new Set([
	"cost",
	"schools",
	"homeValue",
	"dues",
	"words",
]);

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

			<View style={parts.grid}>
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
						<View style={parts.rows}>
							{safety.rows.map((r) => (
								<View key={r.label} style={parts.row}>
									<Text style={parts.rowKind} numberOfLines={1}>
										{r.label}
									</Text>
									<Text style={parts.rowName} numberOfLines={1}>
										{r.name}
									</Text>
									{!!r.note && <Text style={parts.rowAside}>{r.note}</Text>}
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
						<View style={parts.rows}>
							{schools.map((r) => (
								<View key={r.label} style={parts.row}>
									<Text
										style={parts.rowName}
										numberOfLines={1}
										adjustsFontSizeToFit
										minimumFontScale={0.85}
									>
										{schoolName(r)}
									</Text>
									{!!r.distance && (
										<Text style={parts.rowAside}>{r.distance}</Text>
									)}
									<Text style={parts.rowShare}>{topShare(r)}</Text>
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
						<View style={parts.rows}>
							{closeBy(nearby).map((s) => (
								<View key={s.group} style={parts.row}>
									<Text style={parts.rowKind} numberOfLines={1}>
										{s.group}
									</Text>
									<Text style={parts.rowName} numberOfLines={1}>
										{s.name}
									</Text>
									<Text style={parts.rowAside}>{s.miles} mi</Text>
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
						<Text style={parts.figure}>{homeValue.display}</Text>
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
						<Text style={parts.foot}>{homeValue.change}</Text>
						{againstMetro && (
							<Text
								style={parts.footSecond}
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
							<Text style={parts.figure}>
								{holding.display}
								<Text style={parts.figureUnit}>{"  a month"}</Text>
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
						<Text style={parts.figure}>
							{dues.display}
							<Text style={parts.figureUnit}>{`  ${dues.period}`}</Text>
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
							style={parts.figure}
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.7}
						>
							“{words.lead}”
						</Text>
						<Text style={parts.foot}>{words.leadNote}</Text>
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

			<Resources groups={resources} />

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
});
