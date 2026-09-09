/**
 * Saved tab (spec-v3 05 §5.2) — the bookmark's shelf.
 *
 * ── v1 scope vs §5.2 ────────────────────────────────────────────────────────
 * One flat list: homes, communities, and bookmarked CITY cards (areas) all
 * land here together (owner 2026-09-07: segment chips removed — "saved is
 * for both" still holds, it just no longer needs tabs). What §5.2 wants
 * beyond this and CAN'T ship yet:
 *
 *   · Must-haves — Explore-side feature saving does not exist anywhere
 *     (no save affordance, no `saved_features` table on the wire), so the
 *     segment would always read `· 0`. It lands with that pipeline.
 *   · price-change / DOM / delisted badges — the schema has no price history
 *     and no listing date; a 404 from the detail endpoint is the one honest
 *     "gone" signal and renders as such.
 *   · Compare — all three kinds now have a table, and only the homes need a
 *     picker: tap Compare, tick 2–3, and `/compare` lays them side by side
 *     (phase D, `lib/listing/compare.ts`). Saved AREAS and saved COMMUNITIES
 *     go straight to `/compare-areas` and `/compare-communities`, because in
 *     both cases what is saved already IS the shortlist.
 *
 * Rows re-fetch from the detail endpoints on every mount — the store keeps
 * ids only, so a price change shows the moment the server knows it.
 */
import type { Area } from "@percho/shared/lenses";
import { lensById, valuesFor } from "@percho/shared/lenses";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAreas } from "../../hooks/use-areas";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { communityDetailUrl, listingDetailUrl } from "../../lib/api/base";
import { areasByKey } from "../../lib/areas/areas-dto";
import {
	AREA_COMPARE_MAX,
	AREA_COMPARE_MIN,
} from "../../lib/areas/compare-areas";
import { countyKeyForPoint } from "../../lib/areas/locate";
import {
	COMMUNITY_COMPARE_MAX,
	COMMUNITY_COMPARE_MIN,
} from "../../lib/community/compare-communities";
import { COMPARE_MAX, COMPARE_MIN } from "../../lib/listing/compare";
import { areaUnitId, formatPrice, specsLine } from "../../lib/saved/rows";
import { useAuthStore } from "../../state/auth";
import { useFunnelStore } from "../../state/funnel";
import { type SavedItem, useSavedStore } from "../../state/saved";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/** What one saved id resolved to. */
type Row =
	| { status: "loading" }
	| {
			status: "ready";
			title: string;
			sub?: string;
			thumbUrl?: string;
			href: string;
	  }
	| { status: "gone" }
	| { status: "error" };

/** Resolve one saved listing/community id to a row via its detail endpoint. */
async function fetchRow(item: SavedItem): Promise<Row> {
	const url =
		item.kind === "listing"
			? listingDetailUrl(item.id)
			: communityDetailUrl(item.id);
	try {
		const res = await fetch(url);
		if (res.status === 404) return { status: "gone" };
		if (!res.ok) return { status: "error" };
		if (item.kind === "listing") {
			const d = (await res.json()) as {
				id: string;
				address: string;
				city: string;
				state: string;
				price?: number;
				beds?: number;
				baths?: number;
				sqft?: number;
				photos: { url: string }[];
			};
			const price = formatPrice(d.price);
			const specs = specsLine(d.beds, d.baths, d.sqft);
			return {
				status: "ready",
				title: [price, specs].filter(Boolean).join(" · ") || d.address,
				sub: `${d.address} · ${d.city}, ${d.state}`,
				thumbUrl: d.photos[0]?.url,
				href: `/listing/${d.id}`,
			};
		}
		const d = (await res.json()) as {
			slug: string;
			name: string;
			city: string;
			state: string;
			heroUrl: string;
		};
		return {
			status: "ready",
			title: d.name,
			sub: `${d.city}, ${d.state}`,
			thumbUrl: d.heroUrl,
			href: `/community/${d.slug}`,
		};
	} catch {
		return { status: "error" };
	}
}

