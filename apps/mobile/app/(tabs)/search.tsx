/**
 * Search tab (spec-v3 `04-search.md`) — map + collapsible list + journey layer.
 *
 * ── v1 scope vs §4.1 ────────────────────────────────────────────────────────
 * The spec's full version wants: 3-detent sheet, pin↔row two-way sync,
 * popularity sorting server-side, listing price pins at zoom ≥14. None of that
 * is shippable today because the live pool has no listing/community
 * coordinates (only city geo-unit centroids) and no popularity mat view. So
 * this is the honest subset, same contract, fewer rows:
 *
 *   · map renders CITY pins (§4.2 "zoom <12" aggregation rule is effectively
 *     always on — there is nothing to zoom into)
 *   · the sheet is a plain collapsible list (peek/half/full via a drag
 *     handle), listing the 109 city units the pool actually returns
 *   · city tap → fly to city + pin emphasis (no boundary polygon — no geojson
 *     source exists for cities yet)
 *   · row tap → keep the map focused on that city (city/zip "don't leave the
 *     surface" per §4.4); community/listing entities aren't reachable this
 *     pass
 *   · "Your journey" layer chip on → familiarity heatmap from the same
 *     `areaFamiliarity` source the You tab uses (05 §5.3), so the two faces
 *     cannot disagree
 *   · search box filters the CITY list client-side (the only entity class the
 *     pool has) — no backend round trip, no fake address/community search
 *
 * When coordinates for listings/communities exist, the pin layer + detents +
 * entity search land on top of this unchanged shape.
 *
 * ── No filter UI anywhere ───────────────────────────────────────────────────
 * The only narrowing affordances are the search box, the viewport, and the
 * layer chips (§4.1 铁律). There is no price/bed/bath picker on this screen.
 */
