/**
 * Search tab (spec-v3 `04-search.md`) — map + collapsible list.
 *
 * ── v1 scope vs §4.1 ────────────────────────────────────────────────────────
 * The spec's full version wants: 3-detent sheet, pin↔row two-way sync,
 * popularity sorting server-side, listing price pins at zoom ≥14. This is the
 * honest subset that ships for the store launch (phase D):
 *
 *   · no query → map renders CITY pins from the feed pool, familiar ones
 *     sorted first (§4.3 "in your journey first"), and there is NO sheet
 *   · ≥2 characters → `/api/mobile/search` (`hooks/use-search.ts`) returns
 *     communities + homes; the sheet shows them grouped, plus any city whose
 *     name matches, and the map fits to the hits that have coordinates
 *   · community / home row tap → its detail page; city row tap → fly to it
 *     (city/zip "don't leave the surface" per §4.4)
 *
 * ── Drilling in (phase265) ──────────────────────────────────────────────────
 * The map narrows the way the owner described it: county → city → community →
 * home. Each tap goes one level in, and the MAP is what answers:
 *
 *   county outline → zoom to it; its cities become the visible pins
 *   city pin       → zoom to it; its communities become the visible dots
 *   community      → its explore page.  home pin → its listing page.
 *
 * The city step asks the SAME search endpoint for the city's name rather than
 * a new one: `searchEntities` already matches communities on `city`, so
 * "Roswell" is literally the query for "what is in Roswell".
 *
 * ── The sheet is for typed search, and nothing else ─────────────────────────
 * Three rounds of the same note (owner, 2026-09-09 ×2 and 2026-09-10): "the
 * map page only shows a preview, not a full screen details that hide map
 * itself" → "don't show the sheet with all community list after clicking the
 * city, I don't want to hide the map, same rule applied everywhere, too much
 * data and numbers" → "still see empty sheet for county and city… need a
 * different entry to see details". Each round moved the panel; the panel was
 * the problem. So:
 *
 *   · the sheet is MOUNTED only while a query is typed. Nothing a map tap can
 *     do brings it back — a sheet holding one line still reads as an empty
 *     panel, which is what the third note was about.
 *   · a county or a city puts a PILL on the map instead: back, the name, and
 *     for a county its one figure and the way into `/area/[key]`. It is sized
 *     to its own text, so the map runs under and around it.
 *   · the county cost breakdown and the lens ranking live on `/area/[key]`.
 *   · the legend is CONDITIONAL (phase275). phase265 removed a permanent ramp
 *     with "PER MONTH ON A $500K HOME" over it, and that removal was right
 *     about the permanence and wrong about the key: with no legend at all the
 *     fills became decoration, which is what the owner eventually said out
 *     loud (2026-09-11: "I don't know the lens color meaning here, it is not
 *     very useful"). It now appears only while a lens is on — i.e. only in the
 *     moment the buyer asked the question — sits directly under the chip that
 *     turned it on, and is two short rows rather than a block.
 *
 * A CITY has no page behind its pill, and that is not an oversight: there is
 * no city record in this product, only communities grouped by a `city` string.
 * Its communities are on the map, which is the answer.
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
	legendRange,
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
import MapView, {
	type LatLng,
	type MapPressEvent,
	Marker,
	Polygon,
} from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAreas } from "../../hooks/use-areas";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { useSchools } from "../../hooks/use-schools";
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
import {
	type MapRegion,
	PROFICIENCY_LEGEND,
	type SchoolPin,
	proficiencyStep,
	schoolNote,
	shortSchoolName,
	shouldLabel,
	visibleSchools,
} from "../../lib/schools/school-pins";
import { useFeedSession } from "../../state/feed-session";
import { useFunnelStore } from "../../state/funnel";
import { useSavedStore } from "../../state/saved";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/** Fill opacity for a lens polygon: readable at rest, a whisper while the
 *  buyer is reading search pins over it. */
const FILL_ALPHA = 0.62;
const FILL_ALPHA_SEARCHING = 0.16;

