/**
 * `/area/[key]` — one county, opened from its pill on the Search map.
 *
 * Redrawn in phase412 (owner 2026-11-27: 「点击后会看到county的数据 … 这个页面
 * 全是数字陈列很不好 重新设计一下」). It was a cost total, six bars with a figure
 * each, two chips and a 29-row ranking with a figure on every row. It is now
 * built like a city's or a community's Explore page — tiles that draw their
 * figure, each opening a sheet with the detail:
 *
 *   On Percho here   — the cities and communities with films inside the
 *                      county's outline; a tap opens them. The page's reason
 *                      to exist for a buyer, so it comes first.
 *   Monthly cost     — a donut of what the money goes to, the total inside.
 *   Schools          — the share of students proficient on the state's tests,
 *                      as a ring.
 *   Among metro …    — where the county sits among the metro's on cost and on
 *                      schools: a dot on a track, words only in the top half.
 *
 * The ranking with every county's figure still exists, one tap down, in the
 * standing sheet — for the buyer who is comparing.
 */
import {
	type Area,
	type Lens,
	costBreakdown,
	estimateNoteFor,
	lensById,
	listOf,
	rankedBy,
} from "@percho/shared/lenses";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "../../components/BottomSheet";
import { Bar, Donut, Ring, seriesColor } from "../../components/charts/Marks";
import {
	GAP,
	PAGE_PAD,
	Tile,
	parts,
} from "../../components/community/ExploreParts";
import { useAreas } from "../../hooks/use-areas";
import { mapUrl, searchUrl } from "../../lib/api/base";
import type { AreaShape } from "../../lib/areas/areas-dto";
import { areasByKey } from "../../lib/areas/areas-dto";
import {
	type Standing,
	insideCounty,
	shapeBox,
	standingOf,
	standingWords,
} from "../../lib/areas/county-page";
import {
	type SearchCity,
	type SearchCommunity,
	parseSearchResult,
} from "../../lib/search/search-dto";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

type Sheet = "cost" | "schools" | "standing";

/** What Percho has inside one county: its cities with films, its communities. */
function useCountyPlaces(
	shape: AreaShape | undefined,
	shapes: readonly AreaShape[],
) {
	const [communities, setCommunities] = useState<SearchCommunity[]>([]);
	const [cities, setCities] = useState<SearchCity[]>([]);
	useEffect(() => {
		if (!shape) return;
		let live = true;
		(async () => {
			try {
				const res = await fetch(mapUrl(shapeBox(shape)));
				if (!res.ok) return;
				const inside = insideCounty(
					parseSearchResult(await res.json()).communities,
					shapes,
					shape.key,
				);
				if (!live) return;
				setCommunities(inside);
				// A community's city is a film only if search knows it as one —
				// one lookup per city name, and few counties have more than four.
				const names = [...new Set(inside.map((c) => c.city))];
				const found = await Promise.all(
					names.map(async (name) => {
						const r = await fetch(searchUrl(name));
						if (!r.ok) return [];
						return parseSearchResult(await r.json()).cities.filter(
							(c) => c.name.toLowerCase() === name.toLowerCase(),
						);
					}),
				);
				// A city counts only if its own centre is in the county: St Marlo
				// has a Duluth address and sits in Forsyth, and Duluth does not.
				if (live) setCities(insideCounty(found.flat(), shapes, shape.key));
			} catch {
				// The tile simply says there is nothing here yet.
			}
		})();
		return () => {
			live = false;
		};
	}, [shape, shapes]);
	return { communities, cities };
}