import { useMemo, useState } from "react";
import {
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
	useWindowDimensions,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { useFunnelStore } from "../../state/funnel";
import { useFeedSession } from "../../state/feed-session";
import { familiarityFor, unknownDimsLabel } from "../../lib/area-familiarity";
import type { GeoUnit } from "../../lib/feed/geo-unit";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const PEACH = "#FAF6F0";

/** Journey strip — 5-step funnel progress (§4.3). */
const STEPS = [
	{ n: 0, label: "Intent" },
	{ n: 1, label: "Area" },
	{ n: 2, label: "Zips" },
	{ n: 3, label: "Comm." },
	{ n: 4, label: "Homes" },
] as const;

export default function SearchTab() {
	const { height } = useWindowDimensions();
	const insets = useSafeAreaInsets();

	const stage = useFunnelStore((s) => s.stage);
	const signals = useFeedSession((s) => s.signals);
	const { pool, loading } = useFeedPool({
		stage,
		cities: [],
		likedCommunityIds: [],
		enabled: true,
	});

	const [query, setQuery] = useState("");
	const [journeyOn, setJourneyOn] = useState(false);
	// v1: the sheet is one expanded panel (half) or collapsed (peek).
	const [expanded, setExpanded] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const units = useMemo(() => {
		const q = query.trim().toLowerCase();
		const list = q ? pool.geoUnits.filter((u) => u.name.toLowerCase().includes(q)) : pool.geoUnits;
		// Familiar units float to the top so the journey layer is the
		// natural first read, matching the §4.3 "in your journey first" rule.
		return [...list].sort((a, b) => fam(b).score - fam(a).score);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pool.geoUnits, query, signals]);

	function fam(u: GeoUnit) {
		return familiarityFor(signals, u.id);
	}

	const sheetH = expanded ? Math.min(height * 0.55, 480) : 110;

	return (
		<View style={styles.screen}>
			{/* Map body */}
			<View style={styles.mapWrap}>
				<MapView
					style={StyleSheet.absoluteFill}
					mapType="mutedStandard"
					showsPointsOfInterest={false}
					showsCompass={false}
					initialRegion={{
						latitude: 33.749,
						longitude: -84.388,
						latitudeDelta: 0.55,
						longitudeDelta: 0.45,
					}}
				>
					{units.map((u) => (
						<Marker
							key={u.id}
							coordinate={{ latitude: u.centroid.lat, longitude: u.centroid.lng }}
							title={u.name}
							onPress={() => {
								setSelectedId(u.id);
								setExpanded(true);
							}}
							pinColor={selectedId === u.id ? colors.accent : journeyOn ? colors.pos : colors.ink2}
						/>
					))}
				</MapView>

				{/* Search pill (floats above map, §4.1 #1) */}
				<View style={[styles.searchPill, { top: insets.top + 8 }]}>
					<TextInput
						value={query}
						onChangeText={setQuery}
						placeholder="City, zip or community…"
						placeholderTextColor={colors.ink3}
						style={styles.searchInput}
						autoCorrect={false}
						autoCapitalize="words"
						returnKeyType="search"
					/>
					{query.length > 0 && (
						<Pressable onPress={() => setQuery("")} hitSlop={12}>
							<Text style={styles.searchClear}>×</Text>
						</Pressable>
					)}
				</View>

				{/* Layer chips (§4.1) */}
				<View style={[styles.chipRow, { top: insets.top + 56 }]}>
					<Pressable
						style={[styles.chip, styles.chipOn]}
						onPress={() => {}}
						disabled
					>
						<Text style={[styles.chipLabel, styles.chipLabelOn]}>For sale</Text>
					</Pressable>
					<Pressable
						style={[styles.chip, journeyOn && styles.chipOn]}
						onPress={() => setJourneyOn((v) => !v)}
					>
						<Text style={[styles.chipLabel, journeyOn && styles.chipLabelOn]}>
							Your journey
						</Text>
					</Pressable>
				</View>

				{/* Journey strip (§4.3) — shown when the layer is on */}
				{journeyOn && (
					<View style={[styles.journeyStrip, { top: insets.top + 100 }]}>
						<Text style={styles.journeyTitle}>Your search, so far</Text>
						<View style={styles.stepRow}>
							{STEPS.map((s) => {
								const done = stage > s.n;
								const current = stage === s.n;
								return (
									<View key={s.label} style={styles.stepItem}>
										<View
											style={[
												styles.stepDot,
												done && styles.stepDone,
												current && styles.stepCurrent,
											]}
										/>
										<Text
											style={[
												styles.stepLabel,
												(done || current) && styles.stepLabelOn,
											]}
										>
											{s.label}
										</Text>
									</View>
								);
							})}
						</View>
					</View>
				)}
			</View>

			{/* Collapsible list sheet */}
			<View style={[styles.sheet, { height: sheetH, paddingBottom: insets.bottom }]}>
				<Pressable
					style={styles.grabberArea}
					onPress={() => setExpanded((v) => !v)}
				>
					<View style={styles.grabber} />
				</Pressable>
				<Text style={styles.sheetTitle}>
					{query ? `"${query.trim()}"` : journeyOn ? "Your journey" : "All areas"}
					{loading ? "" : ` · ${units.length}`}
				</Text>
				{expanded && (
					<ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
						{units.length === 0 && (
							<Text style={styles.empty}>
								No match — try a city name.{"\n"}Discovery lives in the feed.
							</Text>
						)}
						{units.map((u) => {
							const f = fam(u);
							return (
								<Pressable
									key={u.id}
									style={[
										styles.row,
										selectedId === u.id && styles.rowSelected,
									]}
									onPress={() => {
										setSelectedId(u.id);
										setExpanded(true);
									}}
								>
									<Image
										source={{ uri: u.heroUrl }}
										style={styles.rowThumb}
									/>
									<View style={styles.rowText}>
										<Text style={styles.rowName}>
											{u.name}
											{journeyOn && (
												<Text style={styles.rowFam}> · {f.score}%</Text>
											)}
										</Text>
										<Text style={styles.rowSub}>
											{u.communityCount > 0
												? `${u.communityCount} communities`
												: "no communities yet"}
											{journeyOn ? ` · ${unknownDimsLabel(f.unknownDims)}` : ""}
										</Text>
									</View>
								</Pressable>
							);
						})}
					</ScrollView>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: PEACH },
	mapWrap: { flex: 1, backgroundColor: "#E8E2D6" },
	searchPill: {
		position: "absolute",
		left: 16,
		right: 16,
		flexDirection: "row",
		alignItems: "center",
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
	searchClear: { ...textStyles.title2, color: colors.ink2, marginLeft: 8 },
	chipRow: {
		position: "absolute",
		left: 16,
		flexDirection: "row",
		gap: 8,
	},
	chip: {
		backgroundColor: colors.glass,
		borderRadius: radii.pill,
		paddingHorizontal: 14,
		paddingVertical: 7,
	},
	chipOn: { backgroundColor: colors.cta },
	chipLabel: { ...textStyles.caption, color: colors.ink },
	chipLabelOn: { color: "#FFFFFF" },
	journeyStrip: {
		position: "absolute",
		left: 16,
		right: 16,
		backgroundColor: colors.glass,
		borderRadius: radii.tile,
		paddingHorizontal: 16,
		paddingVertical: 12,
		gap: 8,
	},
	journeyTitle: { ...textStyles.footnote, color: colors.ink },
	stepRow: { flexDirection: "row", justifyContent: "space-between" },
	stepItem: { alignItems: "center", gap: 4 },
	stepDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: colors.ink3,
	},
	stepDone: { backgroundColor: colors.accent },
	stepCurrent: { backgroundColor: colors.cta },
	stepLabel: { ...textStyles.caption, fontSize: 9, color: colors.ink3 },
	stepLabelOn: { color: colors.ink },
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
	empty: { ...textStyles.body, color: colors.ink2, padding: 20, textAlign: "center" },
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
	rowFam: { ...textStyles.footnote, color: colors.accent },
	rowSub: { ...textStyles.footnote, color: colors.ink2 },
});
