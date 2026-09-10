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
 * ── Drilling in (phase265) ──────────────────────────────────────────────────
 * The map narrows the way the owner described it: county → city → community →
 * home. Each tap goes one level in, and the sheet under it lists what lives at
 * the level reached:
 *
 *   county outline → zoom to it; sheet previews its headline figure and the
 *                    CITIES inside it
 *   city pin       → zoom to it; sheet lists that city's COMMUNITIES and HOMES
 *   community pin  → its explore page.  home pin → its listing page.
 *
 * The city step asks the SAME search endpoint for the city's name rather than
 * a new one: `searchEntities` already matches communities on `city`, so
 * "Roswell" is literally the query for "what is in Roswell".
 *
 * ── Nothing covers the map (owner, 2026-09-09, twice) ───────────────────────
 * "The map page only shows a preview, not a full screen details that hide map
 * itself" — then, after the drill shipped: "don't show the sheet with all
 * community list after clicking the city, I don't want to hide the map, same
 * rule applied everywhere, too much data and numbers." So:
 *
 *   · a tap on the MAP never opens the sheet. It re-frames the map and moves
 *     the peek's title. Only a TYPED query opens the list — you asked in
 *     words, you get words back.
 *   · the peek carries what the map cannot say: where you are, one way back,
 *     and on a county its ONE figure plus a link to the page.
 *   · the county cost breakdown and the lens ranking live on `/area/[key]`.
 *   · there is no legend. The ramp with "PER MONTH ON A $500K HOME" over it
 *     was a permanent block of numerals on a surface that should be
 *     photographs; the chip names the dimension and tapping a county gives
 *     the figure, so the buyer reads a number when they ask for one.
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
 * While results are on the map — a text search, or a city drilled into — the
 * fills drop to a whisper so those pins stay readable: the buyer asked a
 * question, and the lens is context.
 */
import {
	type Area,
	LENSES,
	type LensId,
	classBreaks,
	colorFor,
	lensById,
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
import MapView, { type LatLng, Marker, Polygon } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAreas } from "../../hooks/use-areas";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { MIN_QUERY_LEN, useSearch } from "../../hooks/use-search";
import { familiarityFor } from "../../lib/area-familiarity";
import { areasByKey } from "../../lib/areas/areas-dto";
import {
	countyKeyForPoint,
	savedCitiesByCounty,
	savedCityNote,
} from "../../lib/areas/locate";
import type { GeoUnit } from "../../lib/feed/geo-unit";
import { areaUnitId, formatPrice, specsLine } from "../../lib/saved/rows";
import { useFeedSession } from "../../state/feed-session";
import { useFunnelStore } from "../../state/funnel";
import { useSavedStore } from "../../state/saved";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/** Fill opacity for a lens polygon: readable at rest, a whisper while the
 *  buyer is reading search pins over it. */
const FILL_ALPHA = 0.62;
const FILL_ALPHA_SEARCHING = 0.16;

/** The metro at rest — the map's opening frame, and where "back" returns to. */
const METRO_REGION = {
	latitude: 33.749,
	longitude: -84.388,
	latitudeDelta: 0.55,
	longitudeDelta: 0.45,
};

/** "$525K" / "$1.2M" — the map chip has no room for `formatPrice`'s
 *  "$525,000", and the chip is what tells a HOME from a community out there. */
