/**
 * The community explore page for a community that has a profile (phase339):
 * tiles. (It opened on up to six verdict lines until phase373, when the owner
 * had the intro under the name removed.)
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
import { GLANCE_TOPICS, type GlanceTopic } from "@percho/shared/glance";
import { rankShare } from "@percho/shared/rank-share";
import type { TourSegment } from "@percho/shared/tour-buckets";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
	againstBaseline,
	axisTop,
	closeBy,
	linkGroups,
	localDay,
	milesOf,
	nearbyStops,
	schoolName,
	schoolRanks,
	upcomingEvents,
} from "../../lib/community/explore";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { BottomSheet } from "../BottomSheet";
import { Bar, Donut, Ring, seriesColor } from "../charts/Marks";
import { Lines } from "./ExploreCharts";
import { GAP, PAGE_PAD, Resources, Tile, parts } from "./ExploreParts";
import { ExploreSheet, type ExploreSheetKey } from "./ExploreSheets";

/** Sheets tall enough to need most of the screen; the rest open half-way. */
const TALL: ReadonlySet<ExploreSheetKey> = new Set([
	"cost",
	"schools",
	"homeValue",
	"dues",
]);

/** The tile each topic of a feed figure names (`@percho/shared/glance`). */
const TILE_FOR_TOPIC: Record<GlanceTopic, ExploreSheetKey> = {
	safety: "safety",
	schools: "schools",
	convenience: "nearby",
	potential: "homeValue",
	cost: "cost",
};

/**
 * The sheet the page opens on, when it was reached from a figure under the
 * feed card (phase378) — and only for a tile this profile draws, so a figure
 * can never open an empty sheet.
 */
function tileToOpen(
	open: string | undefined,
	profile: CommunityProfile,
	segments: readonly TourSegment[] | undefined,
): ExploreSheetKey | null {
	const topic = GLANCE_TOPICS.find((t) => t === open);
	if (!topic) return null;
	const drawn: Record<GlanceTopic, boolean> = {
		safety: !!profile.safety,
		schools: schoolRanks(profile.ranks).length > 0,
		convenience: nearbyStops(segments) !== null,
		potential: !!profile.homeValue,
		cost: !!profile.homeValue?.holding,
	};
	return drawn[topic] ? TILE_FOR_TOPIC[topic] : null;
}

export function ExploreBody({
	profile,
	segments,
	open,
}: {
	profile: CommunityProfile;
	segments: readonly TourSegment[] | undefined;
	/** A feed figure's topic: the page opens on that tile's sheet. */
	open?: string | undefined;
}) {
	const { width: screenW } = useWindowDimensions();
	// Floored, so two halves and their gap never round up past the row.
	const half = Math.floor((screenW - PAGE_PAD * 2 - GAP) / 2);
	const [sheet, setSheet] = useState<ExploreSheetKey | null>(() =>
		tileToOpen(open, profile, segments),
	);

	const nearby = useMemo(() => nearbyStops(segments), [segments]);
	const events = useMemo(
		() => upcomingEvents(profile.events, localDay(new Date())),
		[profile.events],
	);
	const schools = schoolRanks(profile.ranks);
	const close = nearby ? closeBy(nearby) : [];
	// The bars share one scale: the farthest of the places the tile names.
	const farthest = Math.max(1, ...close.map((s) => s.miles));
	// The verdict lines under the name and the "Residents say" tile are not
	// drawn (owner 2026-11-22: "去掉 … explore下面的简介", "resident say没啥价值
	// 去掉"). `profile.verdict` and `profile.words` are still stored: build 12
	// reads them.
	const { homeValue, dues, safety } = profile;
	const holding = homeValue?.holding;
	const resources = useMemo(() => linkGroups(profile.links), [profile.links]);
	const againstMetro = homeValue ? againstBaseline(homeValue) : null;
	const sparkMax = homeValue
		? axisTop(homeValue.series.flatMap((p) => [p.value, p.baseline]))
		: 1;

	return (
		<>
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
						{/* A distance is a figure (phase390); the flood zone is a word
						    and stays a row. */}
						{safety.rows.some((r) => milesOf(r.note) !== null) && (
							<View style={parts.cells}>
								{safety.rows
									.filter((r) => milesOf(r.note) !== null)
									.map((r) => (
										<View key={r.label} style={parts.cell}>
											<Text style={parts.cellLabel}>{r.label}</Text>
											<Text style={parts.cellFigure}>{r.note}</Text>
											<Text style={parts.cellName} numberOfLines={1}>
												{r.name}
											</Text>
										</View>
									))}
							</View>
						)}
						<View style={parts.rows}>
							{safety.rows
								.filter((r) => milesOf(r.note) === null)
								.map((r) => (
									<View key={r.label} style={parts.row}>
										<Text style={parts.rowKind} numberOfLines={1}>
											{r.label}
										</Text>
										<Text style={parts.rowName} numberOfLines={1}>
											{r.name}
										</Text>
										{!!r.note && <Text style={parts.rowFigure}>{r.note}</Text>}
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
						{/* A ring a school (phase390): filled to its standing, the
						    share inside, the name and the distance under it. Until
						    then one line a school, the share as a bold figure. */}
						<View style={parts.cells}>
							{schools.map((r) => (
								<View key={r.label} style={[parts.cell, parts.cellCenter]}>
									<Ring size={62} pct={100 - rankShare(r)}>
										<Text style={parts.ringTop}>Top</Text>
										<Text style={parts.ringValue}>{rankShare(r)}%</Text>
									</Ring>
									<Text
										style={[parts.cellName, parts.cellNameCenter]}
										numberOfLines={2}
									>
										{schoolName(r)}
									</Text>
									{!!r.distance && (
										<Text style={parts.cellLabel}>{r.distance}</Text>
									)}
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
							{close.map((s, i) => (
								<View key={s.group}>
									<View style={parts.row}>
										<Text style={parts.rowKind} numberOfLines={1}>
											{s.group}
										</Text>
										<Text style={parts.rowName} numberOfLines={1}>
											{s.name}
										</Text>
										<Text style={parts.rowFigure}>{s.miles} mi</Text>
									</View>
									<View style={parts.rowBar}>
										<Bar
											pct={(s.miles / farthest) * 100}
											index={i}
											height={5}
										/>
									</View>
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
						{/* The month as a donut of its parts, the total inside
						    (phase390). */}
						<View style={parts.split}>
							<Donut
								size={88}
								parts={holding.rows.map((r, i) => ({
									value: r.usd,
									color: seriesColor(i),
								}))}
							>
								<Text
									style={parts.donutValue}
									numberOfLines={1}
									adjustsFontSizeToFit
								>
									{holding.display}
								</Text>
								<Text style={parts.donutUnit}>a month</Text>
							</Donut>
							<View style={parts.splitRows}>
								{holding.rows.map((r, i) => (
									<View key={r.label} style={parts.splitRow}>
										<View
											style={[
												parts.swatch,
												{ backgroundColor: seriesColor(i) },
											]}
										/>
										<Text style={parts.splitLabel} numberOfLines={1}>
											{r.label}
										</Text>
										<Text style={parts.splitValue}>${r.usd}</Text>
									</View>
								))}
							</View>
						</View>
					</Tile>
				)}

				{dues && (
					<Tile label="Dues" wide width={half} onPress={() => setSheet("dues")}>
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
					/>
				)}
			</BottomSheet>
		</>
	);
}

const styles = StyleSheet.create({
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
