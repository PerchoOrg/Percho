/**
 * `/city/[slug]` — a city: its film, then its fundamentals, as charts.
 *
 * The destination of the city card's Explore link (phase327). It answers "what
 * is this place as a whole": rankings, the numbers against the state, schools
 * at every level, where it came from, the drive to the city, what is planned.
 *
 * Redrawn in phase333. Owner, on the first version: "现在太多文字 又臭又长 重新设计
 * 比如可以用一些图表". Every section is now a figure (`components/city/
 * CityCharts.tsx`, shaped by `lib/city/page.ts`): the long summary is replaced
 * by the one-line tagline, rankings are badges, the numbers are tiles with
 * their own small chart, history is a timeline that shows one sentence at a
 * time, drive times are bars, plans and sources fold shut.
 *
 * The hero is the community page's `TourHero` (phase331). Every figure names
 * its source.
 *
 * Brought in line with the community page in phase371 (owner 2026-11-22:
 * "把city card explore也做对应的优化"): the same five titled tiles — Safety,
 * Schools, Convenience, Potential, Cost — each a few rows with its chart one
 * tap away in a sheet, then what is left of At a glance, the history, and the
 * Resources links. Schools, Getting around and What's next were sections of
 * their own; they are those sheets now. Safety is facts about the place and a
 * link out for crime, as on the community page — `packages/shared/src/city.ts`.
 */
import type { CityDetailDTO } from "@percho/shared/city";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "../../components/BottomSheet";
import {
	DriveTimes,
	GlanceTiles,
	HistoryTimeline,
	PlanList,
	RankingBadges,
	SchoolLadder,
} from "../../components/city/CityCharts";
import { CreditsFoot } from "../../components/community/CreditsFoot";
import {
	GAP,
	PAGE_PAD,
	Resources,
	Tile,
	parts,
} from "../../components/community/ExploreParts";
import { HoldingCost } from "../../components/community/ExploreSheets";
import { ReviewsSection } from "../../components/community/ReviewsSection";
import { TourHero } from "../../components/community/TourHero";
import { apiBase } from "../../lib/api/base";
import {
	costRows,
	driveRows,
	glancePart,
	otherRankings,
	schoolRows,
	schoolsByLevel,
} from "../../lib/city/page";
import { linkGroups } from "../../lib/community/explore";
import { type ReviewStatus, fetchMyReview } from "../../lib/reviews/reviews";
import { backOrFeed } from "../../lib/share/back-or-feed";
import { openShareSheet } from "../../lib/share/share-sheet";
import { useAuthStore } from "../../state/auth";
import { useSavedStore } from "../../state/saved";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

function Section({
	title,
	children,
}: { title: string; children: React.ReactNode }) {
	return (
		<>
			<Text style={styles.sectionHead}>{title}</Text>
			{children}
		</>
	);
}