export default function AreaDetailScreen() {
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const { key } = useLocalSearchParams<{ key?: string }>();
	const { areas: data, loading } = useAreas();
	const [sheet, setSheet] = useState<Sheet | null>(null);
	const [standingLens, setStandingLens] = useState<"true_cost" | "schools">(
		"true_cost",
	);

	const area = key ? areasByKey(data.areas).get(key) : undefined;
	const shape = data.shapes.find((s) => s.key === key);
	const { communities, cities } = useCountyPlaces(shape, data.shapes);

	const costLens = lensById("true_cost");
	const schoolLens = lensById("schools");
	const costRank = useMemo(
		() => (costLens ? rankedBy(costLens, data.areas) : []),
		[costLens, data.areas],
	);
	const schoolRank = useMemo(
		() => (schoolLens ? rankedBy(schoolLens, data.areas) : []),
		[schoolLens, data.areas],
	);
	const costStanding = key ? standingOf(costRank, key) : undefined;
	const schoolStanding = key ? standingOf(schoolRank, key) : undefined;

	const lines = area ? costBreakdown(area) : undefined;
	const total = lines?.reduce((n, l) => n + l.monthlyUsd, 0);
	const proficiency = area?.metrics.find(
		(m) => m.metric === "school_proficiency_pct",
	)?.value;

	const half = Math.floor((width - PAGE_PAD * 2 - GAP) / 2);
	const name = area ? `${area.name} County` : "This county";
	const here = [
		cities.length > 0
			? `${cities.length} ${cities.length === 1 ? "city" : "cities"}`
			: null,
		communities.length > 0
			? `${communities.length} ${communities.length === 1 ? "community" : "communities"}`
			: null,
	].filter(Boolean);

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
			<Pressable
				onPress={() => router.back()}
				hitSlop={10}
				accessibilityRole="button"
			>
				<Text style={styles.back}>‹ Map</Text>
			</Pressable>

			<ScrollView
				contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
				showsVerticalScrollIndicator={false}
			>
				<Text style={styles.title}>{name}</Text>
				<Text style={styles.sub}>
					{here.length > 0
						? `Georgia · ${here.join(" and ")} on Percho`
						: "Georgia"}
				</Text>

				{!area ? (
					<Text style={styles.empty}>
						{loading ? "Loading…" : "We don’t have this county’s figures yet."}
					</Text>
				) : (
					<View style={parts.grid}>
						<PlacesTile
							width={half}
							cities={cities}
							communities={communities}
						/>

						{total !== undefined && lines && (
							<Tile
								label="Monthly cost"
								width={half}
								onPress={() => setSheet("cost")}
							>
								<View style={styles.tileCenter}>
									<Donut
										size={104}
										parts={lines.map((l, i) => ({
											value: l.monthlyUsd,
											color: seriesColor(i),
										}))}
									>
										<Text style={styles.ringFigure}>
											${total.toLocaleString()}
										</Text>
										<Text style={styles.ringUnit}>a month</Text>
									</Donut>
								</View>
								<Text style={parts.foot}>
									On a $500k home, before the mortgage
								</Text>
							</Tile>
						)}

						{proficiency !== undefined && (
							<Tile
								label="Schools"
								width={half}
								onPress={() => setSheet("schools")}
							>
								<View style={styles.tileCenter}>
									<Ring size={104} pct={proficiency}>
										<Text style={styles.ringFigure}>
											{Math.round(proficiency)}%
										</Text>
										<Text style={styles.ringUnit}>proficient</Text>
									</Ring>
								</View>
								<Text style={parts.foot}>
									{standingWords(schoolStanding, "schools") ??
										"On Georgia’s state tests"}
								</Text>
							</Tile>
						)}

						{(costStanding || schoolStanding) && (
							<Tile
								label={`Among ${costStanding?.of ?? schoolStanding?.of} metro counties`}
								wide
								width={half}
								onPress={() => setSheet("standing")}
							>
								<View style={styles.tracks}>
									{costStanding && (
										<StandingTrack
											label="Cost"
											standing={costStanding}
											words={standingWords(costStanding, "cost")}
											low="Costs more"
											high="Costs less"
										/>
									)}
									{schoolStanding && (
										<StandingTrack
											label="Schools"
											standing={schoolStanding}
											words={standingWords(schoolStanding, "schools")}
											low="Lower scores"
											high="Higher scores"
										/>
									)}
								</View>
							</Tile>
						)}
					</View>
				)}
			</ScrollView>

			<BottomSheet
				visible={sheet !== null}
				detent="large"
				onClose={() => setSheet(null)}
			>
				<ScrollView contentContainerStyle={styles.sheet}>
					{sheet === "cost" && area && <CostSheet area={area} />}
					{sheet === "schools" && area && (
						<SchoolsSheet area={area} standing={schoolStanding} />
					)}
					{sheet === "standing" && (
						<StandingSheet
							lens={lensById(standingLens)}
							areas={data.areas}
							here={key}
							onLens={setStandingLens}
							current={standingLens}
						/>
					)}
				</ScrollView>
			</BottomSheet>
		</View>
	);
}

