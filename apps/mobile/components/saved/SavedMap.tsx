/**
 * The Saved tab's map view (phase386): where the saves are, relative to each
 * other — the one thing the shelves, the grid and the list cannot show.
 *
 * A map above, a rail of the same saves below. Swiping the rail flies the map
 * to that save. Tapping a mark OPENS the save, as tapping its card does, and
 * brings its card up behind the page it opens.
 *
 * Until phase416 a mark only brought its card up, so with one save — its card
 * already up — a tap did nothing at all (owner, 2026-11-28: 「map里看到有视频的
 * 社区点击没有反应」). And the tap itself often never arrived: a marker's own
 * `onPress` is the wire `(tabs)/search.tsx` records failing on small custom
 * marks six times. So the tap is taken the way that screen takes it — a
 * gesture-handler Tap over the map, resolved to the nearest mark — with the
 * marker's `onPress` kept as a second wire into the same door.
 *
 * A save with no point (a community read from an API older than phase386)
 * keeps its card and simply has no mark.
 */
import { fmlsNumberLabel } from "@percho/shared/fmls";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Image,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import MapView, { Marker, type Region } from "react-native-maps";
import type { SavedTile } from "../../lib/saved/shelves";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { KIND_TAG, KindTag, type SavedViewProps } from "./SavedViews";

/** Metro Atlanta — what the map shows until the saves place it. */
const METRO_REGION = {
	latitude: 33.749,
	longitude: -84.388,
	latitudeDelta: 0.55,
	longitudeDelta: 0.45,
};

const CARD_W = 248;
const CARD_GAP = 10;
const RAIL_PAD = 20;
const FLY_MS = 450;
/** How near a mark a tap has to land, in points — the Search map's radius. */
const MARK_TAP_RADIUS = 36;
/** One tap can arrive on both wires; the second inside this is dropped. */
const TAP_DEDUPE_MS = 800;

const coordOf = (t: SavedTile) =>
	t.center ? { latitude: t.center.lat, longitude: t.center.lng } : null;

