/**
 * `/listing/nearby?id=<listingId>` — the deep POI map.
 *
 * Flat route (not `listing/[id]/nearby`) so it can't be confused with the
 * `listing/[id]` leaf; the id arrives as a query param.
 *
 * ── Why this screen exists, and why the card's map is NOT this ───────────────
 *
 * The feed card shows a pre-rendered, non-interactive map image (cached in
 * Storage, see `scripts/maintenance/backfill_listing_maps.py`). Two reasons it isn't a live
 * MapView: an interactive map inside a swipe card fights the swipe gesture, and
 * a live Static Maps fetch per render is a billable request for a picture that
 * never changes.
 *
 * Tapping the thumbnail lands here, and this is the ONLY place the real map is
 * mounted and POI geometry is fetched. That keeps the cost on an explicit user
 * intent rather than on every card that scrolls past.
 *
 * Data comes from `/api/mobile/listing/<id>/nearby`, which returns only
 * `listing_pois.status = 'approved'` links — `candidate` rows are un-reviewed
 * Google Places output and must not reach a buyer.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiBase } from "../../lib/api/base";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

interface Poi {
	id: string;
	name: string;
	type: string | null;
	rating: number | null;
	distanceM: number | null;
	bucket: string;
	bucketLabel: string;
	lat: number;
	lng: number;
}

interface NearbyResponse {
	center: { lat: number; lng: number } | null;
	listing: {
		id: string;
		address: string;
		city?: string | null;
		state?: string | null;
	};
	pois: Poi[];
}

/** Metres → the unit a US buyer reads. */
function distanceLabel(m: number | null): string {
	if (m == null) return "";
	const miles = m / 1609.34;
	if (miles < 0.1) return `${Math.round(m * 3.28084)} ft`;
	return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

export default function NearbyMapScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const insets = useSafeAreaInsets();
	const [data, setData] = useState<NearbyResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [bucket, setBucket] = useState<string | null>(null);

	useEffect(() => {
		if (!id) return;
		let alive = true;
		(async () => {
			try {
				const res = await fetch(`${apiBase()}/api/mobile/listing/${id}/nearby`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = (await res.json()) as NearbyResponse;
				if (alive) setData(json);
			} catch (e) {
				if (alive) setError(e instanceof Error ? e.message : "failed to load");
			}
		})();
		return () => {
			alive = false;
		};
	}, [id]);

	const buckets = useMemo(() => {
		if (!data) return [];
		const seen = new Map<string, string>();
		for (const p of data.pois)
			if (!seen.has(p.bucket)) seen.set(p.bucket, p.bucketLabel);
		return [...seen.entries()].map(([key, label]) => ({ key, label }));
	}, [data]);

	const shown = useMemo(() => {
		if (!data) return [];
		return bucket ? data.pois.filter((p) => p.bucket === bucket) : data.pois;
	}, [data, bucket]);

	if (error) {
		return (
			<View style={[styles.center, { paddingTop: insets.top }]}>
				<Text style={styles.err}>Couldn't load the area map.</Text>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
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

	if (!data.center) {
		return (
			<View style={[styles.center, { paddingTop: insets.top }]}>
				<Text style={styles.err}>This home has no location on file yet.</Text>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Text style={styles.backTxt}>Back</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View style={styles.root}>
			<MapView
				style={styles.map}
				initialRegion={{
					latitude: data.center.lat,
					longitude: data.center.lng,
					// ~3km across, which is the radius POIs are discovered within.
					latitudeDelta: 0.045,
					longitudeDelta: 0.045,
				}}
			>
				{/* The home itself, visually distinct from the POIs. */}
				<Marker
					coordinate={{ latitude: data.center.lat, longitude: data.center.lng }}
					title={data.listing.address}
					pinColor={colors.accent}
				/>
				{shown.map((p) => (
					<Marker
						key={p.id}
						coordinate={{ latitude: p.lat, longitude: p.lng }}
						title={p.name}
						description={`${p.bucketLabel}${p.distanceM != null ? ` · ${distanceLabel(p.distanceM)}` : ""}`}
					/>
				))}
			</MapView>

			<View style={[styles.header, { paddingTop: insets.top + 8 }]}>
				<Pressable
					onPress={() => router.back()}
					style={styles.close}
					accessibilityLabel="Close map"
				>
					<Text style={styles.closeTxt}>✕</Text>
				</Pressable>
				<View style={styles.titleWrap}>
					<Text style={styles.title} numberOfLines={1}>
						{data.listing.address}
					</Text>
					<Text style={styles.sub} numberOfLines={1}>
						{shown.length} place{shown.length === 1 ? "" : "s"} nearby
					</Text>
				</View>
			</View>

			{buckets.length > 1 && (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={[styles.filters, { top: insets.top + 62 }]}
					contentContainerStyle={styles.filtersInner}
				>
					<Pressable
						onPress={() => setBucket(null)}
						style={[styles.chip, !bucket && styles.chipOn]}
					>
						<Text style={[styles.chipTxt, !bucket && styles.chipTxtOn]}>
							All
						</Text>
					</Pressable>
					{buckets.map((b) => (
						<Pressable
							key={b.key}
							onPress={() => setBucket(b.key === bucket ? null : b.key)}
							style={[styles.chip, bucket === b.key && styles.chipOn]}
						>
							<Text
								style={[styles.chipTxt, bucket === b.key && styles.chipTxtOn]}
							>
								{b.label}
							</Text>
						</Pressable>
					))}
				</ScrollView>
			)}

			{/* A list under the map, because reading pin labels on a phone is hard. */}
			<View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
				<ScrollView showsVerticalScrollIndicator={false}>
					{shown.length === 0 ? (
						<Text style={styles.empty}>
							No curated places for this home yet.
						</Text>
					) : (
						shown.map((p) => (
							<View key={p.id} style={styles.row}>
								<View style={styles.rowText}>
									<Text style={styles.rowName} numberOfLines={1}>
										{p.name}
									</Text>
									<Text style={styles.rowMeta} numberOfLines={1}>
										{p.bucketLabel}
										{p.rating != null ? ` · ★ ${p.rating}` : ""}
									</Text>
								</View>
								<Text style={styles.rowDist}>{distanceLabel(p.distanceM)}</Text>
							</View>
						))
					)}
				</ScrollView>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.bg },
	map: { flex: 1 },
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 14,
		backgroundColor: colors.bg,
	},
	err: {
		...textStyles.footnote,
		color: colors.ink2,
		textAlign: "center",
		paddingHorizontal: 32,
	},
	backBtn: {
		paddingHorizontal: 18,
		paddingVertical: 10,
		borderRadius: radii.btn,
		backgroundColor: colors.cta,
	},
	backTxt: { ...textStyles.footnote, color: "#FFFFFF" },
	header: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 14,
		paddingBottom: 10,
	},
	close: {
		width: 34,
		height: 34,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.glass,
	},
	closeTxt: { fontSize: 15, color: colors.ink },
	titleWrap: {
		flex: 1,
		backgroundColor: colors.glass,
		borderRadius: radii.btn,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	title: { ...textStyles.footnote, color: colors.ink },
	sub: { ...textStyles.caption, color: colors.ink2, marginTop: 1 },
	filters: { position: "absolute", left: 0, right: 0, maxHeight: 40 },
	filtersInner: { paddingHorizontal: 14, gap: 6, alignItems: "center" },
	chip: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: radii.pill,
		backgroundColor: colors.glass,
	},
	chipOn: { backgroundColor: colors.cta },
	chipTxt: { ...textStyles.caption, color: colors.ink },
	chipTxtOn: { color: "#FFFFFF" },
	sheet: {
		maxHeight: "38%",
		backgroundColor: colors.bg,
		borderTopLeftRadius: radii.sheet,
		borderTopRightRadius: radii.sheet,
		paddingTop: 12,
		paddingHorizontal: 16,
	},
	empty: {
		...textStyles.footnote,
		color: colors.ink3,
		paddingVertical: 18,
		textAlign: "center",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	rowText: { flex: 1, minWidth: 0 },
	rowName: { ...textStyles.footnote, color: colors.ink },
	rowMeta: { ...textStyles.caption, color: colors.ink2, marginTop: 2 },
	rowDist: { ...textStyles.caption, color: colors.ink2 },
});