function compactPrice(price: number | undefined): string | undefined {
	if (price === undefined || !Number.isFinite(price) || price <= 0) {
		return undefined;
	}
	if (price >= 1_000_000) {
		return `$${(price / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	}
	if (price >= 1_000) {
		return `$${Math.round(price / 1_000)}K`;
	}
	return `$${Math.round(price)}`;
}

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

	const searching = query.trim().length >= MIN_QUERY_LEN;
	/** The city the buyer has drilled into, when they have. */
	const drillCity = selectedId
		? pool.geoUnits.find((u) => u.id === selectedId)
		: undefined;
	// One endpoint serves both the typed question and the drill: `searchEntities`
	// matches communities on `city`, so a city's own name IS the query for what
	// is inside it. A typed query always wins — the buyer is asking, not browsing.
	const search = useSearch(searching ? query : (drillCity?.name ?? ""));

	const mapRef = useRef<MapView>(null);

	// ── Lenses ────────────────────────────────────────────────────────────────
	// A failure is deliberately not surfaced: the tab's own job is searching,
	// and it still works. The chips simply never appear.
	const { areas: areaData } = useAreas();
	// NO lens until the buyer picks one (owner, 2026-09-09). The map opens as a
	// map — photographs and county lines — and colour arrives only when someone
	// asks a question with a chip. Tapping the live chip puts it away again.
	const [lensId, setLensId] = useState<LensId | null>(null);
	const [openArea, setOpenArea] = useState<string | null>(null);

	const lens = lensId ? lensById(lensId) : undefined;
	const metricsByKey = useMemo(
		() => areasByKey(areaData.areas),
		[areaData.areas],
	);
	const breaks = useMemo(
		() => (lens ? classBreaks(lens, areaData.areas) : []),
		[lens, areaData.areas],
	);
	// Which of the buyer's saved CITIES sit in each county. The map ranks
	// counties and a buyer saves cities, so a county is never marked "saved" —
	// the row names the city instead. On 29 otherwise identical outlines this
	// is the only thing that says where they already stand.
	const savedItems = useSavedStore((s) => s.items);
	const savedByCounty = useMemo(
		() =>
			savedCitiesByCounty(
				savedItems
					.filter((i) => i.kind === "area")
					.map((i) => areaUnitId(i.id)),
				pool.geoUnits,
				areaData.shapes,
			),
		[savedItems, pool.geoUnits, areaData.shapes],
	);
	const savedNoteFor = (key: string) => savedCityNote(savedByCounty.get(key));

	const ranked = useMemo(
		() => (lens ? rankedBy(lens, areaData.areas) : []),
		[lens, areaData.areas],
	);
	/** Value per county key, so a polygon's fill is one map lookup. */
	const valueByKey = useMemo(
		() => new Map(ranked.map((v) => [v.area.key, v])),
		[ranked],
	);
	/** The chips appear once the METRICS have landed, not once a lens is on —
	 *  with no lens by default, keying this to `ranked` would hide the only
	 *  control that can turn one on. */
	const lensReady = areaData.areas.length > 0;

	const openedArea: Area | undefined = openArea
		? metricsByKey.get(openArea)
		: undefined;

	/** Move the map to a county and preview it — one level in from the metro. */
	const selectArea = (key: string) => {
		setOpenArea(key);
		// A county tap re-frames the level below it, never keeps a stale city.
		setSelectedId(null);
		// Collapse, never open: a tap on the map is answered BY the map, and a
		// sheet over it is the thing the owner keeps asking us to stop doing.
		setExpanded(false);
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
		// The city's communities arrive as PINS. Listing them over the map was
		// exactly the complaint (owner, 2026-09-09) — pull the sheet up for the
		// list, or read the map.
		setExpanded(false);
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

	/** One level out: a city returns to its county, a county to the metro. */
	const goBack = () => {
		if (drillCity) {
			setSelectedId(null);
			if (openArea) selectArea(openArea);
			else mapRef.current?.animateToRegion(METRO_REGION, 500);
			return;
		}
		setOpenArea(null);
		mapRef.current?.animateToRegion(METRO_REGION, 500);
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

	/**
	 * The city pins the map is drawing, which is what the drill level decides.
	 * A county shows the cities inside its outline — resolved by centroid with
	 * the outlines the lens map already downloaded (`locate.ts`), so this costs
	 * no request and no new column.
	 */
	const visibleUnits = useMemo(() => {
		if (searching) return units;
		if (drillCity) return [drillCity];
		if (openArea) {
			return units.filter(
				(u) =>
					countyKeyForPoint(u.centroid.lat, u.centroid.lng, areaData.shapes) ===
					openArea,
			);
		}
		return units;
	}, [units, searching, drillCity, openArea, areaData.shapes]);

	/** Inside a city the sheet lists what is IN it, not the city itself. */
	const listedUnits = drillCity ? [] : visibleUnits;

	const hits = search.result;

	// A fresh result set opens the sheet and fits the map to whatever has a
	// pin. Cities keep their centroid pins so a city-only match still lands.
	// biome-ignore lint/correctness/useExhaustiveDependencies: fit once per result set, not on every city-list re-sort
	useEffect(() => {
		if (!hits) return;
		// A TYPED question opens the list — you asked in words, you get words
		// back. A drill does not: its answer is the pins that just appeared.
		if (searching) setExpanded(true);
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
			...visibleUnits.map((u) => ({
				latitude: u.centroid.lat,
				longitude: u.centroid.lng,
			})),
		];
		const only = coords[0];
		if (!only) return;
		// `fitToCoordinates` on a single point zooms to a rooftop. One hit still
		// deserves a neighbourhood around it.
		if (coords.length === 1) {
			mapRef.current?.animateToRegion(
				{ ...only, latitudeDelta: 0.06, longitudeDelta: 0.05 },
				500,
			);
			return;
		}
		mapRef.current?.fitToCoordinates(coords, {
			edgePadding: { top: 160, right: 40, bottom: 80, left: 40 },
			animated: true,
		});
	}, [hits]);

	/** A county says its one figure in the peek — it never needs half the
	 *  screen, and the map is the thing being previewed. */
	const previewing = !searching && !drillCity && !!openedArea;
	/** The county's figure under the ACTIVE lens — the one the map is painted
	 *  with, so the preview and the colour under it agree. */
	const previewHit = openArea ? valueByKey.get(openArea) : undefined;
	const previewValue =
		previewHit && lens
			? `${lens.format(previewHit.value)}${previewHit.estimated ? "*" : ""}`
			: undefined;
	/** Either kind of question is out to the search endpoint. */
	const asking = searching || !!drillCity;
	const sheetH = expanded
		? Math.min(height * 0.55, 480)
		: previewing
			? 148
			: 110;
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
					initialRegion={METRO_REGION}
				>
					{/* County OUTLINES, always — the areas are a boundary, not a pin,
					    and they are the map's structure whether or not a lens is on.
					    A lens fills them in; without one they are just lines. */}
					{areaData.shapes.map((shape) => {
						const hit = lens ? valueByKey.get(shape.key) : undefined;
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
								fillColor={
									lens && hit
										? withAlpha(
												colorFor(lens, hit.value, breaks),
												asking ? FILL_ALPHA_SEARCHING : FILL_ALPHA,
											)
										: withAlpha(colors.ink2, 0)
								}
								strokeColor={
									open
										? colors.ink
										: lens && hit
											? colors.surface
											: withAlpha(colors.ink2, 0.45)
								}
								strokeWidth={open ? 2.5 : 1}
								tappable
								onPress={() => selectArea(shape.key)}
							/>
						));
					})}
					{visibleUnits.map((u) => (
						<PhotoMarker
							key={u.id}
							coordinate={{
								latitude: u.centroid.lat,
								longitude: u.centroid.lng,
							}}
							photoUrl={u.heroUrl}
							ring={colors.ink2}
							selected={selectedId === u.id}
							name={u.name}
							onPress={() => select(u)}
						/>
					))}
					{/* A community draws its own outline when we have one — that is
					    what it IS, and it tells a subdivision's shape and size in a
					    way a 40px circle never could. The pin is the fallback for the
					    rows with no polygon, not the default. */}
					{hits?.communities.map((c) =>
						c.boundary
							? c.boundary.map((ring, i) => (
									<Polygon
										key={`cb-${c.id}-${i}`}
										coordinates={ring.map(([lng, lat]) => ({
											latitude: lat,
											longitude: lng,
										}))}
										fillColor={withAlpha(colors.pos, 0.2)}
										strokeColor={colors.pos}
										strokeWidth={2}
										tappable
										onPress={() => router.push(`/community/${c.slug}`)}
									/>
								))
							: c.lat !== undefined && c.lng !== undefined
								? [
										<PhotoMarker
											key={`c-${c.id}`}
											coordinate={{ latitude: c.lat, longitude: c.lng }}
											photoUrl={c.heroUrl}
											ring={colors.pos}
											name={c.name}
											onPress={() => router.push(`/community/${c.slug}`)}
										/>,
									]
								: null,
					)}
					{hits?.listings.map((l) =>
						l.lat !== undefined && l.lng !== undefined ? (
							<PhotoMarker
								key={`l-${l.id}`}
								coordinate={{ latitude: l.lat, longitude: l.lng }}
								photoUrl={l.coverUrl}
								ring={colors.accent}
								label={compactPrice(l.price) ?? "HOME"}
								name={l.address}
								onPress={() => router.push(`/listing/${l.id}`)}
							/>
						) : null,
					)}
				</MapView>

				{/* Search pill (floats above map, §4.1 #1) */}
				<View style={[styles.searchPill, { top: insets.top + 8 }]}>
					<TextInput
						value={query}
						onChangeText={setQuery}
						// Names the levels the map itself walks, coarse to fine, so the
						// box and the map read as one thing (owner, 2026-09-09). Zip
						// still matches; the hint stays short rather than complete.
						placeholder="Area, city, community or address…"
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

				{/* Lens chips. Hidden until the metrics arrive — a chip that paints
				    nothing is worse than no chip. */}
				{lensReady && (
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
										// A chip RECOLOURS the map. It opens no list: the ranking
										// is a page now, reached from a county (owner, 2026-09-09).
										// Tapping the live one turns the colour back off.
										onPress={() => setLensId(on ? null : l.id)}
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
				{/* The peek, and everything the map needs to say without covering
				    itself: where you are, one way back, and — on a county — its one
				    figure with the door to the rest. */}
				<View style={styles.headRow}>
					{!searching && (drillCity || openedArea) ? (
						<Pressable onPress={goBack} hitSlop={14}>
							<Text style={styles.backChevron}>‹</Text>
						</Pressable>
					) : null}
					<Text style={styles.sheetTitle} numberOfLines={1}>
						{searching
							? `"${query.trim()}"`
							: drillCity
								? drillCity.name
								: openedArea
									? `${openedArea.name} County`
									: "All areas"}
						{searching && !(poolLoading || search.loading)
							? ` · ${hitCount}`
							: ""}
					</Text>
					{previewing && previewValue ? (
						<Text style={styles.headValue}>{previewValue}</Text>
					) : null}
				</View>
				{previewing && openedArea ? (
					<>
						{savedNoteFor(openedArea.key) ? (
							<Text style={styles.previewSaved} numberOfLines={1}>
								{savedNoteFor(openedArea.key)}
							</Text>
						) : null}
						<Pressable
							style={styles.previewCta}
							// With no lens on, the page picks its own default rather than
							// being handed the string "null".
							onPress={() =>
								router.push(
									lensId
										? `/area/${openedArea.key}?lens=${lensId}`
										: `/area/${openedArea.key}`,
								)
							}
						>
							<Text style={styles.previewCtaLabel}>Full breakdown ›</Text>
						</Pressable>
					</>
				) : null}
				{expanded && (
					<ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
						{asking && search.error && (
							<View style={styles.stateBox}>
								<Text style={styles.empty}>Couldn’t reach search.</Text>
								<Pressable onPress={search.retry} style={styles.retryBtn}>
									<Text style={styles.retryLabel}>Try again</Text>
								</Pressable>
							</View>
						)}
						{asking && !search.error && !hits && (
							<Text style={styles.empty}>
								{searching ? "Searching…" : "Loading…"}
							</Text>
						)}
						{searching && hits && hitCount === 0 && (
							<Text style={styles.empty}>
								No match — try a street, community, city or zip.
							</Text>
						)}
						{!searching &&
							drillCity &&
							hits &&
							hits.communities.length === 0 &&
							hits.listings.length === 0 && (
								<Text style={styles.empty}>
									Nothing mapped in {drillCity.name} yet.
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

						{listedUnits.length > 0 && (
							<Text style={styles.groupTitle}>
								{previewing ? "Cities" : "Areas"}
							</Text>
						)}
						{listedUnits.map((u) => (
							<Pressable
								key={u.id}
								style={[styles.row, selectedId === u.id && styles.rowSelected]}
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
 * A map pin that shows the spot's own face — its hero photo in a circle —
 * instead of the stock teardrop. The old pinColor language survives as the
 * ring: what the colour used to say about the spot's kind, the border says now.
 *
 * A spot with no photo shows the first letter of its name (owner, 2026-09-09).
 * It used to be a solid disc in the ring colour, which said only "something is
 * here"; the letter says which one, and photo coverage is thin enough on
 * communities that this is a common face rather than an edge case.
 *
 * `label` hangs a small chip under the circle. Listings pass their price
 * through it, which is also what tells a HOME from a community at a glance —
 * ring colour alone was too quiet a distinction (owner, 2026-09-09).
 *
 * No `title`/`description`: those draw a callout, and every pin here is a
 * one-tap action — drill into the city, open the community, open the home.
 */
function PhotoMarker({
	coordinate,
	photoUrl,
	ring,
	selected,
	name,
	label,
	onPress,
}: {
	coordinate: LatLng;
	photoUrl?: string;
	ring: string;
	selected?: boolean;
	name: string;
	label?: string;
	onPress: () => void;
}) {
	const border = selected ? colors.accent : ring;
	return (
		<Marker coordinate={coordinate} onPress={onPress}>
			<View style={styles.pinWrap} accessibilityLabel={name}>
				<View
					style={[
						styles.pin,
						{ borderColor: border },
						selected && styles.pinSelected,
					]}
				>
					{photoUrl ? (
						<Image source={{ uri: photoUrl }} style={styles.pinPhoto} />
					) : (
						<Text style={[styles.pinInitial, { color: border }]}>
							{name.trim().charAt(0).toUpperCase()}
						</Text>
					)}
				</View>
				{label ? (
					<View style={[styles.pinLabel, { borderColor: border }]}>
						<Text style={styles.pinLabelText}>{label}</Text>
					</View>
				) : null}
			</View>
		</Marker>
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
	headRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 20,
		marginBottom: 6,
	},
	backChevron: { ...textStyles.title2, color: colors.accent, marginTop: -4 },
	sheetTitle: { ...textStyles.caption, color: colors.ink2, flex: 1 },
	headValue: { ...textStyles.title2, color: colors.ink },
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

	// ── Map pins ──────────────────────────────────────────────────────────────
	pinWrap: { alignItems: "center", gap: 2 },
	pin: {
		width: 40,
		height: 40,
		borderRadius: radii.pill,
		borderWidth: 2,
		backgroundColor: colors.surface2,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	pinSelected: { borderWidth: 3 },
	pinPhoto: { width: "100%", height: "100%" },
	pinInitial: { ...textStyles.headline, fontWeight: "700" },
	pinLabel: {
		backgroundColor: colors.glass,
		borderWidth: 1,
		borderRadius: radii.pill,
		paddingHorizontal: 6,
		paddingVertical: 1,
	},
	pinLabelText: {
		...textStyles.caption,
		letterSpacing: 0.2,
		color: colors.ink,
	},

	// ── Lens chips ────────────────────────────────────────────────────────────
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
	// ── County peek ───────────────────────────────────────────────────────────
	previewSaved: {
		...textStyles.caption,
		color: colors.accent,
		paddingHorizontal: 20,
	},
	previewCta: { paddingHorizontal: 20, paddingTop: 8 },
	previewCtaLabel: {
		...textStyles.footnote,
		color: colors.accent,
		fontWeight: "600",
	},
});
