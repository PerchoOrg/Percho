/**
 * Saved tab (spec-v3 05 §5.2) — the shortlist, grouped by place.
 *
 * ── Shape, as of phase272 ───────────────────────────────────────────────────
 * Owner picked Option B off the four-layout mockup (`/demos/saved-layout-v1/`).
 * A section per town, each a swipeable rail; a saved AREA is not a card but
 * the section's own header. Why that grouping beats the flat list, and why the
 * area becomes a header, is argued once in `lib/saved/shelves.ts` — read it
 * there rather than here.
 *
 * Two controls in the top right, both his ask:
 *   · FILTER — Everything / Homes / Neighbourhoods / Areas. Deliberately an
 *     icon and a popover, not the segment chips deleted in phase187: those
 *     were a permanent bar that ate a row and forced you into one segment,
 *     this costs nothing until opened and defaults to Everything.
 *   · SELECT — turns cards (and area headers) into checkboxes, up to
 *     COMPARE_MAX. The FIRST pick sets the kind and the rest dim: homes,
 *     neighbourhoods and areas have three different compare tables and there
 *     is no such thing as comparing a house against a county.
 *
 * Removal lives in Select mode too. It used to be a "Remove" link repeated on
 * every row — the most destructive action given the most permanent real
 * estate. A shortlist has exactly two verbs, compare and prune, and Select is
 * where both now happen.
 *
 * ── What §5.2 wants and still CAN'T ship ────────────────────────────────────
 *   · Must-haves — Explore-side feature saving does not exist anywhere (no
 *     save affordance, no `saved_features` table on the wire).
 *   · price-change / DOM / delisted badges — the schema has no price history
 *     and no listing date; a 404 from the detail endpoint is the one honest
 *     "gone" signal and renders as such, at the foot.
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
import {
	type Shelf,
	type ShelfEntry,
	buildShelves,
	shelfCountLine,
	shelfListingIds,
} from "../../lib/saved/shelves";
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
			sub: string;
			/** The city — the shelf this save belongs on. */
			place: string;
			thumbUrl?: string;
			href: string;
	  }
	| { status: "gone" }
	| { status: "error" };

/** Which kinds the filter can narrow to. `all` is the default and the norm. */
type Filter = "all" | "listing" | "community" | "area";

const FILTER_LABEL: Record<Filter, string> = {
	all: "Everything",
	listing: "Homes",
	community: "Neighbourhoods",
	area: "Areas",
};

/** Per-kind compare bounds, so the action bar can speak in the right units. */
const BOUNDS = {
	listing: { min: COMPARE_MIN, max: COMPARE_MAX, noun: "homes" },
	community: {
		min: COMMUNITY_COMPARE_MIN,
		max: COMMUNITY_COMPARE_MAX,
		noun: "neighbourhoods",
	},
	area: { min: AREA_COMPARE_MIN, max: AREA_COMPARE_MAX, noun: "areas" },
} as const;

/**
 * The shelf a save lands on.
 *
 * A blank `city` is rare but real, and without this it would produce an
 * unnamed shelf — or worse, fall into `unplaced` and sit under a spinner that
 * never resolves, because the row IS ready. One named bucket is honest and
 * keeps the save reachable.
 */
