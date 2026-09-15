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
 * ── Zoom bands, no drill (phase281) ────────────────────────────────────────
 * The drill model (phase265's county → city → community) is gone by owner
 * decision (2026-09-13: "No need to have county and city levels in map…
 * don't zoom in that once clicked. The only things are community and homes
 * and schools… all based on zoomin scale"). The map is now a plain map: the
 * BUYER moves it, and what it shows depends only on how close they are.
 *
 *   metro  (Δlat > 0.30)  county lines + names, lens fills. County tap →
 *                         info pill (no re-frame). Nothing else drawn.
 *   city   (≤ 0.30)       + city name labels, community photo dots. Content comes
 *                         from `/api/mobile/map` — the viewport query,
 *                         re-asked when a pan/zoom settles (`useMapContent`).
 *   homes  (≤ 0.12)       + the homes, each AS its price chip — no icon
 *                         (owner: "Don't show house shape, just the
 *                         numbers").
 *   street (≤ 0.06)       + community names and schools — the schools in a
 *                         neutral colour unless the Schools lens is on.
 *
 * ── Community boundaries are not drawn here, and that is now a rule ─────────
 * They have been tried twice and rejected twice for the same reason, in the
 * owner's own words: "all communities have different shapes, not consistent"
 * (2026-09-12, as a city-wide layer) and "it is ugly and unorganized"
 * (2026-09-14, as a street-zoom layer under the dots). The data is real; the
 * SET of shapes is not uniform enough to read as a layer at any zoom — some
 * are surveyed subdivisions, some are Nextdoor blobs, and their sizes differ
 * by an order of magnitude. A community's own shape belongs on its page,
 * where it is one figure with a frame around it. Don't re-add it here
 * without a third instruction that says so in as many words.
 *
 * County and city are geography, not controls: their names are labels, a
 * city tap does nothing, a county tap only at metro zoom and only a pill.
 * City boundaries stay undrawn — there is still no city polygon in the
 * product (TIGER Places deferred again, owner 2026-09-13: "先不用").
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import MapView, {
	type LatLng,
	type MapPressEvent,
	Marker,
	Polygon,
} from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAreas } from "../../hooks/use-areas";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { useMapContent } from "../../hooks/use-map-content";
import { useSchools } from "../../hooks/use-schools";
import { MIN_QUERY_LEN, useSearch } from "../../hooks/use-search";
import { familiarityFor } from "../../lib/area-familiarity";
import { areasByKey } from "../../lib/areas/areas-dto";
import { savedCitiesByCounty, savedCityNote } from "../../lib/areas/locate";
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

/** How close (screen points) a tap must land to a mark for `claimTap` to
 *  open it. Generous on purpose: it has to cover the whole 26pt photo dot
 *  AND the name under it, because a buyer aims at the name as readily as
 *  at the picture. Two marks this close to each other are separated by
 *  nearest-wins, not by the radius. */
const MARK_TAP_RADIUS_PX = 36;

/** The zoom bands (see the header). Each is a `latitudeDelta` ceiling:
 *  CITY turns the viewport feed and the community dots on, HOME adds the
 *  house marks, and `MARK_LABEL_DELTA` — kept from phase277.9, and aligned
 *  with the school layer's finest `levelsForZoom` step — puts the words on
 *  and the schools out. */
const CITY_DELTA = 0.3;
const HOME_DELTA = 0.12;
const MARK_LABEL_DELTA = 0.06;

/** The metro at rest — the map's opening frame, and where "back" returns to. */
const METRO_REGION = {
	latitude: 33.749,
	longitude: -84.388,
	latitudeDelta: 0.55,
	longitudeDelta: 0.45,
};

/** "$525K" / "$1.2M" — compact again (owner, 2026-09-13, after seeing the
 *  full digits on the phone: "use k, m for numbers for homes"). The chip IS
 *  the home now, so it is read at a glance and at a glance six digits are
 *  a wall; "$1.2M" is the number a buyer actually says out loud. */
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

	const searching = query.trim().length >= MIN_QUERY_LEN;
	// The search endpoint answers TYPED questions only — browsing is the
	// viewport feed (`useMapContent` below), not a hidden query.
	const search = useSearch(searching ? query : "");

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
	/** What the map is currently showing — the whole tab keys off it now:
	 *  the zoom bands, the viewport feed, the school layer, the labels. Only
	 *  `onRegionChangeComplete` writes it, which fires when a gesture ENDS,
	 *  not through the pan, so this is a handful of renders and not a stream
	 *  of them. */
	const [region, setRegion] = useState<MapRegion>(METRO_REGION);

	// ── The zoom bands ────────────────────────────────────────────────────────
	/** Past the city band the map has CONTENT — dots, and the viewport feed
	 *  that supplies them. Before it, counties are the subject. */
	const cityBand = region.latitudeDelta <= CITY_DELTA;
	const homesBand = region.latitudeDelta <= HOME_DELTA;
	/** Words (community names, home prices) appear only past a fixed zoom —
	 *  the owner's rule (2026-09-13: "no names until zoom in enough"). The
	 *  street band also brings the schools out. */
	const marksLabelled = region.latitudeDelta <= MARK_LABEL_DELTA;

	/** The browse feed: whatever is inside the visible box, re-asked when a
	 *  pan or zoom settles. Kept (not cleared) while zoomed out — the bands
	 *  hide the marks anyway. */
	const mapContent = useMapContent(region, cityBand);

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
	// Under the Schools lens at any zoom, and at STREET zoom always (owner,
	// 2026-09-13: schools are core map content, by zoom like everything
	// else). Without the lens the pins are the NEUTRAL colour — the ramp is
	// the lens's answer, and painting scores without its legend up would be
	// a claim with no key.
	const { schools: schoolData } = useSchools();
	const schoolsOn = lensId === "schools" || marksLabelled;
	const schoolPins = useMemo(
		() => (schoolsOn ? visibleSchools(schoolData.schools, region) : []),
		[schoolsOn, schoolData.schools, region],
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

	/** A county tap opens its pill and NOTHING moves — the owner's rule
	 *  (2026-09-13): a tap must never re-frame the map. The pill is kept by
	 *  his explicit "保留"; the way deeper is the buyer's own pinch. */
	const selectArea = (key: string) => {
		setOpenArea(key);
		setExpanded(false);
	};

	/** Fly to a city — a SEARCH answer (sheet row tap, `focus` deep link),
	 *  never a map tap. Lands inside the city band, where the viewport feed
	 *  takes over and the communities are simply there. */
	const flyTo = (u: GeoUnit) => {
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
	/**
	 * One door out of this screen, for every mark and every tap path.
	 *
	 * The window swallows a second arrival because one tap can reach JS on
	 * several wires at once — a marker's own `onPress`, the map-level
	 * `onMarkerPress`, a hit polygon, and the gesture-handler tap all funnel
	 * here, and on iOS more than one of them can fire for the same finger.
	 */
	/**
	 * The MAP's own size in points, measured — not the window's.
	 *
	 * `region.latitudeDelta` is the span of the MAP VIEW, so converting a
	 * coordinate difference into screen points has to divide by the map's
	 * height. `claimTap` divided by the WINDOW height instead, and the map
	 * is shorter than the window by the tab bar (~83pt of 844, an 11%
	 * overestimate of every vertical distance) and by the sheet when a
	 * search is open (down to ~280pt, a 3× overestimate). An 11% error is
	 * invisible in the middle of a mark and decisive at its edge: a tap 33pt
	 * from a community computed as 36.6pt and fell outside the 36pt radius.
	 * Horizontal distances were always right — the map is full width — which
	 * is why the failures looked arbitrary rather than uniform, and why a
	 * row of marks could read as "隔一个可以点一个" (owner, 2026-09-14).
	 */
	const [mapSize, setMapSize] = useState({ w: width, h: height });

	const lastNav = useRef(0);
	const navigateTo = (path: string) => {
		const now = Date.now();
		if (now - lastNav.current < 800) return;
		lastNav.current = now;
		router.push(path);
	};
	const openCommunity = (slug: string) => navigateTo(`/community/${slug}`);

	/**
	 * Resolve a tap on the map to the mark nearest it, and OPEN that mark.
	 *
	 * It decides between kinds rather than deferring to them. Until now it
	 * only ever opened communities and *yielded* when a home chip was
	 * closer, on the assumption that the home's own `Marker.onPress` would
	 * take it from there. On the owner's device that assumption is false —
	 * marker presses are exactly what keeps missing — so a community with a
	 * home beside it was permanently dead: the resolver stepped aside and
	 * nothing else ever answered (owner, 2026-09-14: "有些可以点 有些不能,
	 * 比如 Echo Woods"). One resolver, one decision, one navigation.
	 *
	 * Distance is in SCREEN points via the current region's spans, and it is
	 * measured to where each mark is DRAWN, not to its raw coordinate: a
	 * community's photo dot is anchored on its point (see
	 * `COMMUNITY_ANCHOR`), so the two now agree. They did not before, which
	 * is the other half of his report — the dot was drawn ~15pt above the
	 * coordinate this compared against, so a tap that landed high on the
	 * photo fell outside the radius and did nothing, and re-aiming after a
	 * zoom flipped a mark between working and not.
	 */
	const claimTap = (tap: LatLng | undefined, fallbackSlug?: string) => {
		if (!shown || !(searching || cityBand)) return;
		if (!tap) {
			// Apple Maps always sends the coordinate; this is the Google-Maps-
			// on-iOS shape, where a polygon press names only its own id. Then
			// the polygon that fired IS the answer.
			if (fallbackSlug) openCommunity(fallbackSlug);
			return;
		}
		const px = (lat: number, lng: number) => {
			const dx =
				(Math.abs(lng - tap.longitude) / region.longitudeDelta) * mapSize.w;
			const dy =
				(Math.abs(lat - tap.latitude) / region.latitudeDelta) * mapSize.h;
			return Math.hypot(dx, dy);
		};
		let best: { path: string; d: number } | undefined;
		const consider = (path: string, d: number, within: number) => {
			if (d <= within && (!best || d < best.d)) best = { path, d };
		};
		for (const c of shown.communities) {
			if (c.lat === undefined || c.lng === undefined) continue;
			consider(`/community/${c.slug}`, px(c.lat, c.lng), MARK_TAP_RADIUS_PX);
		}
		if (searching || homesBand) {
			for (const l of shown.listings) {
				if (l.lat === undefined || l.lng === undefined) continue;
				consider(`/listing/${l.id}`, px(l.lat, l.lng), MARK_TAP_RADIUS_PX);
			}
		}
		if (best) navigateTo(best.path);
	};

	const onMapPress = (e: MapPressEvent) => claimTap(e.nativeEvent.coordinate);

	/**
	 * Finger-sized in DEGREES — the half-width of a community's invisible hit
	 * polygon, recomputed per zoom so the target stays the same size on the
	 * glass as the map scales. Geographic overlays are the only tap delivery
	 * iOS has never dropped for us (phase284 proved it with the visible
	 * boundary; removing that boundary in phase288 took the taps with it),
	 * and an overlay must be sized in geography.
	 */
	const hitLatDeg = (region.latitudeDelta * MARK_TAP_RADIUS_PX) / mapSize.h;
	const hitLngDeg = (region.longitudeDelta * MARK_TAP_RADIUS_PX) / mapSize.w;

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
		flyTo(unit);
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

	/** City NAME LABELS, not pins: in-view cities, drawn in the city band and
	 *  put away at street zoom where the marks' own words take over. A city
	 *  is geography here — the label takes no tap. */
	const cityLabels = useMemo(() => {
		if (!cityBand || marksLabelled) return [];
		const latPad = (region.latitudeDelta / 2) * 1.1;
		const lngPad = (region.longitudeDelta / 2) * 1.1;
		return pool.geoUnits.filter(
			(u) =>
				Math.abs(u.centroid.lat - region.latitude) <= latPad &&
				Math.abs(u.centroid.lng - region.longitude) <= lngPad,
		);
	}, [cityBand, marksLabelled, region, pool.geoUnits]);

	const hits = search.result;

	/** What the marks draw from: a typed question shows what IT found, and
	 *  browsing shows the viewport feed. */
	const shown = searching ? hits : mapContent.result;

	/**
	 * The tap path that does not go through react-native-maps at all.
	 *
	 * Six reports across three days (2026-09-12 ×3, 2026-09-13, 2026-09-14
	 * ×2) say a community will not open by tap, and every fix so far has
	 * used one of the library's own channels — `Marker.onPress`, the
	 * map-level `onMarkerPress`, the bare `onPress`, and finally a
	 * transparent hit polygon. Whatever the reason each of those misses on
	 * his device, the answer is to stop depending on them: react-native-
	 * gesture-handler is already in this app (it wraps the whole router at
	 * `app/_layout.tsx`), it is RN's own touch system rather than MapKit's,
	 * and a Tap gesture yields to pan and pinch by construction — it only
	 * fires when the finger lands and lifts without travelling, which is
	 * exactly the event we want and never the ones the map needs.
	 *
	 * `coordinateForPoint` turns the tap's position in the map's own view
	 * into a coordinate, and from there it is the same `claimTap` every
	 * other path uses, dedupe and home-yield included.
	 */
	// Deliberately NOT memoised: `claimTap` closes over `shown` and `region`,
	// so a memo would have to list them and a missed dep would resolve a tap
	// against an older frame's marks — a silent wrong answer, and this
	// surface has had enough of those. The map re-renders only when a gesture
	// settles or state changes, so rebuilding one gesture object costs
	// nothing worth the risk.
	const tapGesture = Gesture.Tap()
		// On the JS thread: the handler reads React state and calls the
		// router, none of which is worklet-safe.
		.runOnJS(true)
		.maxDuration(400)
		.onEnd((e) => {
			mapRef.current
				?.coordinateForPoint({ x: e.x, y: e.y })
				.then((coord) => claimTap(coord))
				.catch(() => {});
		});

	// A fresh TYPED result opens the sheet and fits the map to whatever has
	// a point — including matched cities' centroids, so a city-only match
	// still lands somewhere.
	// biome-ignore lint/correctness/useExhaustiveDependencies: fit once per result set, not on every city-list re-sort
	useEffect(() => {
		if (!hits || !searching) return;
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
	const sheetH = expanded ? Math.min(height * 0.55, 480) : 110;
	const hitCount = hits
		? hits.communities.length + hits.listings.length + units.length
		: units.length;

	return (
		<View style={styles.screen}>
			{/* Map body */}
			<View
				style={styles.mapWrap}
				onLayout={(e) =>
					setMapSize({
						w: e.nativeEvent.layout.width,
						h: e.nativeEvent.layout.height,
					})
				}
			>
				{/* The tap gesture wraps the MAP, not an overlay on top of it: an
				    overlay would take the touches the map needs for pan and
				    pinch. A Tap recognizer on the same view coexists with them —
				    it fails the moment the finger travels. See `tapGesture`. */}
				<GestureDetector gesture={tapGesture}>
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
													// A whisper once marks are on the map — typed hits
													// or any zoom past the city band — so they stay
													// readable over the colour.
													searching || cityBand
														? FILL_ALPHA_SEARCHING
														: FILL_ALPHA,
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
									// A county takes taps ONLY at metro zoom with no search up —
									// past the city band the marks own the surface. On iOS
									// "not tappable" means handing it NO `onPress` at all:
									// `tappable` is a lie there (AIRMapManager's handleMapTap
									// fires every polygon whose ring contains the tap, gated
									// only on `if (polygon.onPress)`) — phase277.3's lesson.
									// The prop stays for Android, where it IS honoured.
									tappable={!searching && !cityBand}
									onPress={
										!searching && !cityBand
											? () => selectArea(shape.key)
											: undefined
									}
								/>
							));
						})}
						{/* Schools, under the photo pins on purpose: a home or a
					    community is what the buyer came to tap, and a school is the
					    context around it. react-native-maps hit-tests in the order
					    overlays were added. */}
						{schoolPins.map((pin) => (
							<SchoolMarker
								key={`sch-${pin.id}`}
								pin={pin}
								// The ramp is the LENS's answer; at plain street zoom the
								// pins wear the neutral colour instead — a score without
								// its legend up would be a claim with no key.
								ramp={lensId === "schools" ? schoolRamp : undefined}
								labelled={schoolsLabelled}
								onPress={() =>
									claimTap({ latitude: pin.lat, longitude: pin.lng })
								}
							/>
						))}
						{/* County and city NAMES — geography, not controls. The county
					    names retire once the houses band starts (the map is about
					    its content by then) and the city labels once the marks put
					    their own words on. */}
						{!homesBand
							? areaData.shapes.map((shape) => (
									<Marker
										key={`cn-${shape.key}`}
										coordinate={{
											latitude: shape.centre[1],
											longitude: shape.centre[0],
										}}
										tracksViewChanges={false}
									>
										<Text style={styles.countyName}>{shape.name}</Text>
									</Marker>
								))
							: null}
						{cityLabels.map((u) => (
							<Marker
								key={`cl-${u.id}`}
								coordinate={{
									latitude: u.centroid.lat,
									longitude: u.centroid.lng,
								}}
								tracksViewChanges={false}
							>
								<Text style={styles.cityLabel}>{u.name}</Text>
							</Marker>
						))}
						{/* THE TAP SURFACE — one invisible, finger-sized square per
					    community, drawn nowhere and pressable everywhere.
					    Empirically this app has exactly one tap delivery that
					    never fails on iOS: `handleMapTap` walks `map.overlays` and
					    fires any polygon whose ring contains the point (see the
					    1.27.2 source reading in phase277.3). The three marker
					    wires — Marker.onPress, map-level onMarkerPress, and the
					    bare map press — all miss small custom views often enough
					    that the owner has reported dead community taps four
					    times; the only build where taps worked was the one with
					    boundary polygons under the dots, and removing those in
					    phase288 took the taps away again with them. So the
					    polygon stays and the PICTURE goes: no fill, no stroke,
					    sized in degrees from the current zoom so it is always
					    ~`MARK_TAP_RADIUS_PX` on the glass. Every path funnels
					    through `claimTap`, so a square overlapping a home still
					    yields to that home. */}
						{searching || cityBand
							? shown?.communities.map((c) =>
									c.lat !== undefined && c.lng !== undefined ? (
										<Polygon
											key={`hit-${c.id}`}
											coordinates={[
												{
													latitude: c.lat - hitLatDeg,
													longitude: c.lng - hitLngDeg,
												},
												{
													latitude: c.lat - hitLatDeg,
													longitude: c.lng + hitLngDeg,
												},
												{
													latitude: c.lat + hitLatDeg,
													longitude: c.lng + hitLngDeg,
												},
												{
													latitude: c.lat + hitLatDeg,
													longitude: c.lng - hitLngDeg,
												},
											]}
											fillColor="rgba(0,0,0,0)"
											strokeColor="rgba(0,0,0,0)"
											strokeWidth={0}
											tappable
											onPress={(e) =>
												claimTap(e.nativeEvent.coordinate, c.slug)
											}
										/>
									) : null,
								)
							: null}
						{/* MINI MARKS (owner, 2026-09-13): a community wears its cover
					    photo in a green ring from the city band, and a home IS its
					    amber price chip from the homes band ("Don't show house
					    shape, just the numbers", then "use k, m"). Community names
					    come on past `MARK_LABEL_DELTA`. A typed search shows its
					    hits at any zoom: a search must show what it found. */}
						{searching || cityBand
							? shown?.communities.map((c) =>
									c.lat !== undefined && c.lng !== undefined ? (
										<CommunityMark
											key={`c-${c.id}`}
											identifier={`community:${c.slug}`}
											coordinate={{ latitude: c.lat, longitude: c.lng }}
											name={c.name}
											{...(c.heroUrl ? { heroUrl: c.heroUrl } : {})}
											labelled={marksLabelled}
											onPress={() => openCommunity(c.slug)}
										/>
									) : null,
								)
							: null}
						{searching || homesBand
							? shown?.listings.map((l) =>
									l.lat !== undefined && l.lng !== undefined ? (
										<HomePin
											key={`l-${l.id}`}
											coordinate={{ latitude: l.lat, longitude: l.lng }}
											price={compactPrice(l.price)}
											name={l.address}
											// Through the shared door: `claimTap` can now open
											// a listing too, so this marker and the gesture tap
											// would otherwise push the same screen twice.
											onPress={() => navigateTo(`/listing/${l.id}`)}
										/>
									) : null,
								)
							: null}
					</MapView>
				</GestureDetector>

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

				{/* The county pill — kept by owner decision (2026-09-13, "保留").
				    A metro-zoom county tap opens it; it never moves the map. Its
				    body opens `/area/[key]`; the ‹ just puts it away. */}
				{!searching && openedArea && (
					<View style={[styles.contextBar, { bottom: insets.bottom + 16 }]}>
						<View style={styles.contextPill}>
							<Pressable onPress={() => setOpenArea(null)} hitSlop={12}>
								<Text style={styles.contextBack}>‹</Text>
							</Pressable>
							{openedArea ? (
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
							{search.error && (
								<View style={styles.stateBox}>
									<Text style={styles.empty}>Couldn’t reach search.</Text>
									<Pressable onPress={search.retry} style={styles.retryBtn}>
										<Text style={styles.retryLabel}>Try again</Text>
									</Pressable>
								</View>
							)}
							{!search.error && !hits && (
								<Text style={styles.empty}>Searching…</Text>
							)}
							{hits && hitCount === 0 && (
								<Text style={styles.empty}>
									No match — try a street, community, city or zip.
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
									style={styles.row}
									onPress={() => flyTo(u)}
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
	onPress,
}: {
	pin: SchoolPin;
	/** Absent at plain street zoom: no ramp, no claim — every dot wears the
	 *  neutral colour, and only the Schools lens paints the scores. */
	ramp?: readonly [string, string, string, string, string];
	labelled: boolean;
	/** A school has no page, so this is not navigation — it hands the tap
	 *  back to the map's resolver. See the note on the Marker below. */
	onPress: () => void;
}) {
	const step = ramp ? proficiencyStep(pin.proficiencyPct) : undefined;
	const fill = step === undefined ? colors.ink3 : (ramp?.[step] ?? colors.ink3);
	return (
		<Marker
			coordinate={{ latitude: pin.lat, longitude: pin.lng }}
			title={pin.name}
			description={schoolNote(pin)}
			// Anchored on the DOT, not on the middle of the row: the dot is what
			// sits at the school's coordinate, and the name hangs off it.
			anchor={labelled ? SCHOOL_ANCHOR_LABELLED : SCHOOL_ANCHOR_BARE}
			tracksViewChanges={false}
			// A school row is 112pt wide (dot + gap + a FIXED 96pt label slot)
			// and there can be 120 of them — at street zoom they blanket the
			// map in annotation views, and an annotation view swallows the
			// touch. That is the shape of "缩率状态很多可以点, zoomin后基本点
			// 不了" (owner, 2026-09-14): community taps stopped working at
			// exactly the band where schools appear. A school cannot navigate
			// anywhere, so instead of eating the tap it hands it back to
			// `claimTap` at its own coordinate — near enough to the finger to
			// resolve the same community the buyer was aiming at.
			onPress={onPress}
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

/**
 * The community mark's geometry, in one place because the ANCHOR is derived
 * from it — the same discipline `SchoolMarker` keeps, and for the same
 * reason: react-native-maps places a custom marker by a FRACTION of the
 * child's own size, so the fraction that puts the dot on the coordinate has
 * to be computed from the column's real height rather than guessed.
 */
const COMMUNITY_PAD = 36;
const COMMUNITY_LABEL_H = 30;
const COMMUNITY_LABEL_GAP = -1;
const COMMUNITY_COL_H = COMMUNITY_PAD + COMMUNITY_LABEL_GAP + COMMUNITY_LABEL_H;
const COMMUNITY_ANCHOR = { x: 0.5, y: COMMUNITY_PAD / 2 / COMMUNITY_COL_H };

/** A community is its own FACE — the cover photo in a green ring (owner,
 *  2026-09-13: "Use hero pic for communities, same circle size or little
 *  bit bigger"). The content gate (phase277.5) means every community the
 *  map draws has a cover; the initial is the fallback for a row from an
 *  older wire, not a common face. */
function CommunityMark({
	coordinate,
	identifier,
	name,
	heroUrl,
	labelled,
	onPress,
}: {
	coordinate: LatLng;
	identifier: string;
	name: string;
	heroUrl?: string;
	labelled: boolean;
	onPress: () => void;
}) {
	return (
		// `anchor` puts the DOT on the community's point. Without it the
		// whole column — pad plus the reserved label slot — is centred on the
		// coordinate, which drew the photo ~15pt north of the place it names
		// and, worse, 15pt away from what `claimTap` measures against: a tap
		// landing high on the photo fell outside the radius and did nothing
		// (owner, 2026-09-14). phase277.1 blamed `anchor` for lost taps and
		// removed it; that was the wrong culprit, and taps no longer come
		// through this marker anyway — the gesture handler owns them now.
		// Default view tracking stays: it is what lets the photo appear once
		// it loads.
		<Marker
			coordinate={coordinate}
			identifier={identifier}
			anchor={COMMUNITY_ANCHOR}
			onPress={onPress}
		>
			<View style={styles.markWrap} accessibilityLabel={name}>
				{/* The pad is the real tap target — transparent, finger-sized. */}
				<View style={styles.markPad}>
					<View style={styles.communityDot}>
						{heroUrl ? (
							<Image source={{ uri: heroUrl }} style={styles.communityPhoto} />
						) : (
							<Text style={styles.communityInitial}>
								{name.trim().charAt(0).toUpperCase()}
							</Text>
						)}
					</View>
				</View>
				{/* The label slot is ALWAYS in the layout so the mark sits at the
				    same offset whether or not its words are shown — they come and
				    go with zoom, and the marks must not hop when they do. */}
				<View style={styles.markLabelBox}>
					{labelled ? (
						// Two lines, not one: "Medlock Bridge Village" is a real
						// community name and no single line at a sane map width
						// holds it. Wrapping beats both truncation and a wider box.
						<Text style={styles.communityName} numberOfLines={2}>
							{name}
						</Text>
					) : null}
				</View>
			</View>
		</Marker>
	);
}

/** A home IS its price — an amber chip of digits, at every zoom the homes
 *  band shows. The house glyph is gone (owner, 2026-09-13: "Don't show
 *  house shape, just the numbers"); a priceless row wears a dash so it
 *  still exists and still opens. */
function HomePin({
	coordinate,
	price,
	name,
	onPress,
}: {
	coordinate: LatLng;
	price?: string;
	name: string;
	onPress: () => void;
}) {
	return (
		<Marker coordinate={coordinate} onPress={onPress}>
			<View style={styles.markWrap} accessibilityLabel={name}>
				<Text style={styles.homePriceSolo} numberOfLines={1}>
					{price ?? "—"}
				</Text>
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
	// Halo, not a wash — the same treatment the community names took in
	// phase287, and changed with them rather than after them: the two layers
	// are drawn at the SAME zoom, so one boxed and one haloed would just be
	// the next complaint.
	schoolName: {
		...textStyles.caption,
		fontSize: 10.5,
		fontWeight: "600",
		color: colors.ink2,
		textShadowColor: colors.surface,
		textShadowRadius: 3,
	},
	// ── Mini marks: community photo dots & home price chips ───────────────────
	// The owner's pick after seeing tiles and teardrops on the phone
	// (2026-09-13): small solid marks in the layer colours, words only past
	// `MARK_LABEL_DELTA`. Shared anatomy — pad, mark, reserved label slot.
	markWrap: { alignItems: "center" },
	// Finger-sized and transparent — the tap target around a small mark.
	markPad: {
		width: COMMUNITY_PAD,
		height: COMMUNITY_PAD,
		alignItems: "center",
		justifyContent: "center",
	},
	// Reserved whether or not the words are drawn — see note in the marker.
	// TWO lines' worth, reserved whether one is used or none: the marker has
	// no `anchor`, so iOS centres this whole column on the coordinate and a
	// label box that grew with its text would put each mark a different
	// distance from its own point — the silent per-pin error the school
	// pins' header warns about. Narrow on purpose: a name wraps rather than
	// widening into its neighbours, and wrapping is what ended the
	// truncation (owner, 2026-09-14: "a lot of truncated").
	markLabelBox: {
		height: COMMUNITY_LABEL_H,
		width: 108,
		alignItems: "center",
		marginTop: COMMUNITY_LABEL_GAP,
	},
	// The cover photo in a green ring, a step up from the 18px solid dot it
	// replaced (owner asked for "same size or little bit bigger"). The ring
	// is what still says "community" at a glance when the photos differ.
	communityDot: {
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: colors.surface2,
		borderWidth: 2,
		borderColor: colors.pos,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOpacity: 0.25,
		shadowRadius: 2,
		shadowOffset: { width: 0, height: 1 },
	},
	communityPhoto: { width: "100%", height: "100%" },
	communityInitial: {
		...textStyles.caption,
		fontSize: 12,
		fontWeight: "700",
		color: colors.pos,
	},
	// No box — the cartographer's answer, and the one the city labels on this
	// same map already use: ink type carrying a white halo, so the basemap
	// runs under the letters instead of behind a row of white tiles (owner,
	// 2026-09-14: "have white background doesn't look good"). Smaller than
	// the boxed version it replaces, because a halo needs no padding to stay
	// legible and the smaller face fits more of a name per line.
	communityName: {
		...textStyles.caption,
		fontSize: 11,
		lineHeight: 13,
		fontWeight: "700",
		textAlign: "center",
		color: colors.ink,
		textShadowColor: colors.surface,
		textShadowRadius: 3,
	},
	// The price IS the home's mark — a standalone chip in the home amber,
	// no icon (owner, 2026-09-13). Padded a step past the word chips so it
	// is a tap target, not just a label.
	homePriceSolo: {
		...textStyles.caption,
		fontSize: 12,
		fontWeight: "700",
		color: colors.surface,
		backgroundColor: colors.accent,
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 3,
		overflow: "hidden",
	},
	// ── Geography labels: county and city names, never controls ───────────────
	countyName: {
		...textStyles.caption,
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1.2,
		textTransform: "uppercase",
		color: withAlpha(colors.ink, 0.55),
	},
	cityLabel: {
		...textStyles.caption,
		fontSize: 12.5,
		fontWeight: "700",
		color: withAlpha(colors.ink, 0.78),
		textShadowColor: withAlpha(colors.surface, 0.8),
		textShadowRadius: 2,
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
	rowThumb: {
		width: 48,
		height: 48,
		borderRadius: radii.tile,
		backgroundColor: colors.surface2,
	},
	rowText: { flex: 1, gap: 2 },
	rowName: { ...textStyles.headline, color: colors.ink },
	rowSub: { ...textStyles.footnote, color: colors.ink2 },

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