export function SavedMap(props: SavedViewProps) {
	const { tiles } = props;
	const mapRef = useRef<MapView>(null);
	const railRef = useRef<ScrollView>(null);
	const [mapReady, setMapReady] = useState(false);
	const [active, setActive] = useState<string | null>(tiles[0]?.id ?? null);
	/** What the map shows and how big it is: a tap is turned into a distance with both. */
	const [region, setRegion] = useState<Region>(METRO_REGION);
	const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
	const lastOpen = useRef(0);

	const marks = useMemo(
		() =>
			tiles.flatMap((t) => {
				const coordinate = coordOf(t);
				return coordinate ? [{ tile: t, coordinate }] : [];
			}),
		[tiles],
	);
	// Refit when the set of marks changes, not on every render of the same set.
	const marksKey = marks.map((m) => m.tile.id).join(",");

	// biome-ignore lint/correctness/useExhaustiveDependencies: `marksKey` stands in for `marks`
	useEffect(() => {
		// `fitToCoordinates` before the native map is ready is a silent no-op.
		if (!mapReady) return;
		const only = marks[0];
		if (!only) return;
		// One point would be fitted down to a rooftop.
		if (marks.length === 1) {
			mapRef.current?.animateToRegion(
				{ ...only.coordinate, latitudeDelta: 0.12, longitudeDelta: 0.1 },
				FLY_MS,
			);
			return;
		}
		mapRef.current?.fitToCoordinates(
			marks.map((m) => m.coordinate),
			{
				edgePadding: { top: 56, right: 48, bottom: 48, left: 48 },
				animated: true,
			},
		);
	}, [mapReady, marksKey]);

	/** Centre the map on a save without changing how far in it is. */
	const flyTo = (tile: SavedTile) => {
		const c = coordOf(tile);
		if (c) mapRef.current?.animateCamera({ center: c }, { duration: FLY_MS });
	};

	const onRailSettled = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const i = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP));
		const tile = tiles[Math.max(0, Math.min(tiles.length - 1, i))];
		if (!tile || tile.id === active) return;
		setActive(tile.id);
		flyTo(tile);
	};

	const onMark = (tile: SavedTile) => {
		setActive(tile.id);
		const i = tiles.findIndex((t) => t.id === tile.id);
		railRef.current?.scrollTo({ x: i * (CARD_W + CARD_GAP), animated: true });
	};

	/** A tap on a mark: its card comes up, and the save opens (or is picked). */
	const openMark = (tile: SavedTile) => {
		const locked =
			props.selecting &&
			props.lockedKind !== null &&
			props.lockedKind !== tile.kind;
		if (locked) return;
		const now = Date.now();
		if (now - lastOpen.current < TAP_DEDUPE_MS) return;
		lastOpen.current = now;
		onMark(tile);
		props.onPress(tile);
	};

	// Not memoised, for the reason the Search map gives: it closes over
	// `marks` and `region`, and a stale one resolves a tap against marks that
	// are no longer where it thinks.
	const tap = Gesture.Tap()
		// On the JS thread: it reads React state and opens a page.
		.runOnJS(true)
		.maxDuration(400)
		.onEnd((e) => {
			mapRef.current
				?.coordinateForPoint({ x: e.x, y: e.y })
				.then((at) => {
					if (mapSize.w === 0 || mapSize.h === 0) return;
					let best: { tile: SavedTile; d: number } | undefined;
					for (const { tile, coordinate } of marks) {
						const dx =
							((coordinate.longitude - at.longitude) / region.longitudeDelta) *
							mapSize.w;
						const dy =
							((coordinate.latitude - at.latitude) / region.latitudeDelta) *
							mapSize.h;
						const d = Math.hypot(dx, dy);
						if (d <= MARK_TAP_RADIUS && (!best || d < best.d)) {
							best = { tile, d };
						}
					}
					if (best) openMark(best.tile);
				})
				.catch(() => {});
		});

	return (
		<View style={styles.wrap}>
			<View
				style={styles.mapBox}
				onLayout={(e) =>
					setMapSize({
						w: e.nativeEvent.layout.width,
						h: e.nativeEvent.layout.height,
					})
				}
			>
				{/* The Tap wraps the MAP, not a view over it: an overlay would take
				    the touches the map needs for pan and pinch. */}
				<GestureDetector gesture={tap}>
					<MapView
						ref={mapRef}
						style={StyleSheet.absoluteFill}
						mapType="mutedStandard"
						showsPointsOfInterests={false}
						showsCompass={false}
						initialRegion={METRO_REGION}
						onMapReady={() => setMapReady(true)}
						onRegionChangeComplete={setRegion}
					>
						{marks.map(({ tile, coordinate }) => {
							const on = tile.id === active;
							const picked = props.picked.includes(tile.id);
							return (
								<Marker
									key={tile.id}
									coordinate={coordinate}
									anchor={{ x: 0.5, y: 0.5 }}
									// The save the rail is on is drawn over its neighbours.
									zIndex={on ? 2 : 1}
									onPress={() => openMark(tile)}
								>
									<View style={styles.markPad} accessibilityLabel={tile.title}>
										<View
											style={[
												styles.mark,
												on && styles.markOn,
												picked && styles.markPicked,
											]}
										>
											{tile.thumbUrl ? (
												<Image
													source={{ uri: tile.thumbUrl }}
													style={styles.markPhoto}
												/>
											) : (
												<Text style={styles.markInitial}>
													{tile.title.trim().charAt(0).toUpperCase()}
												</Text>
											)}
										</View>
									</View>
								</Marker>
							);
						})}
					</MapView>
				</GestureDetector>
			</View>

			<ScrollView
				ref={railRef}
				horizontal
				showsHorizontalScrollIndicator={false}
				snapToInterval={CARD_W + CARD_GAP}
				decelerationRate="fast"
				onMomentumScrollEnd={onRailSettled}
				contentContainerStyle={styles.rail}
				style={styles.railBox}
			>
				{tiles.map((t) => {
					const on = props.picked.includes(t.id);
					const dim =
						props.selecting &&
						props.lockedKind !== null &&
						props.lockedKind !== t.kind;
					return (
						<Pressable
							key={t.id}
							style={[
								styles.card,
								t.id === active && styles.cardActive,
								on && styles.cardPicked,
								dim && styles.dim,
							]}
							disabled={dim}
							onPress={() => {
								setActive(t.id);
								flyTo(t);
								props.onPress(t);
							}}
							accessibilityRole={props.selecting ? "checkbox" : "button"}
							accessibilityState={props.selecting ? { checked: on } : undefined}
							accessibilityLabel={`${KIND_TAG[t.kind]}, ${t.title}`}
						>
							{t.thumbUrl ? (
								<Image source={{ uri: t.thumbUrl }} style={styles.cardPh} />
							) : (
								<View style={styles.cardPh} />
							)}
							<View style={styles.cardBody}>
								<KindTag kind={t.kind} />
								<Text style={styles.cardTitle} numberOfLines={1}>
									{t.title}
								</Text>
								{!!t.sub && (
									<Text style={styles.cardSub} numberOfLines={1}>
										{t.sub}
									</Text>
								)}
								{!!t.fact && (
									<Text style={styles.cardFact} numberOfLines={2}>
										{t.fact}
									</Text>
								)}
								{!!fmlsNumberLabel(t.mlsNumber) && (
									<Text style={styles.cardSub} numberOfLines={1}>
										{fmlsNumberLabel(t.mlsNumber)}
									</Text>
								)}
							</View>
							{props.selecting && (
								<View style={[styles.tick, on && styles.tickOn]}>
									{on && <Text style={styles.tickMark}>✓</Text>}
								</View>
							)}
						</Pressable>
					);
				})}
			</ScrollView>
		</View>
	);
}

