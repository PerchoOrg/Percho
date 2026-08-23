/**
 * Saved tab (spec-v3 05 §5.2) — the bookmark's shelf.
 *
 * ── v1 scope vs §5.2 ────────────────────────────────────────────────────────
 * Segments: Homes and Communities (owner 2026-08-23: "saved is for both"),
 * plus Areas when the buyer has bookmarked a CITY card — that face has drawn
 * a bookmark since 2026-08-15 and it now lands here. What §5.2 wants beyond
 * this and CAN'T ship yet:
 *
 *   · Must-haves — Explore-side feature saving does not exist anywhere
 *     (no save affordance, no `saved_features` table on the wire), so the
 *     segment would always read `· 0`. It lands with that pipeline.
 *   · price-change / DOM / delisted badges — the schema has no price history
 *     and no listing date; a 404 from the detail endpoint is the one honest
 *     "gone" signal and renders as such.
 *   · Compare — §5.2's own scoping is "v1.1 范围,先出灰态入口": the gray
 *     entry is here, the side-by-side is not.
 *
 * Rows re-fetch from the detail endpoints on every mount — the store keeps
 * ids only, so a price change shows the moment the server knows it.
 */
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import { useFeedPool } from "../../hooks/use-feed-pool";
import { communityDetailUrl, listingDetailUrl } from "../../lib/api/base";
import { areaUnitId, formatPrice, specsLine } from "../../lib/saved/rows";
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

type Segment = "listing" | "community" | "area";

const SEGMENT_LABEL: Record<Segment, string> = {
	listing: "Homes",
	community: "Communities",
	area: "Areas",
};

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
	const [segment, setSegment] = useState<Segment>("listing");

	const counts: Record<Segment, number> = {
		listing: items.filter((i) => i.kind === "listing").length,
		community: items.filter((i) => i.kind === "community").length,
		area: items.filter((i) => i.kind === "area").length,
	};
	const segments: Segment[] = ["listing", "community"];
	if (counts.area > 0) segments.push("area");

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

	const active = items.filter((i) => i.kind === segment);

	if (hydrated && items.length === 0) {
		// §5.5's Saved empty state — always a way back to the main loop.
		return (
			<View style={[styles.screen, styles.center]}>
				<Text style={styles.emptyTitle}>Homes you like will live here</Text>
				<Pressable
					style={styles.backBtn}
					onPress={() => router.navigate("/(tabs)/feed")}
					accessibilityRole="button"
				>
					<Text style={styles.backTxt}>Back to feed</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
			<Text style={styles.title}>Saved</Text>

			{/* Segment chips — Homes · N / Communities · N (/ Areas · N). */}
			<View style={styles.chipRow}>
				{segments.map((s) => {
					const on = segment === s;
					return (
						<Pressable
							key={s}
							style={[styles.chip, on && styles.chipOn]}
							onPress={() => setSegment(s)}
							accessibilityRole="tab"
							accessibilityState={{ selected: on }}
						>
							<Text style={[styles.chipLabel, on && styles.chipLabelOn]}>
								{SEGMENT_LABEL[s]} · {counts[s]}
							</Text>
						</Pressable>
					);
				})}
			</View>

			<ScrollView
				style={styles.list}
				contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
			>
				{active.length === 0 && (
					<Text style={styles.segmentEmpty}>
						{segment === "listing"
							? "Tap the bookmark on a home to keep it here."
							: "Tap Save on a neighbourhood's page to keep it here."}
					</Text>
				)}

				{active.map((item) =>
					item.kind === "area" ? (
						<AreaRow
							key={item.id}
							item={item}
							unitName={
								pool.geoUnits.find((u) => u.id === areaUnitId(item.id))?.name
							}
							onRemove={() => toggle(item.id, item.kind)}
						/>
					) : (
						<SavedRow
							key={item.id}
							row={rows[item.id] ?? { status: "loading" }}
							onRetry={() => void load(item)}
							onRemove={() => toggle(item.id, item.kind)}
						/>
					),
				)}

				{/* Compare — §5.2's gray v1 entry. */}
				{segment === "listing" && counts.listing >= 2 && (
					<View style={styles.compare}>
						<Text style={styles.compareHead}>COMPARE</Text>
						<Text style={styles.compareBody}>
							Select 2–3 homes → side-by-side on the dims you care about. Coming
							soon.
						</Text>
					</View>
				)}
			</ScrollView>
		</View>
	);
}

function SavedRow({
	row,
	onRetry,
	onRemove,
}: {
	row: Row;
	onRetry: () => void;
	onRemove: () => void;
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
	return (
		<Pressable
			style={styles.row}
			onPress={() => router.push(row.href as never)}
			accessibilityRole="button"
			accessibilityLabel={`${row.title}${row.sub ? `, ${row.sub}` : ""}`}
		>
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

/** A bookmarked CITY card. Tap → the Search map, focused on the unit. */
function AreaRow({
	item,
	unitName,
	onRemove,
}: {
	item: SavedItem;
	unitName: string | undefined;
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
				<Text style={styles.rowSub}>See on the map</Text>
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
	chipRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
	chip: {
		backgroundColor: colors.surface2,
		borderRadius: radii.pill,
		paddingHorizontal: 14,
		paddingVertical: 7,
	},
	chipOn: { backgroundColor: colors.cta },
	chipLabel: { ...textStyles.caption, color: colors.ink },
	chipLabelOn: { color: colors.surface },
	list: { flex: 1 },
	segmentEmpty: {
		...textStyles.body,
		color: colors.ink2,
		paddingVertical: 24,
		textAlign: "center",
	},
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
	rowAction: { ...textStyles.footnote, color: colors.accent },
	compare: {
		backgroundColor: colors.surface2,
		borderRadius: radii.tile,
		padding: 14,
		marginTop: 8,
		gap: 4,
	},
	compareHead: { ...textStyles.caption, color: colors.ink3 },
	compareBody: { ...textStyles.footnote, color: colors.ink2 },
	emptyTitle: { ...textStyles.title2, color: colors.ink, textAlign: "center" },
	backBtn: {
		backgroundColor: colors.cta,
		borderRadius: radii.btn,
		paddingHorizontal: 20,
		paddingVertical: 12,
	},
	backTxt: { ...textStyles.headline, color: colors.surface },
});