export default function SavedTab() {
	const insets = useSafeAreaInsets();
	const items = useSavedStore((s) => s.items);
	const hydrated = useSavedStore((s) => s.hydrated);
	const toggle = useSavedStore((s) => s.toggle);
	const signedIn = useAuthStore((s) => s.session !== null);

	// Area rows resolve from the pool (a bookmarked CITY card's unit is pool
	// data, not a detail endpoint) — same source the Search tab reads.
	const stage = useFunnelStore((s) => s.stage);
	const { pool } = useFeedPool({
		stage,
		cities: [],
		likedCommunityIds: [],
		enabled: items.some((i) => i.kind === "area"),
	});

	const [rows, setRows] = useState<Record<string, Row>>({});
	// Compare picker: null = off; otherwise the ticked listing ids.
	const [picking, setPicking] = useState<string[] | null>(null);

	const listingCount = items.filter((i) => i.kind === "listing").length;
	const areaItems = items.filter((i) => i.kind === "area");
	// Saved COMMUNITIES, newest first — the order `items` already carries. No
	// picker and no resolution step: unlike a saved area (a city that has to be
	// placed in a county before it has numbers) a saved community IS the thing
	// compared, so the shortlist needs nothing done to it.
	const communityIds = items
		.filter((i) => i.kind === "community")
		.map((i) => i.id);

	// Lens metrics for the saved AREAS. A saved area is a city; the numbers are
	// per county, so each city is placed by its centroid — see `locate.ts` for
	// what that resolution is and is not good enough for.
	const { areas: areaData } = useAreas();
	const metricsByCounty = useMemo(
		() => areasByKey(areaData.areas),
		[areaData.areas],
	);
	const countyOf = useCallback(
		(unitId: string): Area | undefined => {
			const unit = pool.geoUnits.find((u) => u.id === unitId);
			if (!unit) return undefined;
			const key = countyKeyForPoint(
				unit.centroid.lat,
				unit.centroid.lng,
				areaData.shapes,
			);
			return key ? metricsByCounty.get(key) : undefined;
		},
		[pool.geoUnits, areaData.shapes, metricsByCounty],
	);

	/**
	 * "Cherokee County · $691/mo on a $500k home*" — or nothing, outside the
	 * covered metro.
	 *
	 * The asterisk is not decoration. This row is the ONLY place in the app a
	 * true-cost figure appears without a footnote explaining it, and water and
	 * trash are still guesses in every county, so an unqualified dollar figure
	 * here reads as more settled than the same number does on the map two taps
	 * away. Tapping the row goes to that map, which says which part is which.
	 */
	const costLineFor = (unitId: string): string | undefined => {
		const area = countyOf(unitId);
		if (!area) return undefined;
		const lens = lensById("true_cost");
		const value = lens ? valuesFor(lens, [area])[0] : undefined;
		if (!value || !lens) return `${area.name} County`;
		const mark = value.estimated ? "*" : "";
		return `${area.name} County · ${lens.format(value.value)}/mo on a $500k home${mark}`;
	};

	/** The saved areas we can actually put in a comparison table. */
	const comparableAreas = areaItems
		.map((i) => countyOf(areaUnitId(i.id)))
		.filter((a): a is Area => a !== undefined);
	// Two cities in one county compare against themselves; de-duplicate.
	const comparableKeys = [...new Set(comparableAreas.map((a) => a.key))];

	const load = useCallback(async (item: SavedItem) => {
		setRows((r) => ({ ...r, [item.id]: { status: "loading" } }));
		const row = await fetchRow(item);
		setRows((r) => ({ ...r, [item.id]: row }));
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `rows` is read as a cache, not a trigger — depending on it would refetch every row each time one lands. `items` growing is the trigger.
	useEffect(() => {
		for (const item of items) {
			if (item.kind === "area") continue;
			if (!(item.id in rows)) void load(item);
		}
	}, [items, load]);

	if (hydrated && items.length === 0) {
		// §5.5's Saved empty state — always a way back to the main loop. Signed
		// out it doubles as the sign-in prompt: saves live on the account now,
		// so an empty list here usually means "not signed in on this phone".
		return (
			<View style={[styles.screen, styles.center]}>
				<Text style={styles.emptyTitle}>
					{signedIn
						? "Homes you like will live here"
						: "Sign in to keep the homes you like"}
				</Text>
				{!signedIn && (
					<Pressable
						style={styles.backBtn}
						onPress={() => router.push("/auth")}
						accessibilityRole="button"
					>
						<Text style={styles.backTxt}>Sign in</Text>
					</Pressable>
				)}
				<Pressable
					style={signedIn ? styles.backBtn : styles.backLink}
					onPress={() => router.navigate("/(tabs)/feed")}
					accessibilityRole="button"
				>
					<Text style={signedIn ? styles.backTxt : styles.backLinkTxt}>
						Back to feed
					</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
			<Text style={styles.title}>Saved</Text>

			<ScrollView
				style={styles.list}
				contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
			>
				{/* Compare (05 §5.2): pick 2–3 homes, then open the side-by-side. */}
				{listingCount >= COMPARE_MIN && (
					<View style={styles.compare}>
						{picking ? (
							<>
								<Text style={styles.compareBody}>
									{picking.length < COMPARE_MIN
										? `Tick ${COMPARE_MIN}–${COMPARE_MAX} homes to compare.`
										: `${picking.length} homes picked.`}
								</Text>
								<View style={styles.compareActions}>
									<Pressable
										style={[
											styles.compareBtn,
											picking.length < COMPARE_MIN && styles.compareBtnOff,
										]}
										disabled={picking.length < COMPARE_MIN}
										onPress={() =>
											router.push({
												pathname: "/compare",
												params: { ids: picking.join(",") },
											})
										}
										accessibilityRole="button"
									>
										<Text style={styles.compareBtnTxt}>Compare</Text>
									</Pressable>
									<Pressable
										style={styles.compareCancel}
										onPress={() => setPicking(null)}
										accessibilityRole="button"
									>
										<Text style={styles.compareCancelTxt}>Cancel</Text>
									</Pressable>
								</View>
							</>
						) : (
							<Pressable
								style={styles.compareEntry}
								onPress={() => setPicking([])}
								accessibilityRole="button"
							>
								<Text style={styles.compareHead}>COMPARE</Text>
								<Text style={styles.compareBody}>
									Pick {COMPARE_MIN}–{COMPARE_MAX} homes and see them side by
									side — price, monthly cost, size, schools.
								</Text>
							</Pressable>
						)}
					</View>
				)}

				{/* Compare the saved COMMUNITIES (phase261). Owner: "Saved can't
				    compare communities" — it could compare homes and it could
				    compare areas, and the shortlist most buyers actually hold was
				    the one kind with no table.

				    Sits between the two on purpose: a community is narrower than a
				    county and wider than a house, and this row reads down that
				    scale. Like the areas below and unlike the homes above, it needs
				    no picking — the saved communities ARE the shortlist. */}
				{communityIds.length >= COMMUNITY_COMPARE_MIN && (
					<Pressable
						style={styles.compare}
						onPress={() =>
							router.push({
								pathname: "/compare-communities",
								params: {
									ids: communityIds.slice(0, COMMUNITY_COMPARE_MAX).join(","),
								},
							})
						}
						accessibilityRole="button"
					>
						<Text style={styles.compareHead}>COMPARE NEIGHBOURHOODS</Text>
						<Text style={styles.compareBody}>
							See your saved neighbourhoods side by side — what residents rate
							them, who lives there, what’s nearby.
						</Text>
					</Pressable>
				)}

				{/* Compare the saved AREAS. Separate from the home picker on
				    purpose: the buyer study put most people at "which of my two
				    or three neighbourhoods", which is a different question from
				    "which of these houses", and answering it needs no picking —
				    the saved areas ARE the shortlist. */}
				{comparableKeys.length >= AREA_COMPARE_MIN && (
					<Pressable
						style={styles.compare}
						onPress={() =>
							router.push({
								pathname: "/compare-areas",
								params: {
									keys: comparableKeys.slice(0, AREA_COMPARE_MAX).join(","),
								},
							})
						}
						accessibilityRole="button"
					>
						<Text style={styles.compareHead}>COMPARE AREAS</Text>
						<Text style={styles.compareBody}>
							See your saved areas side by side — what a home really costs each
							month, schools, tax, utilities.
						</Text>
					</Pressable>
				)}

				{items.map((item) =>
					item.kind === "area" ? (
						<AreaRow
							key={item.id}
							item={item}
							unitName={
								pool.geoUnits.find((u) => u.id === areaUnitId(item.id))?.name
							}
							costLine={costLineFor(areaUnitId(item.id))}
							onRemove={() => toggle(item.id, item.kind)}
						/>
					) : (
						<SavedRow
							key={item.id}
							row={rows[item.id] ?? { status: "loading" }}
							onRetry={() => void load(item)}
							onRemove={() => toggle(item.id, item.kind)}
							picked={
								picking && item.kind === "listing"
									? picking.includes(item.id)
									: undefined
							}
							onPick={() =>
								setPicking((p) => {
									if (!p) return p;
									if (p.includes(item.id))
										return p.filter((x) => x !== item.id);
									return p.length < COMPARE_MAX ? [...p, item.id] : p;
								})
							}
						/>
					),
				)}

				{/* A bare asterisk is a dangling mark. It costs one line to say
				    what it means, and without it the row implies more certainty
				    than the same figure carries on the map. */}
				{areaItems.some((i) => {
					const a = countyOf(areaUnitId(i.id));
					const lens = lensById("true_cost");
					return a && lens
						? valuesFor(lens, [a])[0]?.estimated === true
						: false;
				}) ? (
					<Text style={styles.savedNote}>
						* water and trash are still our estimate. Tap an area for the rest.
					</Text>
				) : null}
			</ScrollView>
		</View>
	);
}

function SavedRow({
	row,
	onRetry,
	onRemove,
	picked,
	onPick,
}: {
	row: Row;
	onRetry: () => void;
	onRemove: () => void;
	/** Defined only while the compare picker is open. */
	picked?: boolean;
	onPick: () => void;
}) {
	if (row.status === "loading") {
		return (
			<View style={[styles.row, styles.rowCenter]}>
				<ActivityIndicator color={colors.ink2} />
			</View>
		);
	}
	if (row.status === "gone" || row.status === "error") {
		return (
			<View style={styles.row}>
				<View style={styles.rowText}>
					<Text style={styles.rowSub}>
						{row.status === "gone"
							? "No longer on the market"
							: "Couldn't load this one"}
					</Text>
				</View>
				{row.status === "error" && (
					<Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
						<Text style={styles.rowAction}>Retry</Text>
					</Pressable>
				)}
				<Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button">
					<Text style={styles.rowAction}>Remove</Text>
				</Pressable>
			</View>
		);
	}
	const pickMode = picked !== undefined;
	return (
		<Pressable
			style={[styles.row, picked && styles.rowPicked]}
			onPress={pickMode ? onPick : () => router.push(row.href as never)}
			accessibilityRole={pickMode ? "checkbox" : "button"}
			accessibilityState={pickMode ? { checked: picked } : undefined}
			accessibilityLabel={`${row.title}${row.sub ? `, ${row.sub}` : ""}`}
		>
			{pickMode && (
				<View style={[styles.tick, picked && styles.tickOn]}>
					{picked && <Text style={styles.tickMark}>✓</Text>}
				</View>
			)}
			{row.thumbUrl ? (
				<Image source={{ uri: row.thumbUrl }} style={styles.thumb} />
			) : (
				<View style={styles.thumb} />
			)}
			<View style={styles.rowText}>
				<Text style={styles.rowTitle} numberOfLines={1}>
					{row.title}
				</Text>
				{!!row.sub && (
					<Text style={styles.rowSub} numberOfLines={1}>
						{row.sub}
					</Text>
				)}
			</View>
			{!pickMode && (
				<Pressable
					onPress={onRemove}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Remove from saved"
				>
					<Text style={styles.rowAction}>Remove</Text>
				</Pressable>
			)}
		</Pressable>
	);
}

/** A bookmarked CITY card. Tap → the Search map, focused on the unit. */
function AreaRow({
	item,
	unitName,
	costLine,
	onRemove,
}: {
	item: SavedItem;
	unitName: string | undefined;
	/** The area's county and what a home there costs per month, when we know
	 *  both. Absent outside the covered metro — nothing is invented. */
	costLine: string | undefined;
	onRemove: () => void;
}) {
	const unit = areaUnitId(item.id);
	return (
		<Pressable
			style={styles.row}
			onPress={() =>
				router.navigate({
					pathname: "/(tabs)/search",
					params: { focus: unit },
				})
			}
			accessibilityRole="button"
			accessibilityLabel={unitName ?? "Saved area"}
		>
			<View style={styles.rowText}>
				<Text style={styles.rowTitle} numberOfLines={1}>
					{unitName ?? "…"}
				</Text>
				<Text style={styles.rowSub}>{costLine ?? "See on the map"}</Text>
			</View>
			<Pressable
				onPress={onRemove}
				hitSlop={8}
				accessibilityRole="button"
				accessibilityLabel="Remove from saved"
			>
				<Text style={styles.rowAction}>Remove</Text>
			</Pressable>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
	center: { alignItems: "center", justifyContent: "center", gap: 16 },
	title: { ...textStyles.title1, color: colors.ink, marginBottom: 12 },
	list: { flex: 1 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		padding: 12,
		marginBottom: 8,
	},
	rowCenter: { justifyContent: "center", minHeight: 72 },
	thumb: {
		width: 56,
		height: 56,
		borderRadius: radii.tile,
		backgroundColor: colors.surface2,
	},
	rowText: { flex: 1, gap: 2 },
	rowTitle: { ...textStyles.headline, color: colors.ink },
	rowSub: { ...textStyles.footnote, color: colors.ink2 },
	savedNote: {
		...textStyles.caption,
		color: colors.ink3,
		paddingHorizontal: 4,
		paddingTop: 12,
		lineHeight: 15,
	},
	rowAction: { ...textStyles.footnote, color: colors.accent },
	compare: {
		backgroundColor: colors.surface2,
		borderRadius: radii.tile,
		padding: 14,
		marginBottom: 8,
		gap: 4,
	},
	compareEntry: { gap: 4 },
	compareHead: { ...textStyles.caption, color: colors.ink3 },
	compareBody: { ...textStyles.footnote, color: colors.ink2 },
	compareActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginTop: 8,
	},
	compareBtn: {
		backgroundColor: colors.cta,
		borderRadius: radii.btn,
		paddingHorizontal: 18,
		paddingVertical: 10,
	},
	compareBtnOff: { opacity: 0.4 },
	compareBtnTxt: { ...textStyles.headline, color: colors.surface },
	compareCancel: { minHeight: 44, justifyContent: "center" },
	compareCancelTxt: { ...textStyles.footnote, color: colors.accent },
	rowPicked: { borderWidth: 1.5, borderColor: colors.accent },
	tick: {
		width: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 1.5,
		borderColor: colors.border,
		alignItems: "center",
		justifyContent: "center",
	},
	tickOn: { backgroundColor: colors.accent, borderColor: colors.accent },
	tickMark: { ...textStyles.caption, color: colors.surface },
	emptyTitle: { ...textStyles.title2, color: colors.ink, textAlign: "center" },
	backBtn: {
		backgroundColor: colors.cta,
		borderRadius: radii.btn,
		paddingHorizontal: 20,
		paddingVertical: 12,
	},
	backTxt: { ...textStyles.headline, color: colors.surface },
	backLink: { minHeight: 44, justifyContent: "center", marginTop: 4 },
	backLinkTxt: { ...textStyles.footnote, color: colors.accent },
});