/** Percho's cities and communities inside the county — the way in. */
function PlacesTile({
	width,
	cities,
	communities,
}: {
	width: number;
	cities: readonly SearchCity[];
	communities: readonly SearchCommunity[];
}) {
	return (
		<View style={[styles.places, { width: width * 2 + GAP }]}>
			<Text style={parts.tileLabel}>On Percho here</Text>
			{cities.length === 0 && communities.length === 0 ? (
				<Text style={[parts.foot, styles.placesEmpty]}>
					No films in this county yet.
				</Text>
			) : (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.placeRow}
				>
					{cities.map((c) => (
						<PlaceCard
							key={`city-${c.slug}`}
							image={c.posterUrl}
							name={c.name}
							kind="City"
							onPress={() => router.push(`/city/${c.slug}`)}
						/>
					))}
					{communities.map((c) => (
						<PlaceCard
							key={c.id}
							image={c.heroUrl}
							name={c.name}
							kind={c.city}
							onPress={() => router.push(`/community/${c.slug}`)}
						/>
					))}
				</ScrollView>
			)}
		</View>
	);
}

function PlaceCard({
	image,
	name,
	kind,
	onPress,
}: {
	image: string | undefined;
	name: string;
	kind: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [styles.placeCard, pressed && styles.pressed]}
			accessibilityRole="button"
			accessibilityLabel={`${name}, ${kind}`}
		>
			<Image
				source={image ? { uri: image } : undefined}
				style={styles.placeImage}
			/>
			<Text style={styles.placeName} numberOfLines={1}>
				{name}
			</Text>
			<Text style={styles.placeKind} numberOfLines={1}>
				{kind}
			</Text>
		</Pressable>
	);
}

/** Where the county sits, as a dot on a track: best at the right. */
function StandingTrack({
	label,
	standing,
	words,
	low,
	high,
}: {
	label: string;
	standing: Standing;
	words: string | undefined;
	low: string;
	high: string;
}) {
	return (
		<View style={styles.track}>
			<View style={styles.trackHead}>
				<Text style={parts.rowName}>{label}</Text>
				{!!words && <Text style={parts.rowFigure}>{words}</Text>}
			</View>
			<View style={styles.trackLine}>
				<View
					style={[styles.trackDot, { left: `${standing.position * 100}%` }]}
				/>
			</View>
			<View style={styles.trackEnds}>
				<Text style={styles.trackEnd}>{low}</Text>
				<Text style={styles.trackEnd}>{high}</Text>
			</View>
		</View>
	);
}