/** How close (screen points) a bare map press must land to a community mark
 *  for `onMapPress` to claim it for that community. A finger-sized ring
 *  around a small mark — anything farther is a pan/read tap, not an aim. */
const DOT_TAP_RADIUS_PX = 28;

/** Below this `latitudeDelta` the marks put their words on — community
 *  names and home prices. Matches the school layer's finest step
 *  (`levelsForZoom`), so "zoomed in enough" means the same thing on every
 *  layer of this map. */
const MARK_LABEL_DELTA = 0.06;

/** The disclaim radius around a home pin or city photo pin: a bare map
 *  press this close to one was aimed at IT, and its own marker handles it —
 *  `onMapPress` must not reroute the same tap to a community. */
const PIN_TAP_RADIUS_PX = 30;

/** The metro at rest — the map's opening frame, and where "back" returns to. */
const METRO_REGION = {
	latitude: 33.749,
	longitude: -84.388,
	latitudeDelta: 0.55,
	longitudeDelta: 0.45,
};

/** "525,000" — the digits alone. Owner's spec for the home chip
 *  (2026-09-13): "the numbers only no k, m" — no compression, and the
 *  amber house pin is what says it is a price, not the "$". */
function fullPrice(price: number | undefined): string | undefined {
	if (price === undefined || !Number.isFinite(price) || price <= 0) {
		return undefined;
	}
	return Math.round(price).toLocaleString("en-US");
}

/** `#rrggbb` + alpha → the `#rrggbbaa` react-native-maps accepts. */
function withAlpha(hex: string, alpha: number): string {
	const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
		.toString(16)
		.padStart(2, "0");
	return `${hex}${a}`;
}