function placeOf(city: string | undefined): string {
	return city?.trim() || "Elsewhere";
}

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
				title: price ?? d.address,
				// The card is already under its town, so the sub-line spends its
				// width on what distinguishes this home from the one beside it.
				sub: specs ?? d.address,
				place: placeOf(d.city),
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
			sub: d.state,
			place: placeOf(d.city),
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
	const [filter, setFilter] = useState<Filter>("all");
	const [popOpen, setPopOpen] = useState(false);
	const [selecting, setSelecting] = useState(false);
	const [picked, setPicked] = useState<string[]>([]);

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
	 * The asterisk is not decoration. This header is the ONLY place in the app a
	 * true-cost figure appears without a footnote explaining it, and water and
	 * trash are still guesses in every county, so an unqualified dollar figure
	 * here reads as more settled than the same number does on the map two taps
	 * away. Tapping the header goes to that map, which says which part is which.
	 */
	const costLineFor = useCallback(
		(unitId: string): string | undefined => {
			const area = countyOf(unitId);
			if (!area) return undefined;
			const lens = lensById("true_cost");
			const value = lens ? valuesFor(lens, [area])[0] : undefined;
			if (!value || !lens) return `${area.name} County`;
			const mark = value.estimated ? "*" : "";
			return `${area.name} County · ${lens.format(value.value)}/mo on a $500k home${mark}`;
		},
		[countyOf],
	);

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

	/** Every save, flattened to what the shelf builder needs. */
	const entries = useMemo((): ShelfEntry[] => {
		return items.map((item): ShelfEntry => {
			if (item.kind === "area") {
				const unit = areaUnitId(item.id);
				const name = pool.geoUnits.find((u) => u.id === unit)?.name;
				const key = countyOf(unit)?.key;
				const cost = costLineFor(unit);
				return {
					id: item.id,
					kind: "area",
					...(name ? { place: name } : {}),
					...(cost ? { costLine: cost } : {}),
					...(key ? { areaKey: key } : {}),
				};
			}
			const r = rows[item.id];
			if (r?.status !== "ready") return { id: item.id, kind: item.kind };
			return {
				id: item.id,
				kind: item.kind,
				place: r.place,
				title: r.title,
				sub: r.sub,
				...(r.thumbUrl ? { thumbUrl: r.thumbUrl } : {}),
				href: r.href,
			};
		});
	}, [items, rows, pool.geoUnits, countyOf, costLineFor]);

	const { shelves, unplaced } = useMemo(
		() =>
			buildShelves(
				filter === "all" ? entries : entries.filter((e) => e.kind === filter),
			),
		[entries, filter],
	);

	/** The kind the first pick locked us into, if anything is picked. */
	const lockedKind = useMemo((): keyof typeof BOUNDS | null => {
		const first = picked[0];
		if (!first) return null;
		const e = entries.find((x) => x.id === first);
		return e ? e.kind : null;
	}, [picked, entries]);

	const closeSelect = () => {
		setSelecting(false);
		setPicked([]);
	};

	const togglePick = (id: string, kind: ShelfEntry["kind"]) => {
		if (lockedKind && lockedKind !== kind) return;
		setPicked((p) => {
			if (p.includes(id)) return p.filter((x) => x !== id);
			return p.length < BOUNDS[kind].max ? [...p, id] : p;
		});
	};

	/**
	 * The distinct county keys behind the picked areas.
	 *
	 * Two saved cities can sit in ONE county — Marietta and Smyrna are both
	 * Cobb — and a table comparing a county against itself is not a
	 * comparison. So the area route de-duplicates, and the bar refuses to
	 * open on fewer than two distinct keys rather than drawing twin columns.
	 */
	const pickedAreaKeys = useMemo(() => {
		if (lockedKind !== "area") return [];
		const keys = picked
			.map((id) => entries.find((e) => e.id === id)?.areaKey)
			.filter((k): k is string => k !== undefined);
		return [...new Set(keys)];
	}, [picked, entries, lockedKind]);

	const canCompare =
		lockedKind !== null &&
		(lockedKind === "area"
			? pickedAreaKeys.length >= AREA_COMPARE_MIN
			: picked.length >= BOUNDS[lockedKind].min);

	/**
	 * How many towns the current picks span.
	 *
	 * Grouping by place made the tab legible and, owner: "Allow cross city
	 * comparison", also made it look like a fence — the only visible compare
	 * affordance was each shelf's own. Nothing ever stopped a cross-town pick;
	 * it just was not said. So the bar says it, before you pick and after.
	 */
	const pickedTowns = useMemo(() => {
		const towns = picked
			.map((id) => entries.find((e) => e.id === id)?.place)
			.filter((p): p is string => p !== undefined);
		return new Set(towns).size;
	}, [picked, entries]);

	const openCompare = () => {
		if (!lockedKind || !canCompare) return;
		if (lockedKind === "listing") {
			router.push({ pathname: "/compare", params: { ids: picked.join(",") } });
		} else if (lockedKind === "community") {
			router.push({
				pathname: "/compare-communities",
				params: { ids: picked.join(",") },
			});
		} else {
			router.push({
				pathname: "/compare-areas",
				params: { keys: pickedAreaKeys.slice(0, AREA_COMPARE_MAX).join(",") },
			});
		}
		closeSelect();
	};

	const removePicked = () => {
		for (const id of picked) {
			const e = entries.find((x) => x.id === id);
			if (e) toggle(id, e.kind);
		}
		closeSelect();
	};

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

	// Selecting is only offered once some ONE kind has a pair. Gating on the
	// total instead would offer the mode to a buyer holding one home and one
	// neighbourhood, where the kind-lock makes every second tap illegal — a
	// mode you can enter but cannot finish.
	const canSelect = (["listing", "community", "area"] as const).some(
		(k) => items.filter((i) => i.kind === k).length >= COMPARE_MIN,
	);
	const bounds = lockedKind ? BOUNDS[lockedKind] : null;

	return (
		<View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
			<View style={styles.hdr}>
				<Text style={styles.title}>Saved</Text>
				<View style={styles.hdrBtns}>
					{canSelect && (
						<Pressable
							style={[styles.iconBtn, selecting && styles.iconBtnOn]}
							onPress={() => (selecting ? closeSelect() : setSelecting(true))}
							accessibilityRole="button"
						>
							<Text style={[styles.iconTxt, selecting && styles.iconTxtOn]}>
								{selecting ? "Done" : "Select"}
							</Text>
						</Pressable>
					)}
					<Pressable
						style={[styles.iconBtn, filter !== "all" && styles.iconBtnOn]}
						onPress={() => setPopOpen((o) => !o)}
						accessibilityRole="button"
						accessibilityLabel="Filter saved items"
						accessibilityState={{ expanded: popOpen }}
					>
						<Text
							style={[styles.iconTxt, filter !== "all" && styles.iconTxtOn]}
						>
							{filter === "all" ? "Filter" : FILTER_LABEL[filter]}
						</Text>
					</Pressable>
				</View>
			</View>

			<ScrollView
				style={styles.list}
				contentContainerStyle={{
					paddingBottom: insets.bottom + (selecting ? 108 : 24),
				}}
			>
				{shelves.map((shelf) => (
					<ShelfBlock
						key={shelf.place}
						shelf={shelf}
						selecting={selecting}
						picked={picked}
						lockedKind={lockedKind}
						onPick={togglePick}
					/>
				))}

				{/* Only once nothing is still in flight — on a cold open every row
				    is loading and every shelf is empty, and saying "nothing saved"
				    over a column of spinners would be a lie that corrects itself. */}
				{shelves.length === 0 && unplaced.length === 0 && (
					<Text style={styles.note}>
						Nothing saved under {FILTER_LABEL[filter].toLowerCase()} yet.
					</Text>
				)}

				{/* Saves we can't shelve: still in flight, gone from the market, or
				    a failed fetch. They keep their own retry/remove affordances —
				    a row with no place cannot be grouped, and silently dropping it
				    would lose the buyer's save. */}
				{unplaced.length > 0 && (
					<View style={styles.loose}>
						{unplaced.map((e) => (
							<LooseRow
								key={e.id}
								row={rows[e.id] ?? { status: "loading" }}
								onRetry={() => {
									const item = items.find((i) => i.id === e.id);
									if (item) void load(item);
								}}
								onRemove={() => toggle(e.id, e.kind)}
							/>
						))}
					</View>
				)}

				{/* A bare asterisk is a dangling mark. It costs one line to say what
				    it means, and without it the header implies more certainty than
				    the same figure carries on the map. */}
				{shelves.some((s) => s.area?.costLine?.includes("*")) && (
					<Text style={styles.note}>
						* water and trash are still our estimate. Tap a place for the rest.
					</Text>
				)}
			</ScrollView>

			{popOpen && (
				<>
					<Pressable
						style={styles.backdrop}
						onPress={() => setPopOpen(false)}
						accessibilityRole="button"
						accessibilityLabel="Close filter"
					/>
					<View style={[styles.pop, { top: insets.top + 58 }]}>
						{(["all", "listing", "community", "area"] as Filter[]).map((f) => {
							const n =
								f === "all"
									? items.length
									: items.filter((i) => i.kind === f).length;
							return (
								<Pressable
									key={f}
									style={styles.popRow}
									onPress={() => {
										setFilter(f);
										setPopOpen(false);
									}}
									accessibilityRole="button"
									accessibilityState={{ selected: filter === f }}
								>
									<Text
										style={[styles.popTxt, filter === f && styles.popTxtOn]}
									>
										{FILTER_LABEL[f]}
									</Text>
									<Text
										style={filter === f ? styles.popTxtOn : styles.popCount}
									>
										{filter === f ? "✓" : n}
									</Text>
								</Pressable>
							);
						})}
					</View>
				</>
			)}

			{selecting && (
				<View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
					<View style={styles.barTxt}>
						<Text style={styles.barCount}>
							{picked.length === 0
								? `Pick ${bounds?.min ?? COMPARE_MIN}–${bounds?.max ?? COMPARE_MAX}`
								: `${picked.length} of ${bounds?.max ?? COMPARE_MAX} selected`}
						</Text>
						<Text style={styles.barSub} numberOfLines={2}>
							{lockedKind === "area" &&
							picked.length >= 2 &&
							pickedAreaKeys.length < 2
								? "Those are in the same county — pick one in another."
								: bounds
									? `Comparing ${bounds.noun}${pickedTowns > 1 ? ` across ${pickedTowns} towns` : ""}`
									: "Tap what you’re torn between — different towns are fine"}
						</Text>
					</View>
					{picked.length > 0 && (
						<Pressable
							onPress={removePicked}
							hitSlop={8}
							accessibilityRole="button"
						>
							<Text style={styles.barRemove}>Remove</Text>
						</Pressable>
					)}
					<Pressable
						style={[styles.barBtn, !canCompare && styles.barBtnOff]}
						disabled={!canCompare}
						onPress={openCompare}
						accessibilityRole="button"
					>
						<Text style={styles.barBtnTxt}>Get the take</Text>
					</Pressable>
				</View>
			)}
		</View>
	);
}