/** The monthly cost, line by line, each with who supplies it. */
function CostSheet({ area }: { area: Area }) {
	const lines = costBreakdown(area) ?? [];
	const total = lines.reduce((n, l) => n + l.monthlyUsd, 0);
	const max = Math.max(1, ...lines.map((l) => l.monthlyUsd));
	const statutory = area.metrics.find(
		(m) => m.metric === "property_tax_millage_statutory_pct",
	);
	const estimated = lines
		.filter((l) => l.estimated)
		.map((l) => l.label.toLowerCase());
	return (
		<>
			<Text style={styles.sheetTitle}>Monthly cost</Text>
			<Text style={styles.sheetLead}>
				${total.toLocaleString()} a month to own a $500k home in {area.name}{" "}
				County, before the mortgage.
			</Text>
			{lines.map((line, i) => (
				<View key={line.label} style={styles.costLine}>
					<View style={parts.row}>
						<View
							style={[styles.swatch, { backgroundColor: seriesColor(i) }]}
						/>
						<Text style={parts.rowName}>{line.label}</Text>
						<Text style={parts.rowFigure}>
							${line.monthlyUsd}
							{line.estimated ? "*" : ""}
						</Text>
					</View>
					<Bar
						pct={(line.monthlyUsd / max) * 100}
						color={seriesColor(i)}
						index={i}
						height={6}
					/>
					{!!line.note && <Text style={styles.costNote}>{line.note}</Text>}
				</View>
			))}
			{statutory && (
				<Text style={styles.costNote}>
					The county’s adopted tax rate is {statutory.value.toFixed(2)}% before
					homestead exemptions.
				</Text>
			)}
			<Text style={styles.source}>
				{estimated.length > 0
					? `From public records, except ${listOf(estimated)} — marked *, still our estimate.`
					: "Every figure here is from a public record."}
			</Text>
		</>
	);
}

/** The schools figure, what it measures, and the county's standing. */
function SchoolsSheet({
	area,
	standing,
}: {
	area: Area;
	standing: Standing | undefined;
}) {
	const m = area.metrics.find((x) => x.metric === "school_proficiency_pct");
	if (!m) return null;
	return (
		<>
			<Text style={styles.sheetTitle}>Schools</Text>
			<Text style={styles.sheetLead}>
				{Math.round(m.value)}% of students in {area.name} County’s public
				schools are proficient on Georgia’s state tests.
			</Text>
			{standing && (
				<Text style={styles.sheetBody}>
					{standingWords(standing, "schools") ??
						`It sits ${standing.place} of the ${standing.of} metro counties on this measure.`}
				</Text>
			)}
			<Text style={styles.sheetBody}>
				A county figure averages every school in it. Each community’s page names
				the schools nearest to it, and they can differ widely from this.
			</Text>
			<Text style={styles.source}>
				{m.source}
				{m.asOf ? ` · ${m.asOf}` : ""}
			</Text>
		</>
	);
}

