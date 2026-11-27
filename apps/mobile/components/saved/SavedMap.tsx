/**
 * The Saved tab's map view (phase386): where the saves are, relative to each
 * other — the one thing the shelves, the grid and the list cannot show.
 *
 * A map above, a rail of the same saves below. The RAIL is how a save is
 * opened or picked; swiping it flies the map to that save, and tapping a mark
 * brings its card up. Opening never depends on a tap landing on a small
 * marker — `(tabs)/search.tsx` records how unreliable that is.
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
import MapView, { Marker } from "react-native-maps";
import type { SavedTile } from "../../lib/saved/shelves";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { KIND_TAG, type SavedViewProps } from "./SavedViews";

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

const coordOf = (t: SavedTile) =>
	t.center ? { latitude: t.center.lat, longitude: t.center.lng } : null;

export function SavedMap(props: SavedViewProps) {
	const { tiles } = props;
	const mapRef = useRef<MapView>(null);
	const railRef = useRef<ScrollView>(null);
	const [mapReady, setMapReady] = useState(false);
	const [active, setActive] = useState<string | null>(tiles[0]?.id ?? null);

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

	return (
		<View style={styles.wrap}>
			<View style={styles.mapBox}>
				<MapView
					ref={mapRef}
					style={StyleSheet.absoluteFill}
					mapType="mutedStandard"
					showsPointsOfInterests={false}
					showsCompass={false}
					initialRegion={METRO_REGION}
					onMapReady={() => setMapReady(true)}
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
								onPress={() => onMark(tile)}
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
								<Text style={styles.cardTitle} numberOfLines={1}>
									{t.title}
								</Text>
								<Text style={styles.cardSub} numberOfLines={1}>
									{[KIND_TAG[t.kind], t.sub].filter(Boolean).join(" · ")}
								</Text>
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
