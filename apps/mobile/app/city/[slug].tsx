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
import { GLANCE_TOPICS } from "@percho/shared/glance";
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
	TILE_DRIVES,
	costRows,
	driveRows,
	everydayRows,
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

const openSite = (url: string) => void Linking.openURL(url).catch(() => {});

/**
 * A sheet's row for a place: its name, a quieter word, its figure — and the
 * place's own website one tap away where it has one (owner 2026-11-24: "这些
 * 地方有官网的可以直接放链接"). The tiles stay one button each; the links are
 * here, where a row is tall enough to tap.
 */
function PlaceRow({
	name,
	site,
	aside,
	figure,
	share,
}: {
	name: string;
	site?: string | undefined;
	aside?: string | undefined;
	figure?: string | undefined;
	/** The figure is a "Top N%" share, in its fixed column. */
	share?: boolean;
}) {
	return (
		<Pressable
			style={({ pressed }) => [styles.placeRow, pressed && styles.pressed]}
			onPress={() => site && openSite(site)}
			disabled={!site}
			accessibilityRole={site ? "link" : "text"}
		>
			<Text style={parts.rowName} numberOfLines={1}>
				{name}
				{!!site && <Text style={styles.linkMark}> ↗</Text>}
			</Text>
			{!!aside && <Text style={parts.rowAside}>{aside}</Text>}
			{!!figure && (
				<Text style={[parts.rowFigure, share && parts.rowShare]}>{figure}</Text>
			)}
		</Pressable>
	);
}

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
	const { slug, open } = useLocalSearchParams<{
		slug: string;
		open?: string;
	}>();
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

	// Reached from a figure under the feed card (phase378): open the sheet of
	// the tile it names, once the city is in — and only a tile the page draws.
	useEffect(() => {
		if (!data) return;
		const key = GLANCE_TOPICS.find((t) => t === open);
		if (key && drawnTiles(data)[key]) setSheet(key);
	}, [data, open]);

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
	const everyday = everydayRows(data);
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
											{!!r.note && (
												<Text style={parts.rowFigure}>{r.note}</Text>
											)}
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
											<Text style={parts.rowName} numberOfLines={1}>
												{r.name}
											</Text>
											{!!r.rank && (
												<Text style={parts.rowFigure}>{r.rank}</Text>
											)}
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

						{(everyday.length > 0 || drives.length > 0) && (
							<Tile
								label="Convenience"
								wide
								width={half}
								onPress={() => setSheet("convenience")}
							>
								<View style={parts.rows}>
									{everyday.map((r) => (
										<View key={r.kind} style={parts.row}>
											<Text style={parts.rowKind} numberOfLines={1}>
												{r.kind}
											</Text>
											<Text style={parts.rowName} numberOfLines={1}>
												{r.name}
											</Text>
											<Text style={parts.rowFigure}>{r.miles} mi</Text>
										</View>
									))}
									{drives.slice(0, TILE_DRIVES).map((r) => (
										<View key={r.place} style={parts.row}>
											<Text style={parts.rowKind} numberOfLines={1}>
												Drive
											</Text>
											<Text style={parts.rowName} numberOfLines={1}>
												{r.place}
											</Text>
											<Text style={parts.rowFigure}>{r.time}</Text>
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
								<View style={parts.rows}>
									<View style={parts.row}>
										<Text style={parts.rowName} numberOfLines={1}>
											Residents, {latest.label}
										</Text>
										<Text style={parts.rowAside}>{data.growth.takeaway}</Text>
										<Text style={parts.rowFigure}>
											{latest.value.toLocaleString("en-US")}
										</Text>
									</View>
									{data.forecast && (
										<View style={parts.row}>
											<Text style={parts.rowName} numberOfLines={1}>
												{data.forecast.area} by {data.forecast.year}
											</Text>
											<Text style={parts.rowFigure}>
												{data.forecast.takeaway}
											</Text>
										</View>
									)}
									{data.planning.length > 0 && (
										<View style={parts.row}>
											<Text style={parts.rowName} numberOfLines={1}>
												Projects planned
											</Text>
											<Text style={parts.rowFigure}>
												{data.planning.length}
											</Text>
										</View>
									)}
								</View>
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
											<Text style={parts.rowName} numberOfLines={1}>
												{r.label}
											</Text>
											{!!r.note && <Text style={parts.rowAside}>{r.note}</Text>}
											<Text style={parts.rowFigure}>{r.value}</Text>
										</View>
									))}
									{data.holding && (
										<View style={parts.row}>
											<Text style={parts.rowName} numberOfLines={1}>
												Tax and utilities
											</Text>
											<Text style={parts.rowAside}>a month</Text>
											<Text style={parts.rowFigure}>
												{data.holding.display}
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
								<Pressable
									key={r.label}
									style={({ pressed }) => [
										styles.sheetRow,
										pressed && styles.pressed,
									]}
									onPress={() => r.site && openSite(r.site)}
									disabled={!r.site}
									accessibilityRole={r.site ? "link" : "text"}
								>
									<View style={styles.sheetRowText}>
										<Text style={styles.sheetRowKind}>{r.label}</Text>
										<Text style={styles.sheetRowName}>
											{r.name}
											{!!r.site && <Text style={styles.linkMark}> ↗</Text>}
										</Text>
									</View>
									{!!r.note && (
										<Text style={styles.sheetRowNote}>{r.note}</Text>
									)}
								</Pressable>
							))}
							<Text style={styles.sheetCaption}>
								Each is the closest to the city's centre, straight-line. Percho
								does not show crime figures. The agencies publish their own:
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
												<PlaceRow
													key={sc.name}
													name={sc.name}
													site={sc.site}
													aside={
														sc.miles !== undefined
															? `${sc.miles} mi`
															: undefined
													}
													figure={`Top ${sc.share}%`}
													share
												/>
											))}
										</View>
									))}
								</>
							)}
						</>
					)}
					{sheet === "convenience" && (
						<>
							{(data.everyday ?? []).length > 0 && (
								<>
									<Text style={styles.sheetTitle}>Everyday</Text>
									{(data.everyday ?? []).map((k) => (
										<View key={k.kind} style={styles.sheetGap}>
											<Text style={styles.sheetRowKind}>{k.kind}</Text>
											{k.places.map((pl) => (
												<PlaceRow
													key={pl.name}
													name={pl.name}
													site={pl.site}
													figure={`${pl.miles} mi`}
												/>
											))}
										</View>
									))}
									<Text style={styles.sheetCaption}>
										The closest of each kind to the city's centre,
										straight-line. Places from OpenStreetMap; ↗ opens a place's
										own site.
									</Text>
								</>
							)}
							<Text
								style={
									(data.everyday ?? []).length > 0
										? styles.sheetHeadSpaced
										: styles.sheetTitle
								}
							>
								Getting around
							</Text>
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

/** Which tiles this city's page draws — the conditions on the tiles above. */
function drawnTiles(data: CityDetailDTO): Record<SheetKey, boolean> {
	return {
		safety: !!data.safety,
		schools: schoolRows(data).length > 0,
		convenience: everydayRows(data).length > 0 || driveRows(data).length > 0,
		potential: data.growth.series.length > 0,
		cost: costRows(data).length > 0 || !!data.holding,
	};
}

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

	sheet: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 36 },
	sheetTitle: { ...textStyles.title2, color: colors.ink, marginBottom: 12 },
	sheetGap: { marginTop: 12 },
	sheetFigure: { ...textStyles.title1, color: colors.ink, marginTop: 6 },
	sheetHead: { ...textStyles.headline, color: colors.ink, marginTop: 22 },
	sheetHeadSpaced: {
		...textStyles.title2,
		color: colors.ink,
		marginTop: 26,
		marginBottom: 12,
	},
	pressed: { opacity: 0.6 },
	/** A sheet row that may be a link: the tile's row, tall enough to tap. */
	placeRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 10,
		paddingVertical: 7,
	},
	linkMark: { color: colors.accent },
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
