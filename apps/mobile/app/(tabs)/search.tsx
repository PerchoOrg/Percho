/**
 * Search tab (spec-v3 `04-search.md`) — map + collapsible list + journey layer.
 *
 * ── v1 scope vs §4.1 ────────────────────────────────────────────────────────
 * The spec's full version wants: 3-detent sheet, pin↔row two-way sync,
 * popularity sorting server-side, listing price pins at zoom ≥14. This is the
 * honest subset that ships for the store launch (phase D):
 *
 *   · no query → map renders CITY pins from the feed pool; the sheet lists
 *     the city units, familiar ones first when the journey layer is on
 *   · ≥2 characters → `/api/mobile/search` (`hooks/use-search.ts`) returns
 *     communities + homes; the sheet shows them grouped, plus any city whose
 *     name matches, and the map fits to the hits that have coordinates
 *   · community / home row tap → its detail page; city row tap → fly to it
 *     (city/zip "don't leave the surface" per §4.4)
 *   · "Your journey" layer chip on → familiarity from the same
 *     `areaFamiliarity` source the You tab uses (05 §5.3), so the two faces
 *     cannot disagree
 *
 * ── No filter UI anywhere ───────────────────────────────────────────────────
 * The only narrowing affordances are the search box, the viewport, and the
 * layer chip (§4.1 铁律). There is no price/bed/bath picker on this screen.
 */
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
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { MIN_QUERY_LEN, useSearch } from "../../hooks/use-search";
import { familiarityFor, unknownDimsLabel } from "../../lib/area-familiarity";
import type { GeoUnit } from "../../lib/feed/geo-unit";
import { formatPrice, specsLine } from "../../lib/saved/rows";
import { useFeedSession } from "../../state/feed-session";
import { useFunnelStore } from "../../state/funnel";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

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
	const [journeyOn, setJourneyOn] = useState(false);
	// v1: the sheet is one expanded panel (half) or collapsed (peek).
	const [expanded, setExpanded] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const search = useSearch(query);
	const searching = query.trim().length >= MIN_QUERY_LEN;

	const mapRef = useRef<MapView>(null);

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
		// Familiar units float to the top so the journey layer is the
		// natural first read, matching the §4.3 "in your journey first" rule.
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
					{units.map((u) => (
						<Marker
							key={u.id}
							coordinate={{
								latitude: u.centroid.lat,
								longitude: u.centroid.lng,
							}}
							title={u.name}
							onPress={() => select(u)}
							pinColor={
								selectedId === u.id
									? colors.accent
									: journeyOn
										? colors.pos
										: colors.ink2
							}
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

				{/* Layer chip (§4.1) */}
				<View style={[styles.chipRow, { top: insets.top + 56 }]}>
					<Pressable
						style={[styles.chip, journeyOn && styles.chipOn]}
						onPress={() => setJourneyOn((v) => !v)}
					>
						<Text style={[styles.chipLabel, journeyOn && styles.chipLabelOn]}>
							Your journey
						</Text>
					</Pressable>
				</View>
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
						: journeyOn
							? "Your journey"
							: "All areas"}
					{poolLoading || search.loading ? "" : ` · ${hitCount}`}
				</Text>
				{expanded && (
					<ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
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

						{hits && units.length > 0 && (
							<Text style={styles.groupTitle}>Areas</Text>
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
									onPress={() => select(u)}
								>
									<Image source={{ uri: u.heroUrl }} style={styles.rowThumb} />
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
	rowFam: { ...textStyles.footnote, color: colors.accent },
	rowSub: { ...textStyles.footnote, color: colors.ink2 },
});