/** One town: a header (the saved area, when there is one) and its rail. */
function ShelfBlock({
	shelf,
	selecting,
	picked,
	lockedKind,
	onPick,
}: {
	shelf: Shelf;
	selecting: boolean;
	picked: string[];
	lockedKind: ShelfEntry["kind"] | null;
	onPick: (id: string, kind: ShelfEntry["kind"]) => void;
}) {
	const counts = shelfCountLine(shelf);
	const homes = shelfListingIds(shelf);
	const area = shelf.area;
	// The header is only a control when this town is itself a saved area:
	// otherwise it is a label for a group, with nothing behind it to open.
	const headerPicked = area ? picked.includes(area.id) : false;
	const headerDim =
		selecting && area ? lockedKind !== null && lockedKind !== "area" : false;

	const meta = [area?.costLine, counts].filter(Boolean).join(" · ");

	return (
		<View style={styles.shelf}>
			{/* The name block and the Compare shortcut are SIBLINGS, never nested.
			    Two overlapping press targets is how phase268 lost every tap inside
			    a community outline to the county underneath it, and a disabled
			    outer Pressable does not reliably stop an inner one from firing. */}
			<View style={styles.sHead}>
				<Pressable
					style={[styles.sHeadL, headerDim && styles.dim]}
					disabled={!area || headerDim}
					onPress={() => {
						if (!area) return;
						if (selecting) return onPick(area.id, "area");
						router.navigate({
							pathname: "/(tabs)/search",
							params: { focus: areaUnitId(area.id) },
						});
					}}
					accessibilityRole={
						selecting && area ? "checkbox" : area ? "button" : "header"
					}
					accessibilityState={
						selecting && area ? { checked: headerPicked } : undefined
					}
					accessibilityLabel={shelf.place}
				>
					<View style={styles.sNameRow}>
						{selecting && area && (
							<View style={[styles.tickSm, headerPicked && styles.tickOn]}>
								{headerPicked && <Text style={styles.tickMark}>✓</Text>}
							</View>
						)}
						<Text style={styles.sName} numberOfLines={1}>
							{shelf.place}
						</Text>
						{!!area && <Text style={styles.sSaved}>◆ saved</Text>}
					</View>
					{!!meta && (
						<Text style={styles.sMeta} numberOfLines={2}>
							{meta}
						</Text>
					)}
				</Pressable>
				{/* A shelf's own shortcut: the homes in THIS town, which is the
				    comparison a buyer standing in one place actually wants. */}
				{!selecting && homes.length >= COMPARE_MIN && (
					<Pressable
						onPress={() =>
							router.push({
								pathname: "/compare",
								params: { ids: homes.slice(0, COMPARE_MAX).join(",") },
							})
						}
						hitSlop={8}
						accessibilityRole="button"
					>
						{/* "these" is doing real work: it scopes the shortcut to this
						    town, so its existence stops implying that comparing is a
						    within-town act. Across towns is Select, which says so. */}
						<Text style={styles.sCompare}>
							Compare these {Math.min(homes.length, COMPARE_MAX)} ›
						</Text>
					</Pressable>
				)}
			</View>

			{shelf.cards.length > 0 && (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rail}
				>
					{shelf.cards.map((c) => {
						const on = picked.includes(c.id);
						const dim =
							selecting && lockedKind !== null && lockedKind !== c.kind;
						return (
							<Pressable
								key={c.id}
								style={[styles.card, on && styles.cardOn, dim && styles.dim]}
								disabled={dim}
								onPress={() =>
									selecting
										? onPick(c.id, c.kind)
										: router.push(c.href as never)
								}
								accessibilityRole={selecting ? "checkbox" : "button"}
								accessibilityState={selecting ? { checked: on } : undefined}
								accessibilityLabel={`${c.title}, ${c.sub}`}
							>
								<View>
									{c.thumbUrl ? (
										<Image source={{ uri: c.thumbUrl }} style={styles.ph} />
									) : (
										<View style={styles.ph} />
									)}
									{selecting && (
										<View style={[styles.tick, on && styles.tickOn]}>
											{on && <Text style={styles.tickMark}>✓</Text>}
										</View>
									)}
								</View>
								<View style={styles.cardBd}>
									<Text style={styles.cardT} numberOfLines={1}>
										{c.title}
									</Text>
									<Text style={styles.cardS} numberOfLines={1}>
										{c.sub}
									</Text>
								</View>
							</Pressable>
						);
					})}
				</ScrollView>
			)}
		</View>
	);
}