export default function CityScreen() {
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const insets = useSafeAreaInsets();
	const { width, height: screenH } = useWindowDimensions();
	const [data, setData] = useState<CityDetailDTO | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [sheet, setSheet] = useState<SheetKey | null>(null);
	// The signed-in person's own review of the city, in any status — as on the
	// community page, so the field can say "waiting to be read".
	const uid = useAuthStore((st) => st.session?.user.id);
	const [myStatus, setMyStatus] = useState<ReviewStatus | null>(null);
	const cityId = data?.id;
	useEffect(() => {
		if (!uid || !cityId) return;
		let alive = true;
		fetchMyReview(uid, { kind: "city", id: cityId })
			.then((mine) => alive && setMyStatus(mine?.status ?? null))
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [uid, cityId]);
	const resources = useMemo(
		() => linkGroups(data?.links, CITY_LINK_ORDER),
		[data?.links],
	);

	// The community page's hero height (reference §3.1): clamp(340, 46vh, 460).
	const heroH = Math.min(Math.max(340, screenH * 0.46), 460);

	// A city is saved under the id its feed card carries, so the card's
	// bookmark and this page's are one save.
	const savedId = data?.geoUnitId ? `area-${data.geoUnitId}` : null;
	const saved = useSavedStore((s) => (savedId ? s.isSaved(savedId) : false));
	const toggleSaved = useSavedStore((s) => s.toggle);

	useEffect(() => {
		if (!slug) return;
		let alive = true;
		(async () => {
			try {
				const res = await fetch(
					`${apiBase()}/api/mobile/city/${encodeURIComponent(slug)}`,
				);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = (await res.json()) as CityDetailDTO;
				if (alive) setData(json);
			} catch (e) {
				if (alive) setError(e instanceof Error ? e.message : "failed to load");
			}
		})();
		return () => {
			alive = false;
		};
	}, [slug]);

	if (error) {
		return (
			<View style={[styles.center, { paddingTop: insets.top }]}>
				<Text style={styles.err}>Couldn't load this city.</Text>
				<Pressable onPress={backOrFeed} style={styles.backBtn}>
					<Text style={styles.backTxt}>Back</Text>
				</Pressable>
			</View>
		);
	}

	if (!data) {
		return (
			<View style={[styles.center, { paddingTop: insets.top }]}>
				<ActivityIndicator color={colors.accent} />
			</View>
		);
	}

	const where = [data.county ? `${data.county} County` : null, data.state]
		.filter(Boolean)
		.join(", ");
	// Floored, so two halves and their gap never round up past the row.
	const half = Math.floor((width - PAGE_PAD * 2 - GAP) / 2);
	const rankings = otherRankings(data);
	const schools = schoolRows(data);
	const drives = driveRows(data);
	const costs = costRows(data);
	const latest = data.growth.series[data.growth.series.length - 1];
	const safetyLinks = (data.links ?? []).filter((l) => l.group === "Safety");
	const allSchools = data.allSchools ?? [];

	return (
		<View style={styles.root}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
				showsVerticalScrollIndicator={false}
			>
				{/* The community page's hero, as is (phase331): same height, glass
				    buttons, sound toggle, and its chip strip — one chip per
				    chapter of the film. */}
				<TourHero
					width={width}
					height={heroH}
					{...(data.videoUrl ? { videoUrl: data.videoUrl } : {})}
					{...(data.posterUrl ? { heroUrl: data.posterUrl } : {})}
					initial={data.name.trim().charAt(0).toUpperCase()}
					segments={data.tourSegments ?? []}
					saved={saved}
					onBack={backOrFeed}
					onToggleSave={() => {
						if (savedId) toggleSaved(savedId, "area");
					}}
					// Share (phase335) — the city's web page, which opens here
					// when the buyer has the app.
					onShare={() =>
						openShareSheet({ kind: "city", slug: data.slug, name: data.name })
					}
				/>

				<View style={styles.body}>
					<View style={styles.headline}>
						<Text style={styles.name}>{data.name}</Text>
						{!!where && <Text style={styles.place}>{where}</Text>}
					</View>

					{rankings.length > 0 && (
						<View style={styles.badges}>
							<RankingBadges rankings={rankings} />
						</View>
					)}

					<View style={parts.grid}>
						{data.safety && (
							<Tile
								label="Safety"
								wide
								width={half}
								onPress={() => setSheet("safety")}
							>
								<View style={parts.rows}>
									{data.safety.rows.map((r) => (
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

						{schools.length > 0 && (
							<Tile
								label="Schools"
								wide
								width={half}
								onPress={() => setSheet("schools")}
							>
								<View style={parts.rows}>
									{schools.map((r) => (
										<View key={r.name} style={parts.row}>
											<Text
												style={parts.rowName}
												numberOfLines={1}
												adjustsFontSizeToFit
												minimumFontScale={0.85}
											>
												{r.name}
											</Text>
											{!!r.rank && <Text style={styles.rowRank}>{r.rank}</Text>}
										</View>
									))}
								</View>
								{allSchools.length > 0 && (
									<Text style={parts.foot}>
										All {allSchools.length} schools in and around {data.name} ›
									</Text>
								)}
							</Tile>
						)}

						{drives.length > 0 && (
							<Tile
								label="Convenience"
								wide
								width={half}
								onPress={() => setSheet("convenience")}
							>
								<View style={parts.rows}>
									{drives.map((r) => (
										<View key={r.place} style={parts.row}>
											<Text style={parts.rowName} numberOfLines={1}>
												{r.place}
											</Text>
											<Text style={parts.rowAside}>{r.time}</Text>
										</View>
									))}
								</View>
							</Tile>
						)}

						{!!latest && (
							<Tile
								label="Potential"
								wide
								width={half}
								onPress={() => setSheet("potential")}
							>
								<Text style={parts.figure}>
									{latest.value.toLocaleString("en-US")}
									<Text
										style={parts.figureUnit}
									>{`  residents, ${latest.label}`}</Text>
								</Text>
								<Text style={parts.foot}>{data.growth.takeaway}</Text>
								{data.forecast && (
									<Text style={parts.footSecond}>
										Forecast: {data.forecast.value.toLocaleString("en-US")} in{" "}
										{data.forecast.area} by {data.forecast.year} (
										{data.forecast.takeaway})
									</Text>
								)}
								{data.planning.length > 0 && (
									<Text style={parts.footSecond}>
										{data.planning.length === 1
											? "1 project planned"
											: `${data.planning.length} projects planned`}
									</Text>
								)}
							</Tile>
						)}

						{(costs.length > 0 || data.holding) && (
							<Tile
								label="Cost"
								wide
								width={half}
								onPress={() => setSheet("cost")}
							>
								<View style={parts.rows}>
									{costs.map((r) => (
										<View key={r.label} style={parts.row}>
											<Text style={styles.costLabel} numberOfLines={1}>
												{r.label}
											</Text>
											{!!r.note && <Text style={parts.rowAside}>{r.note}</Text>}
											<Text style={styles.costValue}>{r.value}</Text>
										</View>
									))}
									{data.holding && (
										<View style={parts.row}>
											<Text style={styles.costLabel} numberOfLines={1}>
												To hold a home
											</Text>
											<Text style={parts.rowAside}>
												tax, power, water, trash
											</Text>
											<Text style={styles.costValue}>
												{data.holding.display}/mo
											</Text>
										</View>
									)}
								</View>
							</Tile>
						)}
					</View>

					<Section title="AT A GLANCE">
						<GlanceTiles city={data} only={(t) => glancePart(t) === "glance"} />
					</Section>

					{data.history.length > 0 && (
						<Section title="HISTORY">
							<HistoryTimeline history={data.history} />
						</Section>
					)}

					<Resources groups={resources} />

					{/* Reviews at the foot, as on a community's page (owner
					    2026-11-22: "最底下还是要有review 部分"). */}
					<ReviewsSection
						reviews={data.reviews}
						myStatus={myStatus}
						onWrite={() => {
							if (!uid) {
								router.push("/auth");
								return;
							}
							router.push({
								pathname: "/community/review",
								params: { id: data.id, name: data.name, kind: "city" },
							});
						}}
					/>

					<CreditsFoot
						sources={data.sources.map((src) => src.name).join(" · ")}
						google={data.credits.google}
						commons={data.credits.commons}
					/>
				</View>
			</ScrollView>

			<BottomSheet
				visible={sheet !== null}
				detent={sheet === "safety" ? "medium" : "large"}
				onClose={() => setSheet(null)}
			>
				<ScrollView
					contentContainerStyle={styles.sheet}
					showsVerticalScrollIndicator={false}
				>
					{sheet === "safety" && data.safety && (
						<>
							<Text style={styles.sheetTitle}>Safety</Text>
							{data.safety.rows.map((r) => (
								<View key={r.label} style={styles.sheetRow}>
									<View style={styles.sheetRowText}>
										<Text style={styles.sheetRowKind}>{r.label}</Text>
										<Text style={styles.sheetRowName}>{r.name}</Text>
									</View>
									{!!r.note && (
										<Text style={styles.sheetRowNote}>{r.note}</Text>
									)}
								</View>
							))}
							<Text style={styles.sheetCaption}>
								The hospital is the closest to the city's centre, straight-line.
								Percho does not show crime figures. The agencies publish their
								own:
							</Text>
							<View style={styles.sheetLinks}>
								{safetyLinks.map((l) => (
									<Pressable
										key={l.url}
										onPress={() => void Linking.openURL(l.url).catch(() => {})}
										accessibilityRole="link"
										hitSlop={6}
									>
										<Text style={styles.sheetLink}>{l.label} ↗</Text>
									</Pressable>
								))}
							</View>
						</>
					)}
					{sheet === "schools" && (
						<>
							<Text style={styles.sheetTitle}>Schools</Text>
							<SchoolLadder education={data.education} />
							{/* Every school, not only the ones a publisher ranked. A
							    different measure from the ranks above, and it says so. */}
							{allSchools.length > 0 && (
								<>
									<Text style={styles.sheetHead}>
										All {allSchools.length} in and around {data.name}
									</Text>
									<Text style={styles.sheetCaption}>
										Where each stands among Georgia's schools at its level, by
										state test results. Miles are from the city's centre. Nearby
										schools — not an attendance zone.
									</Text>
									{schoolsByLevel(allSchools).map((g) => (
										<View key={g.heading} style={styles.sheetGap}>
											<Text style={styles.sheetRowKind}>{g.heading}</Text>
											{g.schools.map((sc) => (
												<View key={sc.name} style={parts.row}>
													<Text style={parts.rowName} numberOfLines={1}>
														{sc.name}
													</Text>
													{sc.miles !== undefined && (
														<Text style={parts.rowAside}>{sc.miles} mi</Text>
													)}
													<Text style={parts.rowShare}>Top {sc.share}%</Text>
												</View>
											))}
										</View>
									))}
								</>
							)}
						</>
					)}
					{sheet === "convenience" && (
						<>
							<Text style={styles.sheetTitle}>Getting around</Text>
							<DriveTimes rows={data.gettingAround} />
						</>
					)}
					{sheet === "potential" && (
						<>
							<Text style={styles.sheetTitle}>Growth and what's next</Text>
							<GlanceTiles
								city={data}
								only={(t) => glancePart(t) === "potential"}
							/>
							{data.forecast && (
								<>
									<Text style={styles.sheetHead}>
										Forecast for {data.forecast.year}
									</Text>
									<Text style={styles.sheetFigure}>
										{data.forecast.value.toLocaleString("en-US")}
									</Text>
									<Text style={styles.sheetCaption}>
										{data.forecast.area} residents by {data.forecast.year} —{" "}
										{data.forecast.takeaway} (
										{data.forecast.baseValue.toLocaleString("en-US")} in{" "}
										{data.forecast.baseYear}). A published forecast, for the
										county rather than the city.
									</Text>
									{!!data.forecast.source.url && (
										<Pressable
											onPress={() =>
												void Linking.openURL(
													data.forecast?.source.url ?? "",
												).catch(() => {})
											}
											accessibilityRole="link"
											hitSlop={6}
											style={styles.sheetLinks}
										>
											<Text style={styles.sheetLink}>
												{data.forecast.source.name} ↗
											</Text>
										</Pressable>
									)}
								</>
							)}
							{data.planning.length > 0 && (
								<View style={styles.sheetGap}>
									<PlanList planning={data.planning} />
								</View>
							)}
						</>
					)}
					{sheet === "cost" && (
						<>
							{data.holding ? (
								<>
									<HoldingCost holding={data.holding} />
									<Text style={styles.sheetHead}>Home value and rent</Text>
									<View style={styles.sheetGap} />
								</>
							) : (
								<Text style={styles.sheetTitle}>What homes cost</Text>
							)}
							<GlanceTiles city={data} only={(t) => glancePart(t) === "cost"} />
						</>
					)}
				</ScrollView>
			</BottomSheet>
		</View>
	);
}

type SheetKey = "safety" | "schools" | "convenience" | "potential" | "cost";

/** A city's own pages lead its links; where people talk about it comes last. */
const CITY_LINK_ORDER = [
	"City",
	"Homes",
	"Schools",
	"Safety",
	"Articles",
	"Community",
];

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.bg },
	center: {
		flex: 1,
		backgroundColor: colors.bg,
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
	},
	err: { ...textStyles.footnote, fontSize: 15, color: colors.ink2 },
	backBtn: {
		paddingHorizontal: 18,
		paddingVertical: 10,
		borderRadius: radii.pill,
		backgroundColor: colors.cta,
	},
	backTxt: { ...textStyles.footnote, color: colors.surface },

	body: { paddingHorizontal: 18, paddingTop: 20 },
	headline: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 10,
	},
	name: { ...textStyles.title1, color: colors.ink, flexShrink: 1 },
	place: { ...textStyles.footnote, fontSize: 14, color: colors.ink2 },
	badges: { marginTop: 18, marginHorizontal: -18, paddingLeft: 18 },
	sectionHead: {
		...textStyles.caption,
		fontSize: 12,
		color: colors.ink2,
		marginTop: 26,
		marginBottom: 10,
	},

	/** A school's published rank, in the row's own type. */
	rowRank: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "600",
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	costLabel: {
		...textStyles.footnote,
		fontSize: 13,
		color: colors.ink2,
		flex: 1,
		minWidth: 0,
	},
	costValue: {
		...textStyles.footnote,
		fontSize: 14,
		fontWeight: "600",
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},

	sheet: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 36 },
	sheetTitle: { ...textStyles.title2, color: colors.ink, marginBottom: 12 },
	sheetGap: { marginTop: 12 },
	sheetFigure: { ...textStyles.title1, color: colors.ink, marginTop: 6 },
	sheetHead: { ...textStyles.headline, color: colors.ink, marginTop: 22 },
	sheetRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 7,
	},
	sheetRowText: { flex: 1, minWidth: 0, gap: 1 },
	sheetRowKind: { ...textStyles.note, color: colors.ink2 },
	sheetRowName: {
		...textStyles.footnote,
		fontSize: 14,
		fontWeight: "600",
		color: colors.ink,
	},
	sheetRowNote: {
		...textStyles.headline,
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	sheetCaption: { ...textStyles.note, color: colors.ink2, marginTop: 10 },
	sheetLinks: {
		flexDirection: "row",
		flexWrap: "wrap",
		columnGap: 14,
		rowGap: 8,
		marginTop: 8,
	},
	sheetLink: {
		...textStyles.footnote,
		fontWeight: "500",
		color: colors.accent,
	},
});