/** Every metro county on one measure — the comparison, for whoever wants it. */
function StandingSheet({
	lens,
	areas,
	here,
	current,
	onLens,
}: {
	lens: Lens | undefined;
	areas: readonly Area[];
	here: string | undefined;
	current: "true_cost" | "schools";
	onLens: (id: "true_cost" | "schools") => void;
}) {
	const ranked = useMemo(
		() => (lens ? rankedBy(lens, areas) : []),
		[lens, areas],
	);
	const note = useMemo(
		() => (lens ? estimateNoteFor(lens, areas) : undefined),
		[lens, areas],
	);
	if (!lens) return null;
	const max = Math.max(1, ...ranked.map((r) => r.value));
	return (
		<>
			<Text style={styles.sheetTitle}>Metro counties</Text>
			<View style={styles.switch}>
				{(["true_cost", "schools"] as const).map((id) => (
					<Pressable
						key={id}
						onPress={() => onLens(id)}
						style={[styles.switchOpt, current === id && styles.switchOn]}
						accessibilityRole="button"
						accessibilityState={{ selected: current === id }}
					>
						<Text
							style={[styles.switchTxt, current === id && styles.switchTxtOn]}
						>
							{id === "true_cost" ? "Monthly cost" : "Schools"}
						</Text>
					</Pressable>
				))}
			</View>
			<Text style={styles.sheetBody}>{lens.caption}</Text>
			{ranked.map((hit, i) => {
				const isHere = hit.area.key === here;
				return (
					<Pressable
						key={hit.area.key}
						style={[styles.rankRow, isHere && styles.rankRowHere]}
						onPress={() => router.replace(`/area/${hit.area.key}`)}
					>
						<Text
							style={[parts.rowName, styles.rankName, isHere && styles.bold]}
							numberOfLines={1}
						>
							{hit.area.name}
						</Text>
						<View style={styles.rankBar}>
							<Bar
								pct={(hit.value / max) * 100}
								color={isHere ? colors.accent : colors.ink3}
								index={Math.min(i, 8)}
								height={5}
							/>
						</View>
						<Text style={[parts.rowAside, styles.rankValue]}>
							{lens.format(hit.value)}
							{hit.estimated ? "*" : ""}
						</Text>
					</Pressable>
				);
			})}
			{!!note && <Text style={styles.source}>{note}</Text>}
		</>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: PAGE_PAD },
	back: { ...textStyles.footnote, color: colors.accent, fontWeight: "600" },
	title: { ...textStyles.title1, color: colors.ink, marginTop: 10 },
	sub: { ...textStyles.footnote, color: colors.ink2, marginTop: 2 },
	empty: { ...textStyles.body, color: colors.ink2, paddingVertical: 20 },
	pressed: { opacity: 0.7 },

	tileCenter: { alignItems: "center", marginTop: 10, marginBottom: 2 },
	ringFigure: {
		...textStyles.headline,
		color: colors.ink,
		fontVariant: ["tabular-nums"],
	},
	ringUnit: { ...textStyles.caption, fontSize: 10.5, color: colors.ink2 },

	places: {
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		paddingVertical: 12,
		paddingLeft: 14,
	},
	placesEmpty: { paddingRight: 14 },
	placeRow: { gap: 10, paddingTop: 10, paddingRight: 14 },
	placeCard: { width: 112 },
	placeImage: {
		width: 112,
		height: 140,
		borderRadius: radii.tile,
		backgroundColor: colors.surface2,
	},
	placeName: {
		...textStyles.footnote,
		fontSize: 13,
		fontWeight: "600",
		color: colors.ink,
		marginTop: 6,
	},
	placeKind: { ...textStyles.caption, fontSize: 11, color: colors.ink2 },

	tracks: { gap: 14, marginTop: 8 },
	track: { gap: 6 },
	trackHead: { flexDirection: "row", alignItems: "baseline", gap: 10 },
	trackLine: {
		height: 6,
		borderRadius: 3,
		backgroundColor: colors.surface2,
		marginHorizontal: 7,
	},
	trackDot: {
		position: "absolute",
		top: -4,
		width: 14,
		height: 14,
		marginLeft: -7,
		borderRadius: 7,
		backgroundColor: colors.accent,
		borderWidth: 2,
		borderColor: colors.surface,
	},
	trackEnds: { flexDirection: "row", justifyContent: "space-between" },
	trackEnd: { ...textStyles.caption, fontSize: 10.5, color: colors.ink3 },

	sheet: { paddingHorizontal: 20, paddingBottom: 40 },
	sheetTitle: { ...textStyles.title2, color: colors.ink },
	sheetLead: {
		...textStyles.body,
		color: colors.ink,
		marginTop: 6,
		marginBottom: 12,
	},
	sheetBody: { ...textStyles.footnote, color: colors.ink2, marginTop: 8 },
	source: { ...textStyles.note, color: colors.ink3, marginTop: 14 },

	costLine: { marginBottom: 10 },
	swatch: { width: 10, height: 10, borderRadius: 3, alignSelf: "center" },
	costNote: { ...textStyles.note, color: colors.ink3, marginTop: 4 },

	switch: {
		flexDirection: "row",
		backgroundColor: colors.surface2,
		borderRadius: radii.pill,
		padding: 3,
		marginTop: 10,
		alignSelf: "flex-start",
	},
	switchOpt: {
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: radii.pill,
	},
	switchOn: { backgroundColor: colors.surface },
	switchTxt: { ...textStyles.footnote, color: colors.ink2, fontWeight: "600" },
	switchTxtOn: { color: colors.ink },
	rankRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 8,
		paddingHorizontal: 6,
		borderRadius: radii.tile,
	},
	rankRowHere: { backgroundColor: colors.surface2 },
	rankName: { flex: 0, width: 96 },
	rankBar: { flex: 1 },
	rankValue: { width: 56, textAlign: "right" },
	bold: { fontWeight: "700" },
});