/** A save with no shelf — loading, gone, or a failed fetch. */
function LooseRow({
	row,
	onRetry,
	onRemove,
}: {
	row: Row;
	onRetry: () => void;
	onRemove: () => void;
}) {
	// A resolved row always has a place (`placeOf` guarantees one), so it is on
	// a shelf and has no business here.
	if (row.status === "ready") return null;
	if (row.status === "loading") {
		return (
			<View style={[styles.looseRow, styles.looseCenter]}>
				<ActivityIndicator color={colors.ink2} />
			</View>
		);
	}
	return (
		<View style={styles.looseRow}>
			<Text style={styles.looseTxt}>
				{row.status === "gone"
					? "No longer on the market"
					: "Couldn’t load this one"}
			</Text>
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

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	center: {
		alignItems: "center",
		justifyContent: "center",
		gap: 16,
		paddingHorizontal: 20,
	},
	hdr: {
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		marginBottom: 10,
	},
	title: { ...textStyles.title1, color: colors.ink },
	hdrBtns: { flexDirection: "row", gap: 6, paddingBottom: 3 },
	iconBtn: {
		minHeight: 34,
		justifyContent: "center",
		paddingHorizontal: 12,
		borderRadius: 11,
		borderWidth: 1,
		borderColor: colors.border,
		backgroundColor: colors.surface,
	},
	iconBtnOn: { backgroundColor: colors.cta, borderColor: colors.cta },
	iconTxt: { ...textStyles.footnote, fontWeight: "600", color: colors.ink },
	iconTxtOn: { color: colors.surface },
	list: { flex: 1 },

	shelf: { marginBottom: 20 },
	sHead: {
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-between",
		gap: 10,
		paddingHorizontal: 20,
		paddingBottom: 9,
	},
	sHeadL: { flex: 1 },
	sNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	sName: { ...textStyles.title2, color: colors.ink, flexShrink: 1 },
	sSaved: { ...textStyles.caption, color: colors.accent },
	sMeta: { ...textStyles.footnote, color: colors.ink2, marginTop: 1 },
	sCompare: { ...textStyles.footnote, fontWeight: "600", color: colors.accent },

	rail: { gap: 10, paddingHorizontal: 20, paddingBottom: 4 },
	card: {
		width: 150,
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		borderWidth: 1,
		borderColor: colors.border,
		overflow: "hidden",
	},
	cardOn: { borderColor: colors.accent, borderWidth: 2 },
	ph: { width: "100%", height: 104, backgroundColor: colors.surface2 },
	cardBd: { paddingHorizontal: 9, paddingTop: 7, paddingBottom: 10 },
	cardT: { ...textStyles.headline, color: colors.ink },
	cardS: { ...textStyles.footnote, fontSize: 11.5, color: colors.ink2 },
	dim: { opacity: 0.34 },

	tick: {
		position: "absolute",
		right: 7,
		top: 7,
		width: 24,
		height: 24,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: colors.surface,
		backgroundColor: "rgba(43,33,22,0.34)",
		alignItems: "center",
		justifyContent: "center",
	},
	tickSm: {
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 1.5,
		borderColor: colors.border,
		alignItems: "center",
		justifyContent: "center",
	},
	tickOn: { backgroundColor: colors.accent, borderColor: colors.accent },
	tickMark: { ...textStyles.caption, color: colors.surface },

	loose: { paddingHorizontal: 20, gap: 8, marginTop: 4 },
	looseRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		backgroundColor: colors.surface,
		borderRadius: radii.tile,
		padding: 12,
	},
	looseCenter: { justifyContent: "center", minHeight: 64 },
	looseTxt: { ...textStyles.footnote, color: colors.ink2, flex: 1 },
	rowAction: { ...textStyles.footnote, color: colors.accent },
	note: {
		...textStyles.caption,
		color: colors.ink3,
		paddingHorizontal: 20,
		paddingTop: 12,
		lineHeight: 15,
	},

	backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
	pop: {
		position: "absolute",
		right: 16,
		backgroundColor: colors.surface,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 16,
		padding: 6,
		width: 216,
		shadowColor: "#000",
		shadowOpacity: 0.16,
		shadowRadius: 20,
		shadowOffset: { width: 0, height: 10 },
		elevation: 8,
	},
	popRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 10,
		minHeight: 42,
		borderRadius: 10,
	},
	popTxt: { ...textStyles.body, color: colors.ink },
	popTxtOn: { ...textStyles.body, fontWeight: "600", color: colors.accent },
	popCount: { ...textStyles.footnote, color: colors.ink3 },

	bar: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 20,
		paddingTop: 12,
		backgroundColor: colors.glass,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	barTxt: { flex: 1 },
	barCount: { ...textStyles.headline, color: colors.ink },
	barSub: { ...textStyles.footnote, color: colors.ink2 },
	barRemove: { ...textStyles.footnote, fontWeight: "600", color: colors.neg },
	barBtn: {
		backgroundColor: colors.cta,
		borderRadius: radii.btn,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	barBtnOff: { opacity: 0.35 },
	barBtnTxt: { ...textStyles.headline, color: colors.surface },

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
