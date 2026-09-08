/**
 * Search tab (spec-v3 `04-search.md`) — map + collapsible list.
 *
 * ── v1 scope vs §4.1 ────────────────────────────────────────────────────────
 * The spec's full version wants: 3-detent sheet, pin↔row two-way sync,
 * popularity sorting server-side, listing price pins at zoom ≥14. This is the
 * honest subset that ships for the store launch (phase D):
 *
 *   · no query → map renders CITY pins from the feed pool; the sheet lists
 *     the city units, familiar ones first (§4.3 "in your journey first")
 *   · ≥2 characters → `/api/mobile/search` (`hooks/use-search.ts`) returns
 *     communities + homes; the sheet shows them grouped, plus any city whose
 *     name matches, and the map fits to the hits that have coordinates
 *   · community / home row tap → its detail page; city row tap → fly to it
 *     (city/zip "don't leave the surface" per §4.4)
 *
 * The "Your journey" layer chip moved OFF this screen (owner, 2026-09-07):
 * familiarity is the You tab's story (05 §5.3, "Your journey" section there),
 * and this surface just searches. The familiar-first sort stays because it
 * reads the same `areaFamiliarity` source, so the two faces cannot disagree.
 *
 * ── No filter UI anywhere ───────────────────────────────────────────────────
 * The only narrowing affordances are the search box and the viewport
 * (§4.1 铁律). There is no price/bed/bath picker on this screen.
 *
 * ── Lenses (phase196) ───────────────────────────────────────────────────────
 * The chip row under the search pill picks a LENS: the map fills each county
 * with that one dimension's value. This is inside the no-filter rule rather
 * than an exception to it — a lens recolours, it never removes an area, and
 * there is no threshold that hides one. Selecting a lens changes what the map
 * SHOWS, not what exists.
 *
 * Each lens draws on the geography its dimension is actually defined on, so a
 * value never gradients across a border where the real number steps. See
 * `@percho/shared/lenses`, which also records why there is deliberately no
 * crime or safety lens.
 *
 * While a text search is running the fills drop to a whisper so the result
 * pins stay readable: the buyer asked a question, and the lens is context.
 */
import {
	type Area,
	LENSES,
	type LensId,
	classBreaks,
	colorFor,
	costBreakdown,
	estimateNoteFor,
	legendRange,
	lensById,
	listOf,
	rankedBy,
} from "@percho/shared/lenses";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
	useWindowDimensions,
} from "react-native";
import MapView, { Marker, Polygon } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAreas } from "../../hooks/use-areas";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { MIN_QUERY_LEN, useSearch } from "../../hooks/use-search";
import { familiarityFor } from "../../lib/area-familiarity";
import { areasByKey } from "../../lib/areas/areas-dto";
import type { GeoUnit } from "../../lib/feed/geo-unit";
import { lensForPriorities } from "../../lib/priorities";
import { formatPrice, specsLine } from "../../lib/saved/rows";
import { useFeedSession } from "../../state/feed-session";
import { useFunnelStore } from "../../state/funnel";
import { usePriorityStore } from "../../state/priorities";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/** Fill opacity for a lens polygon: readable at rest, a whisper while the
 *  buyer is reading search pins over it. */
const FILL_ALPHA = 0.62;
const FILL_ALPHA_SEARCHING = 0.16;

/** `#rrggbb` + alpha → the `#rrggbbaa` react-native-maps accepts. */
function withAlpha(hex: string, alpha: number): string {
	const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
		.toString(16)
		.padStart(2, "0");
	return `${hex}${a}`;
}