export default function SearchTab() {
	const { width, height } = useWindowDimensions();
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
	/** What the map is currently showing. Only the school layer and the
	 *  community labels read it, and only `onRegionChangeComplete` writes it —
	 *  which fires when a gesture ENDS, not through the pan, so this is a
	 *  handful of renders and not a stream of them. */
	const [region, setRegion] = useState<MapRegion>(METRO_REGION);

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

	// ── The school layer ──────────────────────────────────────────────────────
	// Icons for the schools themselves, on top of the county colours (owner,
	// 2026-09-10: "School should be the top one, show school icons on map and
	// their coverage area"). Their COVERAGE AREAS are not drawn: the
	// `attendance_zones` table has never been seeded, and a district outline is
	// a different claim than a zone — see `lib/schools/school-pins.ts`.
	//
	// Only under the Schools lens. A pin per school is a lot of ink, and it is
	// an answer to a question the buyer asks with the chip; without the chip it
	// is clutter over a map whose job is finding a home.
	const { schools: schoolData } = useSchools();
	const schoolPins = useMemo(
		() =>
			lensId === "schools" ? visibleSchools(schoolData.schools, region) : [],
		[lensId, schoolData.schools, region],
	);
	/** The schools lens's own ramp. The pins share the ramp with the county
	 *  fill but NOT its scale — see `PROFICIENCY_BANDS`, which is why the
	 *  legend prints two rows rather than one. */
	const schoolRamp = lensById("schools")?.ramp;
	/** Names go on the pins only when they fit. See `shouldLabel`. */
	const schoolsLabelled = shouldLabel(schoolPins.length);
	/** The second legend row earns its space only when pins are actually on the
	 *  map — under the schools lens zoomed out past 0.6 there are none, and a
	 *  key for absent ink is just more ink. */
	const showSchoolLegend = lensId === "schools" && schoolPins.length > 0;
	/** The two ends of the county fill, in the lens's own units — the thing the
	 *  owner could not read off the map (2026-09-11). */
	const legend = useMemo(
		() => (lens ? legendRange(lens, areaData.areas) : undefined),
		[lens, areaData.areas],
	);

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

	/**
	 * Open a community's explore page from a dot tap — the same destination the
	 * sheet rows push, reachable by TWO event paths on purpose. A dot's tap
	 * arrives either through its own `Marker.onPress` or through the map-level
	 * `onMarkerPress` (whose `identifier` names the community); on iOS both are
	 * driven by the same annotation selection and can BOTH fire for one tap,
	 * so the second arrival inside a beat is dropped rather than pushed as a
	 * second screen. Why two paths at all: the Marker-level callback is the
	 * one that kept silently not arriving for the small custom-view dots
	 * (owner, 2026-09-12 ×2 — "goes back to city view", then "should go to
	 * community explore page"), and the map-level event is delivered
	 * independently of the marker's own JS wiring.
	 */
	const lastCommunityNav = useRef(0);
	const openCommunity = (slug: string) => {
		const now = Date.now();
		if (now - lastCommunityNav.current < 800) return;
		lastCommunityNav.current = now;
		router.push(`/community/${slug}`);
	};

	/**
	 * The LAST wire for a dot tap: a bare map press, resolved to the nearest
	 * community by screen distance.
	 *
	 * On iOS the map's own recognizer (`AIRMapManager.m handleMapTap`) can
	 * fire for a tap a marker ALSO handled — phase277.3 assumed the two were
	 * exclusive and a home-pin tap promptly opened a community page on top of
	 * the listing (owner, 2026-09-12). So this handler first DISCLAIMS any
	 * press within reach of a pin that answers for itself — a home or a city,
	 * whose markers demonstrably receive their own taps — and only then
	 * claims the nearest community tile. A doubled COMMUNITY tap is already
	 * absorbed by `openCommunity`'s dedupe.
	 *
	 * Distance is measured in screen points via the current region's spans —
	 * the window is a close proxy for the map's own extent, and a few points
	 * of error inside a finger-sized radius does not change which mark is
	 * meant.
	 */
	const onMapPress = (e: MapPressEvent) => {
		if (!hits) return;
		const tap = e.nativeEvent.coordinate;
		const px = (lat: number, lng: number) => {
			const dx =
				(Math.abs(lng - tap.longitude) / region.longitudeDelta) * width;
			const dy = (Math.abs(lat - tap.latitude) / region.latitudeDelta) * height;
			return Math.hypot(dx, dy);
		};
		for (const l of hits.listings) {
			if (l.lat === undefined || l.lng === undefined) continue;
			if (px(l.lat, l.lng) <= PIN_TAP_RADIUS_PX) return;
		}
		for (const u of visibleUnits) {
			if (px(u.centroid.lat, u.centroid.lng) <= PIN_TAP_RADIUS_PX) return;
		}
		let best: { slug: string; d: number } | undefined;
		for (const c of hits.communities) {
			if (c.lat === undefined || c.lng === undefined) continue;
			const d = px(c.lat, c.lng);
			if (d <= DOT_TAP_RADIUS_PX && (!best || d < best.d)) {
				best = { slug: c.slug, d };
			}
		}
		if (best) openCommunity(best.slug);
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
		// Inside a drill the city draws NO pin of its own. It used to keep one,
		// and that pin sat dead-centre — exactly where the drill animation puts
		// the buyer's thumb — with a 44px frame that MapKit favours over the
		// small community dots around it. Its only answer to a tap was
		// `select(the same city)`, i.e. re-framing back out to the whole-city
		// view (owner, 2026-09-12: "clicking community dot… goes back to city
		// view"). The pill already names the level; the dots ARE the city.
		if (drillCity) return [];
		if (openArea) {
			return units.filter(
				(u) =>
					countyKeyForPoint(u.centroid.lat, u.centroid.lng, areaData.shapes) ===
					openArea,
			);
		}
		return units;
	}, [units, searching, drillCity, openArea, areaData.shapes]);

	const hits = search.result;

	/** Words (community names, home prices) appear only past a fixed zoom —
	 *  the owner's rule (2026-09-13: "no names until zoom in enough"), which
	 *  replaced a count-in-view gate. `MARK_LABEL_DELTA` is the school
	 *  layer's "a few streets" threshold, one good pinch past the drill
	 *  frame (0.18), so the two layers agree on what "close" means. */
	const marksLabelled = region.latitudeDelta <= MARK_LABEL_DELTA;

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

	/** The county's figure under the ACTIVE lens — the one the map is painted
	 *  with, so the pill and the colour under it agree. Absent with no lens on,
	 *  and then the pill is just a name and a way in. */
	const previewHit = openArea ? valueByKey.get(openArea) : undefined;
	const previewValue =
		previewHit && lens
			? `${lens.format(previewHit.value)}${previewHit.estimated ? "*" : ""}`
			: undefined;
	/** Either kind of question is out to the search endpoint. */
	const asking = searching || !!drillCity;
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
					initialRegion={METRO_REGION}
					onRegionChangeComplete={setRegion}
					// Two more wires for a community tap, both funnelled through
					// `openCommunity`'s dedupe: the marker-level event when the dot's
					// own recognizer catches the tap, and the bare map press when
					// only the map's does (see `onMapPress` — on iOS the two can
					// BOTH fire, and small custom markers often catch nothing).
					onMarkerPress={(e) => {
						const id = e.nativeEvent.id;
						if (id?.startsWith("community:")) {
							openCommunity(id.slice("community:".length));
						}
					}}
					onPress={onMapPress}
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
								// A county stops taking taps while results are on the map —
								// and on iOS that means handing it NO `onPress` at all.
								// `tappable` is a lie there: AIRMapManager's handleMapTap
								// fires every polygon whose ring contains the tap, gated
								// only on `if (polygon.onPress)` — the prop is never read.
								// phase268 set `tappable={!asking}` for this and the county
								// went on eating dot taps ("always go to county view",
								// owner 2026-09-12). The prop stays for Android, where it
								// IS honoured.
								tappable={!asking}
								onPress={asking ? undefined : () => selectArea(shape.key)}
							/>
						));
					})}
					{/* Schools, under the photo pins on purpose: a home or a
					    community is what the buyer came to tap, and a school is the
					    context around it. react-native-maps hit-tests in the order
					    overlays were added. */}
					{schoolRamp
						? schoolPins.map((pin) => (
								<SchoolMarker
									key={`sch-${pin.id}`}
									pin={pin}
									ramp={schoolRamp}
									labelled={schoolsLabelled}
								/>
							))
						: null}
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
					{/* MINI MARKS — the owner's final pick after trying tiles and
					    teardrops on the phone (2026-09-13: "Not good, show mini
					    marks, no names until zoom in enough"): a small green dot
					    for a community, a small amber house for a home, and the
					    words (name / price) only past `MARK_LABEL_DELTA`. The
					    lineage — boundary polygons, bare dots, photo tiles — is in
					    the DEVLOG. */}
					{hits?.communities.map((c) =>
						c.lat !== undefined && c.lng !== undefined ? (
							<CommunityMark
								key={`c-${c.id}`}
								identifier={`community:${c.slug}`}
								coordinate={{ latitude: c.lat, longitude: c.lng }}
								name={c.name}
								labelled={marksLabelled}
								onPress={() => openCommunity(c.slug)}
							/>
						) : null,
					)}
					{hits?.listings.map((l) =>
						l.lat !== undefined && l.lng !== undefined ? (
							<HomePin
								key={`l-${l.id}`}
								coordinate={{ latitude: l.lat, longitude: l.lng }}
								price={fullPrice(l.price)}
								name={l.address}
								labelled={marksLabelled}
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

				{/* What the colours MEAN. Absent until a lens is on, which is the
				    distinction from the legend phase265 removed: that one was a
				    permanent block of numerals over a surface that should be
				    photographs. This appears only in the moment the buyer asked a
				    question with a chip, and it sits directly under that chip so
				    the two read as one control (owner, 2026-09-11: "I don't know
				    the lens color meaning here, it is not very useful").

				    Two rows under the Schools lens, because there really are two
				    scales: the county fill is a quantile rank across the metro and
				    a pin is an absolute score. One ramp quietly meaning two things
				    is the confusion this is here to end, so it says so. */}
				{lens && legend && (
					<View style={[styles.legend, { top: insets.top + 100 }]}>
						<LegendRow
							label={showSchoolLegend ? "Counties" : lens.label}
							ramp={lens.ramp}
							low={legend.low}
							high={legend.high}
						/>
						{showSchoolLegend && schoolRamp ? (
							<LegendRow
								label="Schools"
								ramp={schoolRamp}
								low={PROFICIENCY_LEGEND.low}
								high={PROFICIENCY_LEGEND.high}
							/>
						) : null}
						<Text style={styles.legendUnit}>
							{/* The lens's own unit names the COUNTY figure ("district
							    average"), which stops being the whole truth the moment
							    the school row is under it. */}
							{showSchoolLegend ? "% proficient on state tests" : lens.unit}
						</Text>
					</View>
				)}

				{/* Where you are, floating ON the map instead of under it. A county
				    or a city used to raise the sheet, and a sheet holding one line
				    still reads as an empty panel (owner, 2026-09-10: "still see empty
				    sheet for county and city… need a different entry to see
				    details"). This is that different entry: a pill wide enough for
				    its own text, so the map runs underneath and around it.

				    A county's body opens `/area/[key]`. A CITY has no page to open —
				    there is no city-level record in this product, only the
				    communities grouped under its name — so its pill is the name and
				    the way back, and the communities themselves are on the map. */}
				{!searching && (drillCity || openedArea) && (
					<View style={[styles.contextBar, { bottom: insets.bottom + 16 }]}>
						<View style={styles.contextPill}>
							<Pressable onPress={goBack} hitSlop={12}>
								<Text style={styles.contextBack}>‹</Text>
							</Pressable>
							{drillCity ? (
								<Text style={styles.contextName} numberOfLines={1}>
									{drillCity.name}
								</Text>
							) : openedArea ? (
								<Pressable
									style={styles.contextBody}
									// With no lens on, the page picks its own default rather
									// than being handed the string "null".
									onPress={() =>
										router.push(
											lensId
												? `/area/${openedArea.key}?lens=${lensId}`
												: `/area/${openedArea.key}`,
										)
									}
								>
									<View style={styles.contextText}>
										<Text style={styles.contextName} numberOfLines={1}>
											{openedArea.name} County
										</Text>
										{/* Words, not numerals, and the only thing on 29
										    identical outlines that says where the buyer already
										    stands. */}
										{savedNoteFor(openedArea.key) ? (
											<Text style={styles.contextSaved} numberOfLines={1}>
												{savedNoteFor(openedArea.key)}
											</Text>
										) : null}
									</View>
									{previewValue ? (
										<Text style={styles.contextValue}>{previewValue}</Text>
									) : null}
									<Text style={styles.contextChevron}>›</Text>
								</Pressable>
							) : null}
						</View>
					</View>
				)}
			</View>

			{/* The sheet is for TYPED search only — a list you asked for in words.
			    Every map interaction answers on the map itself. */}
			{searching && (
				<View
					style={[
						styles.sheet,
						{ height: sheetH, paddingBottom: insets.bottom },
					]}
				>
					<Pressable
						style={styles.grabberArea}
						onPress={() => setExpanded((v) => !v)}
					>
						<View style={styles.grabber} />
					</Pressable>
					<Text style={styles.sheetTitle} numberOfLines={1}>
						{`"${query.trim()}"`}
						{poolLoading || search.loading ? "" : ` · ${hitCount}`}
					</Text>
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

							{units.length > 0 && <Text style={styles.groupTitle}>Areas</Text>}
							{units.map((u) => (
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
			)}
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
/**
 * One row of the legend: a name, the five ramp steps, and what each end means.
 *
 * The swatches are the lens's own `ramp` array in order, so this cannot drift
 * from the fill it describes — there is no second copy of the colours here.
 */
function LegendRow({
	label,
	ramp,
	low,
	high,
}: {
	label: string;
	ramp: readonly [string, string, string, string, string];
	low: string;
	high: string;
}) {
	return (
		<View style={styles.legendRow}>
			<Text style={styles.legendLabel} numberOfLines={1}>
				{label}
			</Text>
			<Text style={styles.legendEnd}>{low}</Text>
			<View style={styles.legendRamp}>
				{ramp.map((c) => (
					<View key={c} style={[styles.legendSwatch, { backgroundColor: c }]} />
				))}
			</View>
			<Text style={styles.legendEnd}>{high}</Text>
		</View>
	);
}

/**
 * One school: a dot coloured by how the state scored it, with its name beside
 * it when the names fit.
 *
 * **The dot carried an H / M / E initial until phase275** and the owner read it
 * as noise (2026-09-11: "school show names instead of H, M, E"). He was right
 * in a way worth writing down: the letter was a code that needed a legend to
 * decode, sitting on a map that had no legend at all, encoding the one fact a
 * buyer could already infer from the zoom. The name is the thing he was
 * looking for and it needs no key.
 *
 * Names appear only when `shouldLabel` says the count fits — past two dozen
 * they stack on each other and the layer becomes less legible than the dots
 * alone, so the dot is the fallback rather than the default.
 *
 * Unlike `PhotoMarker` this takes a title and description, because a school is
 * the only pin on this map with nothing to open — there is no school page in
 * the product. A tap has to answer in place, so it draws the platform callout
 * with the full name and the score. The label is the short name; the callout
 * is the whole one.
 *
 * `tracksViewChanges={false}` is load-bearing, not a micro-optimisation. A
 * react-native-maps marker with a custom child re-rasterises that child on
 * every frame by default; at a hundred pins that is the difference between a
 * map that pans and one that does not. The content is fixed at mount.
 *
 * A school with no published score is deliberately grey rather than dropped or
 * given a middling colour. GA suppresses cells with too few tested students,
 * and a new school has no scores at all; both are "we don't know", which is a
 * different thing from "average".
 */
/**
 * The pin's geometry, in one place because the ANCHOR is derived from it.
 *
 * A labelled pin is a row — dot, gap, name — and react-native-maps places a
 * custom marker by a fraction of the child's own size. So the fraction that
 * puts the DOT on the school's coordinate depends on how wide the whole row
 * is, and if the row is sized by its text then every pin gets a different
 * offset: a short name would sit a few points east of its school and a long
 * one a few points west. Small, silent, and wrong in a different direction per
 * pin, which is the worst kind.
 *
 * So the label area is a FIXED width and the anchor is computed from it. The
 * name's own background only wraps the glyphs, so a short name still looks
 * short — the fixed width is layout, not decoration.
 */
const SCHOOL_DOT = 12;
const SCHOOL_GAP = 4;
const SCHOOL_LABEL_W = 96;
const SCHOOL_ROW_W = SCHOOL_DOT + SCHOOL_GAP + SCHOOL_LABEL_W;
const SCHOOL_ANCHOR_LABELLED = { x: SCHOOL_DOT / 2 / SCHOOL_ROW_W, y: 0.5 };
const SCHOOL_ANCHOR_BARE = { x: 0.5, y: 0.5 };

function SchoolMarker({
	pin,
	ramp,
	labelled,
}: {
	pin: SchoolPin;
	ramp: readonly [string, string, string, string, string];
	labelled: boolean;
}) {
	const step = proficiencyStep(pin.proficiencyPct);
	const fill = step === undefined ? colors.ink3 : (ramp[step] ?? colors.ink3);
	return (
		<Marker
			coordinate={{ latitude: pin.lat, longitude: pin.lng }}
			title={pin.name}
			description={schoolNote(pin)}
			// Anchored on the DOT, not on the middle of the row: the dot is what
			// sits at the school's coordinate, and the name hangs off it.
			anchor={labelled ? SCHOOL_ANCHOR_LABELLED : SCHOOL_ANCHOR_BARE}
			tracksViewChanges={false}
		>
			<View style={labelled ? styles.schoolRow : styles.schoolWrap}>
				<View style={[styles.schoolDot, { backgroundColor: fill }]} />
				{labelled ? (
					<View style={styles.schoolLabelBox}>
						<Text style={styles.schoolName} numberOfLines={1}>
							{shortSchoolName(pin.name)}
						</Text>
					</View>
				) : null}
			</View>
		</Marker>
	);
}

function CommunityMark({
	coordinate,
	identifier,
	name,
	labelled,
	onPress,
}: {
	coordinate: LatLng;
	identifier: string;
	name: string;
	labelled: boolean;
	onPress: () => void;
}) {
	return (
		// Plain Marker, no `anchor`, no `tracksViewChanges` override, column
		// layout — the construction whose taps provably land in this app;
		// phases 277.1-277.3 each learned that the hard way. The `identifier`
		// feeds the map-level `onMarkerPress` fallback — see `openCommunity`.
		<Marker coordinate={coordinate} identifier={identifier} onPress={onPress}>
			<View style={styles.markWrap} accessibilityLabel={name}>
				{/* The pad is the real tap target — transparent, finger-sized. */}
				<View style={styles.markPad}>
					<View style={styles.communityDot} />
				</View>
				{/* The label slot is ALWAYS in the layout so the mark sits at the
				    same offset whether or not its words are shown — they come and
				    go with zoom, and the marks must not hop when they do. */}
				<View style={styles.markLabelBox}>
					{labelled ? (
						<Text style={styles.communityName} numberOfLines={1}>
							{name}
						</Text>
					) : null}
				</View>
			</View>
		</Marker>
	);
}

function HomePin({
	coordinate,
	price,
	name,
	labelled,
	onPress,
}: {
	coordinate: LatLng;
	price?: string;
	name: string;
	labelled: boolean;
	onPress: () => void;
}) {
	return (
		<Marker coordinate={coordinate} onPress={onPress}>
			<View style={styles.markWrap} accessibilityLabel={name}>
				<View style={styles.markPad}>
					{/* A little amber house — roof triangle over a body, two plain
					    Views, no SVG dependency. */}
					<View style={styles.homeMark}>
						<View style={styles.homeRoof} />
						<View style={styles.homeBody} />
					</View>
				</View>
				<View style={styles.markLabelBox}>
					{labelled && price ? (
						<Text style={styles.homePrice} numberOfLines={1}>
							{price}
						</Text>
					) : null}
				</View>
			</View>
		</Marker>
	);
}

/** The CITY pin. Homes moved to `HomePin` (2026-09-13), which took the
 *  price label with them — this is a photo circle and nothing else now. */
function PhotoMarker({
	coordinate,
	photoUrl,
	ring,
	selected,
	name,
	onPress,
}: {
	coordinate: LatLng;
	photoUrl?: string;
	ring: string;
	selected?: boolean;
	name: string;
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
			</View>
		</Marker>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	// ── School pins ───────────────────────────────────────────────────────────
	// A dot and its name. The dot is small on purpose — it sits UNDER the photo
	// pins in importance and there can be dozens — and the name carries the
	// meaning the H/M/E initial never did.
	schoolWrap: { flexDirection: "row", alignItems: "center" },
	// Fixed width, so the anchor fraction above is exact for every pin.
	schoolRow: {
		flexDirection: "row",
		alignItems: "center",
		width: SCHOOL_ROW_W,
		gap: SCHOOL_GAP,
	},
	schoolLabelBox: { width: SCHOOL_LABEL_W, alignItems: "flex-start" },
	schoolDot: {
		width: SCHOOL_DOT,
		height: SCHOOL_DOT,
		borderRadius: SCHOOL_DOT / 2,
		borderWidth: 1.5,
		borderColor: colors.surface,
	},
	schoolName: {
		...textStyles.caption,
		fontSize: 11,
		fontWeight: "600",
		color: colors.ink,
		// A wash behind the text, not a chip: a hard-edged box per school reads
		// as a hundred buttons. This lets the map through while keeping the
		// name legible over a photograph or a filled county.
		backgroundColor: withAlpha(colors.surface, 0.82),
		borderRadius: 4,
		paddingHorizontal: 3,
		paddingVertical: 1,
		overflow: "hidden",
	},
	// ── Mini marks: community dots & home houses ──────────────────────────────
	// The owner's pick after seeing tiles and teardrops on the phone
	// (2026-09-13): small solid marks in the layer colours, words only past
	// `MARK_LABEL_DELTA`. Shared anatomy — pad, mark, reserved label slot.
	markWrap: { alignItems: "center" },
	// Finger-sized and transparent — the tap target around a small mark.
	markPad: {
		width: 32,
		height: 32,
		alignItems: "center",
		justifyContent: "center",
	},
	// Reserved whether or not the words are drawn — see note in the marker.
	markLabelBox: {
		height: 18,
		maxWidth: 128,
		alignItems: "center",
		marginTop: -2,
	},
	communityDot: {
		width: 18,
		height: 18,
		borderRadius: 9,
		backgroundColor: colors.pos,
		borderWidth: 2,
		borderColor: colors.surface,
		shadowColor: "#000",
		shadowOpacity: 0.25,
		shadowRadius: 2,
		shadowOffset: { width: 0, height: 1 },
	},
	communityName: {
		...textStyles.caption,
		fontSize: 12,
		fontWeight: "600",
		color: colors.ink,
		// The same wash as a school name, for the same reason: a hard-edged
		// chip per community reads as a hundred buttons.
		backgroundColor: withAlpha(colors.surface, 0.82),
		borderRadius: 4,
		paddingHorizontal: 4,
		paddingVertical: 1,
		overflow: "hidden",
	},
	// The house: a roof triangle over a body, both in the home amber. The
	// roof overhangs the body a touch, which is what makes it read "house"
	// at 20px instead of "arrow".
	homeMark: { alignItems: "center" },
	homeRoof: {
		width: 0,
		height: 0,
		borderLeftWidth: 10,
		borderRightWidth: 10,
		borderBottomWidth: 9,
		borderLeftColor: "transparent",
		borderRightColor: "transparent",
		borderBottomColor: colors.accent,
	},
	homeBody: {
		width: 14,
		height: 9,
		backgroundColor: colors.accent,
		borderBottomLeftRadius: 2,
		borderBottomRightRadius: 2,
	},
	homePrice: {
		...textStyles.caption,
		fontSize: 12,
		fontWeight: "700",
		color: colors.ink,
		backgroundColor: withAlpha(colors.surface, 0.82),
		borderRadius: 4,
		paddingHorizontal: 4,
		paddingVertical: 1,
		overflow: "hidden",
	},
	// ── Legend ────────────────────────────────────────────────────────────────
	legend: {
		position: "absolute",
		left: 16,
		backgroundColor: colors.glass,
		borderRadius: radii.tile,
		paddingHorizontal: 10,
		paddingVertical: 8,
		gap: 5,
		shadowColor: "#000",
		shadowOpacity: 0.08,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 2 },
	},
	legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	legendLabel: {
		...textStyles.caption,
		fontSize: 11,
		fontWeight: "700",
		color: colors.ink,
		minWidth: 62,
	},
	legendEnd: { ...textStyles.caption, fontSize: 10, color: colors.ink2 },
	legendRamp: { flexDirection: "row", borderRadius: 2, overflow: "hidden" },
	legendSwatch: { width: 15, height: 8 },
	legendUnit: { ...textStyles.caption, fontSize: 10, color: colors.ink3 },
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
	// ── Context pill (floats ON the map) ──────────────────────────────────────
	contextBar: { position: "absolute", left: 0, right: 0, alignItems: "center" },
	contextPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		maxWidth: "92%",
		backgroundColor: colors.glass,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radii.pill,
		paddingLeft: 12,
		paddingRight: 14,
		paddingVertical: 9,
		shadowColor: "#000",
		shadowOpacity: 0.1,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 2 },
	},
	contextBody: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexShrink: 1,
	},
	contextBack: { ...textStyles.title2, color: colors.accent, marginTop: -3 },
	contextText: { flexShrink: 1 },
	contextName: { ...textStyles.headline, color: colors.ink },
	contextSaved: { ...textStyles.caption, color: colors.accent, marginTop: 1 },
	contextValue: { ...textStyles.headline, color: colors.ink2 },
	contextChevron: { ...textStyles.headline, color: colors.accent },
});