const MARK = 38;

const styles = StyleSheet.create({
	wrap: { flex: 1 },
	mapBox: {
		flex: 1,
		marginHorizontal: RAIL_PAD,
		borderRadius: radii.tile,
		overflow: "hidden",
		backgroundColor: colors.surface2,
	},
	// Finger-sized and transparent around the mark.
	markPad: {
		width: MARK + 12,
		height: MARK + 12,
		alignItems: "center",
		justifyContent: "center",
	},
	mark: {
		width: MARK - 8,
		height: MARK - 8,
		borderRadius: MARK / 2,
		backgroundColor: colors.surface2,
		borderWidth: 2,
		borderColor: colors.surface,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	markOn: {
		width: MARK,
		height: MARK,
		borderWidth: 3,
		borderColor: colors.ink,
	},
	markPicked: { borderColor: colors.accent },
	markPhoto: { width: "100%", height: "100%" },
	markInitial: { ...textStyles.headline, color: colors.ink2 },

	railBox: { flexGrow: 0, marginTop: 10 },
	rail: { gap: CARD_GAP, paddingHorizontal: RAIL_PAD },
	card: {
		width: CARD_W,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		padding: 8,
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: 1,
		borderColor: colors.border,
	},
	cardActive: { borderColor: colors.ink },
	cardPicked: { borderColor: colors.accent, borderWidth: 2 },
	cardPh: {
		width: 64,
		height: 64,
		borderRadius: 10,
		backgroundColor: colors.surface2,
	},
	cardBody: { flex: 1, gap: 1 },
	cardTitle: { ...textStyles.headline, color: colors.ink },
	cardSub: { ...textStyles.note, color: colors.ink2 },
	cardFact: { ...textStyles.note, fontWeight: "600", color: colors.ink },
	dim: { opacity: 0.34 },
	tick: {
		width: 24,
		height: 24,
		borderRadius: 12,
		borderWidth: 1.5,
		borderColor: colors.border,
		alignItems: "center",
		justifyContent: "center",
	},
	tickOn: { backgroundColor: colors.accent, borderColor: colors.accent },
	tickMark: { ...textStyles.caption, color: colors.surface },
});