export default function SearchTab() {
	const { height } = useWindowDimensions();
	const insets = useSafeAreaInsets();

	const stage = useFunnelStore((s) => s.stage);
	const signals = useFeedSession((s) => s.signals);
	const { pool, loading: poolLoading } = useFeedPool({
		stage,
		cities: [],
		likedCommunityIds: [],
		enabled: true,
	});

	const [query, setQuery] = useState("");
	// v1: the sheet is one expanded panel (half) or collapsed (peek).
	const [expanded, setExpanded] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const search = useSearch(query);
	const searching = query.trim().length >= MIN_QUERY_LEN;

	const mapRef = useRef<MapView>(null);

	// ── Lenses ────────────────────────────────────────────────────────────────
	// A failure is deliberately not surfaced: the tab's own job is searching,
	// and it still works. The chips simply never appear.
	const { areas: areaData } = useAreas();
	// Opens on whatever the buyer said matters in the You tab, not on the same
	// default for everyone. Only the INITIAL lens — tapping a chip wins.
	const priorityWeights = usePriorityStore((s) => s.weights);
	const [lensId, setLensId] = useState<LensId>(() =>
		lensForPriorities(priorityWeights),
	);
	const [openArea, setOpenArea] = useState<string | null>(null);

	const lens = lensById(lensId) ?? LENSES[0];
	const metricsByKey = useMemo(
		() => areasByKey(areaData.areas),
		[areaData.areas],
	);
	const breaks = useMemo(
		() => (lens ? classBreaks(lens, areaData.areas) : []),
		[lens, areaData.areas],
	);
	const ranked = useMemo(
		() => (lens ? rankedBy(lens, areaData.areas) : []),
		[lens, areaData.areas],
	);
	const legend = useMemo(
		() => (lens ? legendRange(lens, areaData.areas) : undefined),
		[lens, areaData.areas],
	);
	// Names which INPUTS are guesses rather than calling the whole figure one.
	const estimateNote = useMemo(
		() => (lens ? estimateNoteFor(lens, areaData.areas) : undefined),
		[lens, areaData.areas],
	);
	/** Value per county key, so a polygon's fill is one map lookup. */
	const valueByKey = useMemo(
		() => new Map(ranked.map((v) => [v.area.key, v])),
		[ranked],
	);
	/** True once the lens has something to draw. Until then the chips stay
	 *  hidden rather than offering a control that paints nothing. */
	const lensReady = ranked.length > 0;

	const openedArea: Area | undefined = openArea
		? metricsByKey.get(openArea)
		: undefined;

	/** Move the map to a county and open its breakdown. */
	const selectArea = (key: string) => {
		setOpenArea(key);
		setExpanded(true);
		const shape = areaData.shapes.find((s) => s.key === key);
		if (!shape) return;
		mapRef.current?.animateToRegion(
			{
				latitude: shape.centre[1],
				longitude: shape.centre[0],
				latitudeDelta: 0.5,
				longitudeDelta: 0.42,
			},
			500,
		);
	};

	/** Select a unit AND move the map to it — pin tap, row tap, `focus` param. */
	const select = (u: GeoUnit) => {
		setSelectedId(u.id);
		setExpanded(true);
		mapRef.current?.animateToRegion(
			{
				latitude: u.centroid.lat,
				longitude: u.centroid.lng,
				latitudeDelta: 0.18,
				longitudeDelta: 0.15,
			},
			500,
		);
	};

	// `?focus=<unitId>` — the You tab's familiarity rows, the Saved tab's area
	// rows and the §5.5 deep link all land here. Handled once per distinct
	// value: the pool refreshing must not re-fly a map the buyer has panned.
	const { focus } = useLocalSearchParams<{ focus?: string }>();
	const handledFocus = useRef<string | null>(null);
	useEffect(() => {
		if (!focus || focus === handledFocus.current) return;
		const unit = pool.geoUnits.find((u) => u.id === focus);
		if (!unit) return; // pool still loading — retry on the next pool change
		handledFocus.current = focus;
		select(unit);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [focus, pool.geoUnits]);

	const units = useMemo(() => {
		const q = query.trim().toLowerCase();
		const list = q
			? pool.geoUnits.filter((u) => u.name.toLowerCase().includes(q))
			: pool.geoUnits;
		// Familiar units float to the top, matching the §4.3 "in your
		// journey first" rule.
		return [...list].sort((a, b) => fam(b).score - fam(a).score);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pool.geoUnits, query, signals]);

	function fam(u: GeoUnit) {
		return familiarityFor(signals, u.id);
	}

	const hits = search.result;

	// A fresh result set opens the sheet and fits the map to whatever has a
	// pin. Cities keep their centroid pins so a city-only match still lands.
	// biome-ignore lint/correctness/useExhaustiveDependencies: fit once per result set, not on every city-list re-sort
	useEffect(() => {
		if (!hits) return;
		setExpanded(true);
		const coords = [
			...hits.listings.flatMap((l) =>
				l.lat !== undefined && l.lng !== undefined
					? [{ latitude: l.lat, longitude: l.lng }]
					: [],
			),
			...hits.communities.flatMap((c) =>
				c.lat !== undefined && c.lng !== undefined
					? [{ latitude: c.lat, longitude: c.lng }]
					: [],
			),
			...units.map((u) => ({
				latitude: u.centroid.lat,
				longitude: u.centroid.lng,
			})),
		];
		if (coords.length === 0) return;
		mapRef.current?.fitToCoordinates(coords, {
			edgePadding: { top: 160, right: 40, bottom: 80, left: 40 },
			animated: true,
		});
	}, [hits]);

	const sheetH = expanded ? Math.min(height * 0.55, 480) : 110;
	const hitCount = hits
		? hits.communities.length + hits.listings.length + units.length
		: units.length;

	return (
		<View style={styles.screen}>
			{/* Map body */}
			<View style={styles.mapWrap}>
				<MapView
					ref={mapRef}
					style={StyleSheet.absoluteFill}
					mapType="mutedStandard"
					showsPointsOfInterests={false}
					showsCompass={false}
					initialRegion={{
						latitude: 33.749,
						longitude: -84.388,
						latitudeDelta: 0.55,
						longitudeDelta: 0.45,
					}}
				>
					{/* Lens fills sit UNDER every pin — they are the ground the search
					    results stand on, not a layer over them. */}
					{lensReady &&
						lens &&
						areaData.shapes.map((shape) => {
							const hit = valueByKey.get(shape.key);
							if (!hit) return null;
							const fill = colorFor(lens, hit.value, breaks);
							const open = openArea === shape.key;
							return shape.rings.map((ring, i) => (
								<Polygon
									// A county's rings are fixed in order and count for the life
									// of the bundled shape file, so the index is a stable key.
									key={`${shape.key}-${i}`}
									coordinates={ring.map(([lng, lat]) => ({
										latitude: lat,
										longitude: lng,
									}))}
									fillColor={withAlpha(
										fill,
										searching ? FILL_ALPHA_SEARCHING : FILL_ALPHA,
									)}
									strokeColor={open ? colors.ink : colors.surface}
									strokeWidth={open ? 2.5 : 1}
									tappable
									onPress={() => selectArea(shape.key)}
								/>
							));
						})}
					{units.map((u) => (
						<Marker
							key={u.id}
							coordinate={{
								latitude: u.centroid.lat,
								longitude: u.centroid.lng,
							}}
							title={u.name}
							onPress={() => select(u)}
							pinColor={selectedId === u.id ? colors.accent : colors.ink2}
						/>
					))}
					{hits?.communities.map((c) =>
						c.lat !== undefined && c.lng !== undefined ? (
							<Marker
								key={`c-${c.id}`}
								coordinate={{ latitude: c.lat, longitude: c.lng }}
								title={c.name}
								description={c.city}
								pinColor={colors.pos}
								onCalloutPress={() => router.push(`/community/${c.slug}`)}
							/>
						) : null,
					)}
					{hits?.listings.map((l) =>
						l.lat !== undefined && l.lng !== undefined ? (
							<Marker
								key={`l-${l.id}`}
								coordinate={{ latitude: l.lat, longitude: l.lng }}
								title={formatPrice(l.price) ?? l.address}
								description={l.address}
								pinColor={colors.accent}
								onCalloutPress={() => router.push(`/listing/${l.id}`)}
							/>
						) : null,
					)}
				</MapView>

				{/* Search pill (floats above map, §4.1 #1) */}
				<View style={[styles.searchPill, { top: insets.top + 8 }]}>
					<TextInput
						value={query}
						onChangeText={setQuery}
						placeholder="Address, community, city or zip…"
						placeholderTextColor={colors.ink3}
						style={styles.searchInput}
						autoCorrect={false}
						autoCapitalize="words"
						returnKeyType="search"
						onFocus={() => setExpanded(true)}
					/>
					{search.loading && (
						<ActivityIndicator size="small" color={colors.ink2} />
					)}
					{query.length > 0 && (
						<Pressable onPress={() => setQuery("")} hitSlop={12}>
							<Text style={styles.searchClear}>×</Text>
						</Pressable>
					)}
				</View>

				{/* Lens chips + legend. Hidden until the metrics arrive — a chip
				    that paints nothing is worse than no chip. */}
				{lensReady && lens && (
					<View style={[styles.lensBar, { top: insets.top + 58 }]}>
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={styles.lensChips}
							keyboardShouldPersistTaps="handled"
						>
							{LENSES.map((l) => {
								const on = l.id === lensId;
								return (
									<Pressable
										key={l.id}
										onPress={() => {
											setLensId(l.id);
											setOpenArea(null);
										}}
										style={[styles.lensChip, on && styles.lensChipOn]}
									>
										<View
											style={[styles.lensDot, { backgroundColor: l.ramp[3] }]}
										/>
										<Text style={[styles.lensLabel, on && styles.lensLabelOn]}>
											{l.label}
										</Text>
									</Pressable>
								);
							})}
						</ScrollView>
						{legend && !searching && (
							<View style={styles.legend}>
								<Text style={styles.legendTitle} numberOfLines={1}>
									{lens.unit}
								</Text>
								<View style={styles.legendRamp}>
									{lens.ramp.map((c) => (
										<View
											key={c}
											style={[styles.legendStep, { backgroundColor: c }]}
										/>
									))}
								</View>
								<View style={styles.legendLabels}>
									<Text style={styles.legendEnd}>{legend.low}</Text>
									<Text style={styles.legendEnd}>{legend.high}</Text>
								</View>
							</View>
						)}
					</View>
				)}
			</View>

			{/* Collapsible list sheet */}
			<View
				style={[styles.sheet, { height: sheetH, paddingBottom: insets.bottom }]}
			>
				<Pressable
					style={styles.grabberArea}
					onPress={() => setExpanded((v) => !v)}
				>
					<View style={styles.grabber} />
				</Pressable>
				<Text style={styles.sheetTitle}>
					{searching
						? `"${query.trim()}"`
						: openedArea
							? `${openedArea.name} County`
							: lensReady && lens
								? lens.rankTitle
								: "All areas"}
					{searching && !(poolLoading || search.loading)
						? ` · ${hitCount}`
						: ""}
				</Text>
				{expanded && (
					<ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
						{/* One county, opened from the map or the ranking. */}
						{!searching && openedArea && lens && (
							<AreaDetail
								area={openedArea}
								onBack={() => setOpenArea(null)}
								backLabel={lens.rankTitle}
							/>
						)}

						{/* The lens ranking — the same numbers the map is painted with,
						    in order, so the colours can be read as values. */}
						{!searching && !openedArea && lensReady && lens && (
							<>
								<Text style={styles.lensCaption}>{lens.caption}</Text>
								{ranked.map((hit) => (
									<Pressable
										key={hit.area.key}
										style={styles.rankRow}
										onPress={() => selectArea(hit.area.key)}
									>
										<View
											style={[
												styles.rankSwatch,
												{
													backgroundColor: colorFor(lens, hit.value, breaks),
												},
											]}
										/>
										<Text style={styles.rankName} numberOfLines={1}>
											{hit.area.name}
										</Text>
										<Text style={styles.rankValue}>
											{lens.format(hit.value)}
											{hit.estimated ? "*" : ""}
										</Text>
									</Pressable>
								))}
								{estimateNote ? (
									<Text style={styles.estimateNote}>{estimateNote}</Text>
								) : null}
							</>
						)}

						{searching && search.error && (
							<View style={styles.stateBox}>
								<Text style={styles.empty}>Couldn’t reach search.</Text>
								<Pressable onPress={search.retry} style={styles.retryBtn}>
									<Text style={styles.retryLabel}>Try again</Text>
								</Pressable>
							</View>
						)}
						{searching && !search.error && !hits && (
							<Text style={styles.empty}>Searching…</Text>
						)}
						{searching && hits && hitCount === 0 && (
							<Text style={styles.empty}>
								No match — try a street, community, city or zip.
							</Text>
						)}
						{!searching && !poolLoading && units.length === 0 && (
							<Text style={styles.empty}>
								No areas yet.{"\n"}Discovery lives in the feed.
							</Text>
						)}

						{hits && hits.communities.length > 0 && (
							<Text style={styles.groupTitle}>Communities</Text>
						)}
						{hits?.communities.map((c) => (
							<Pressable
								key={`c-${c.id}`}
								style={styles.row}
								onPress={() => router.push(`/community/${c.slug}`)}
							>
								<Image
									source={c.heroUrl ? { uri: c.heroUrl } : undefined}
									style={styles.rowThumb}
								/>
								<View style={styles.rowText}>
									<Text style={styles.rowName}>{c.name}</Text>
									<Text style={styles.rowSub}>
										{c.city}, {c.state}
									</Text>
								</View>
							</Pressable>
						))}

						{hits && hits.listings.length > 0 && (
							<Text style={styles.groupTitle}>Homes</Text>
						)}
						{hits?.listings.map((l) => (
							<Pressable
								key={`l-${l.id}`}
								style={styles.row}
								onPress={() => router.push(`/listing/${l.id}`)}
							>
								<Image
									source={l.coverUrl ? { uri: l.coverUrl } : undefined}
									style={styles.rowThumb}
								/>
								<View style={styles.rowText}>
									<Text style={styles.rowName} numberOfLines={1}>
										{[formatPrice(l.price), l.address]
											.filter(Boolean)
											.join(" · ")}
									</Text>
									<Text style={styles.rowSub} numberOfLines={1}>
										{[
											`${l.city}, ${l.state}${l.zip ? ` ${l.zip}` : ""}`,
											specsLine(l.beds, l.baths, l.sqft),
										]
											.filter(Boolean)
											.join(" · ")}
									</Text>
								</View>
							</Pressable>
						))}

						{!openedArea && units.length > 0 && (
							<Text style={styles.groupTitle}>Areas</Text>
						)}
						{!openedArea &&
							units.map((u) => (
								<Pressable
									key={u.id}
									style={[
										styles.row,
										selectedId === u.id && styles.rowSelected,
									]}
									onPress={() => select(u)}
								>
									<Image source={{ uri: u.heroUrl }} style={styles.rowThumb} />
									<View style={styles.rowText}>
										<Text style={styles.rowName}>{u.name}</Text>
										<Text style={styles.rowSub}>
											{u.communityCount > 0
												? `${u.communityCount} communities`
												: "no communities yet"}
										</Text>
									</View>
								</Pressable>
							))}
					</ScrollView>
				)}
			</View>
		</View>
	);
}

/**
 * One county's cost, broken into the lines that make it up.
 *
 * The breakdown is the point, not the total: the study's complaint was that
 * nobody could tell buyers WHAT the money went to, and a single number repeats
 * that. Every line names its own figure, and the provenance row underneath
 * says where the numbers came from and how old they are — including, plainly,
 * when they are still our estimate.
 */
function AreaDetail({
	area,
	onBack,
	backLabel,
}: {
	area: Area;
	onBack: () => void;
	backLabel: string;
}) {
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
		<View style={styles.detail}>
			<Pressable onPress={onBack} hitSlop={10}>
				<Text style={styles.detailBack}>‹ {backLabel}</Text>
			</Pressable>

			{total !== undefined ? (
				<>
					<View style={styles.detailHero}>
						<Text style={styles.detailHeroValue}>
							${total.toLocaleString()}
						</Text>
						<Text style={styles.detailHeroUnit}>
							true cost /mo · $500k home
						</Text>
					</View>
					{lines?.map((line) => (
						<View key={line.label}>
							<View style={styles.detailRow}>
								<Text style={styles.detailRowLabel} numberOfLines={1}>
									{line.label}
								</Text>
								<View style={styles.detailBarTrack}>
									<View
										style={[
											styles.detailBarFill,
											{
												width: `${Math.max(5, Math.round((line.monthlyUsd / max) * 100))}%`,
											},
										]}
									/>
								</View>
								<Text style={styles.detailRowValue}>
									${line.monthlyUsd}
									{line.estimated ? "*" : ""}
								</Text>
							</View>
							{/* Who supplies it, when we know. A bare "$157" is a
							    number to take on trust; "Georgia Power · 14.6¢ per
							    kWh" is a number the buyer can go and check. */}
							{line.note ? (
								<Text style={styles.detailRowNote} numberOfLines={2}>
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
				<View style={styles.detailChips}>
					{school && (
						<View style={styles.detailChip}>
							<Text style={styles.detailChipText}>
								Schools{" "}
								<Text style={styles.detailChipValue}>
									{Math.round(school.value)}%
								</Text>{" "}
								proficient
							</Text>
						</View>
					)}
					{statutory && (
						<View style={styles.detailChip}>
							<Text style={styles.detailChipText}>
								Adopted tax rate{" "}
								<Text style={styles.detailChipValue}>
									{statutory.value.toFixed(2)}%
								</Text>{" "}
								before exemptions
							</Text>
						</View>
					)}
				</View>
			)}

			<Text style={styles.detailSource}>
				{estimatedLines.length > 0
					? `Sourced from public records, except ${listOf(estimatedLines)} — those are still our estimate.`
					: "Every figure here is from a public record."}
				{asOf ? ` Most recent data ${asOf}.` : ""}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	mapWrap: { flex: 1, backgroundColor: colors.surface2 },
	searchPill: {
		position: "absolute",
		left: 16,
		right: 16,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: colors.glass,
		borderRadius: radii.pill,
		paddingHorizontal: 16,
		paddingVertical: 10,
		shadowColor: "#000",
		shadowOpacity: 0.08,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 2 },
	},
	searchInput: { flex: 1, ...textStyles.body, color: colors.ink },
	searchClear: { ...textStyles.title2, color: colors.ink2 },
	sheet: {
		backgroundColor: colors.surface,
		borderTopLeftRadius: radii.sheet,
		borderTopRightRadius: radii.sheet,
		shadowColor: "#000",
		shadowOpacity: 0.1,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: -2 },
	},
	grabberArea: { alignItems: "center", paddingVertical: 8 },
	grabber: {
		width: 44,
		height: 5,
		borderRadius: 3,
		backgroundColor: colors.border,
	},
	sheetTitle: {
		...textStyles.caption,
		color: colors.ink2,
		paddingHorizontal: 20,
		marginBottom: 6,
	},
	list: { flex: 1, paddingHorizontal: 12 },
	groupTitle: {
		...textStyles.caption,
		color: colors.ink3,
		textTransform: "uppercase",
		letterSpacing: 0.6,
		paddingHorizontal: 8,
		paddingTop: 12,
		paddingBottom: 4,
	},
	stateBox: { alignItems: "center", gap: 8, paddingBottom: 12 },
	empty: {
		...textStyles.body,
		color: colors.ink2,
		padding: 20,
		textAlign: "center",
	},
	retryBtn: {
		backgroundColor: colors.cta,
		borderRadius: radii.pill,
		paddingHorizontal: 18,
		paddingVertical: 8,
	},
	retryLabel: { ...textStyles.caption, color: "#FFFFFF" },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
		paddingHorizontal: 8,
		borderRadius: radii.tile,
	},
	rowSelected: { backgroundColor: colors.surface2 },
	rowThumb: {
		width: 48,
		height: 48,
		borderRadius: radii.tile,
		backgroundColor: colors.surface2,
	},
	rowText: { flex: 1, gap: 2 },
	rowName: { ...textStyles.headline, color: colors.ink },
	rowSub: { ...textStyles.footnote, color: colors.ink2 },

	// ── Lens chips + legend ───────────────────────────────────────────────────
	lensBar: { position: "absolute", left: 0, right: 0 },
	lensChips: { paddingHorizontal: 16, gap: 7 },
	lensChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: colors.glass,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radii.pill,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	lensChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
	lensDot: { width: 8, height: 8, borderRadius: 2 },
	lensLabel: { ...textStyles.footnote, color: colors.ink, fontWeight: "600" },
	lensLabelOn: { color: "#FFFFFF" },
	legend: {
		marginTop: 8,
		marginHorizontal: 16,
		backgroundColor: colors.glass,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radii.tile,
		paddingHorizontal: 10,
		paddingTop: 6,
		paddingBottom: 7,
	},
	legendTitle: { ...textStyles.caption, color: colors.ink, fontWeight: "700" },
	legendRamp: {
		flexDirection: "row",
		height: 8,
		borderRadius: 3,
		overflow: "hidden",
		marginTop: 4,
	},
	legendStep: { flex: 1 },
	legendLabels: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 3,
	},
	legendEnd: { ...textStyles.caption, color: colors.ink2 },

	// ── Lens ranking ──────────────────────────────────────────────────────────
	lensCaption: {
		...textStyles.footnote,
		color: colors.ink2,
		paddingHorizontal: 8,
		paddingBottom: 8,
	},
	rankRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 9,
		paddingHorizontal: 8,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	rankSwatch: { width: 14, height: 14, borderRadius: 4 },
	rankName: { ...textStyles.headline, color: colors.ink, flex: 1 },
	rankValue: { ...textStyles.headline, color: colors.ink2 },
	estimateNote: {
		...textStyles.caption,
		color: colors.ink3,
		paddingHorizontal: 8,
		paddingTop: 10,
	},

	// ── County detail ─────────────────────────────────────────────────────────
	detail: { paddingHorizontal: 8, paddingBottom: 8 },
	detailBack: {
		...textStyles.footnote,
		color: colors.accent,
		fontWeight: "600",
		paddingBottom: 6,
	},
	detailHero: { flexDirection: "row", alignItems: "baseline", gap: 8 },
	detailHeroValue: { ...textStyles.title1, color: colors.ink },
	detailHeroUnit: { ...textStyles.caption, color: colors.ink2, flex: 1 },
	detailRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 7,
	},
	detailRowLabel: { ...textStyles.footnote, color: colors.ink2, width: 118 },
	detailBarTrack: {
		flex: 1,
		height: 7,
		borderRadius: 4,
		backgroundColor: colors.surface2,
		overflow: "hidden",
	},
	detailBarFill: { height: 7, borderRadius: 4, backgroundColor: colors.accent },
	detailRowValue: {
		...textStyles.footnote,
		color: colors.ink,
		width: 48,
		textAlign: "right",
	},
	detailRowNote: {
		...textStyles.caption,
		color: colors.ink3,
		marginTop: -3,
		marginBottom: 3,
		lineHeight: 14,
	},
	detailChips: { flexDirection: "row", gap: 6, marginTop: 10 },
	detailChip: {
		backgroundColor: colors.surface2,
		borderRadius: radii.tile,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	detailChipText: { ...textStyles.caption, color: colors.ink2 },
	detailChipValue: { color: colors.ink, fontWeight: "700" },
	detailSource: {
		...textStyles.caption,
		color: colors.ink3,
		marginTop: 12,
		lineHeight: 15,
	},
});
