/**
 * Listing explore page (`02-listing.md` §2.2–2.4) — `/listing/[id]`.
 *
 * Pushed OVER the tab bar (see `app/_layout.tsx`), so the tab bar is correctly
 * absent here: this is a committed, depth-reading screen, not a tab.
 *
 * §2.2 entry rules, implemented:
 *   - `?focus=<key>`  → skip the tour, land in free explore, scroll to the
 *                       section, highlight it for 2s.
 *   - no focus, 1st visit → guided tour (when the listing can produce one).
 *   - tour ✕ / finished, or a repeat visit → free explore, no penalty.
 *
 * §2.3–2.5 (tour stops, hotspot pins, action sheets) all hang off HOTSPOTS,
 * which come from `listing_photos.ai_tags`. On the remote today that column is
 * populated for 10 listings and **zero of the 104 `fmls-import` listings the feed
 * actually serves** (checked 2026-07-27). So this screen renders what is real:
 * hero, stats, description, monthly, comps. The tour and pins appear
 * automatically for any listing that HAS tags — the code path is live, not
 * stubbed — and the backfill (porting `photo_tagger.py` off the banned personal
 * Anthropic key onto Bedrock) is the last step of this phase.
 *
 * No placeholder pins, no "coming soon" sections, no invented captions.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HotspotSheet } from "../../components/listing/HotspotSheet";
import { PriceHistogram } from "../../components/listing/PriceHistogram";
import { TourStop } from "../../components/listing/TourStop";
import { TransitionCard } from "../../components/listing/TransitionCard";
import {
	DEFAULT_ANNUAL_RATE,
	assumptionLabel,
} from "../../lib/listing/assumptions";
import {
	buildHotspots,
	buildListingTour,
	transitionSignals,
} from "../../lib/listing/build-hotspots";
import { useListingDetail } from "../../lib/listing/detail-dto";
import {
	FOCUS_HIGHLIGHT_MS,
	type SectionId,
	parseFocus,
	sectionForFocus,
} from "../../lib/listing/focus-key";
import { buildDistribution } from "../../lib/listing/histogram";
import type { ActionKind, Hotspot } from "../../lib/listing/hotspot";
import { emojiForRoom } from "../../lib/listing/hotspot";
import {
	DEFAULT_DOWN_FRACTION,
	computeMonthly,
	formatUsd,
	parseHoaMonthlyUsd,
} from "../../lib/listing/monthly";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const HERO_HEIGHT = 190;

/**
 * §2.2's three entry modes. `tour` is only ever entered when a tour actually
 * exists AND there is no `?focus=`; everything else lands in `free`.
 */
type Mode = "tour" | "transition" | "free";

export default function ListingExploreScreen() {
	const params = useLocalSearchParams<{ id?: string; focus?: string }>();
	const insets = useSafeAreaInsets();
	const state = useListingDetail(params.id);

	const focus = useMemo(() => parseFocus(params.focus), [params.focus]);
	const focusedSection = focus ? sectionForFocus(focus) : null;

	/**
	 * §2.2: a `?focus=` deep link SKIPS the tour. Held in state (initialised from
	 * the param) rather than derived, because the buyer can leave the tour and
	 * that must not be undone by a re-render.
	 */
	const [mode, setMode] = useState<Mode>(focus ? "free" : "tour");
	const [stopIndex, setStopIndex] = useState(0);
	const [openHotspot, setOpenHotspot] = useState<Hotspot | null>(null);
	const [visitedPins, setVisitedPins] = useState<readonly string[]>([]);

	// §2.1 #2 / §2.2: the landed-on section pulses for 2s, then stays put. A
	// timer, not an animation loop — the highlight is a one-shot cue.
	const [highlight, setHighlight] = useState<SectionId | null>(focusedSection);
	useEffect(() => {
		if (!focusedSection) return;
		setHighlight(focusedSection);
		const t = setTimeout(() => setHighlight(null), FOCUS_HIGHLIGHT_MS);
		return () => clearTimeout(t);
	}, [focusedSection]);

	const scrollRef = useRef<ScrollView>(null);
	const offsets = useRef<Partial<Record<SectionId, number>>>({});
	/** Guards the one-shot deep-link scroll so later layout passes don't re-jump. */
	const scrolledTo = useRef<SectionId | null>(null);

	/**
	 * Records a section's offset and, for the deep-linked one, scrolls to it.
	 *
	 * Driven by `onLayout` rather than an effect because the offset only EXISTS
	 * after layout: an effect would have to depend on the fetch status to re-run
	 * late, which is a proxy for "has it laid out yet" and fires at the wrong
	 * time. `scrolledTo` keeps it one-shot, so a re-layout (rotation, image load)
	 * cannot yank a buyer who has since scrolled away.
	 */
	const onSectionLayout = (id: SectionId) => (y: number) => {
		offsets.current[id] = y;
		if (id !== focusedSection || scrolledTo.current === id) return;
		scrolledTo.current = id;
		scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true });
	};

	if (state.status === "loading") {
		return (
			<View style={styles.center}>
				<Text style={styles.dim}>Loading…</Text>
			</View>
		);
	}

	if (state.status === "missing") {
		return (
			<View style={styles.center}>
				<Text style={styles.title}>This home is no longer listed.</Text>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Text style={styles.backLabel}>← Back</Text>
				</Pressable>
			</View>
		);
	}

	if (state.status === "error") {
		return (
			<View style={styles.center}>
				<Text style={styles.title}>Couldn't load this home.</Text>
				<Text style={styles.dim}>{state.message}</Text>
				<Pressable onPress={state.reload} style={styles.backBtn}>
					<Text style={styles.backLabel}>Try again</Text>
				</Pressable>
			</View>
		);
	}

	const { detail } = state;
	const hero = detail.photos[0];
	const hoaMonthlyUsd = parseHoaMonthlyUsd(detail.hoaRaw);
	const monthly =
		detail.price !== undefined
			? computeMonthly({
					priceUsd: detail.price,
					annualRate: DEFAULT_ANNUAL_RATE,
					...(hoaMonthlyUsd !== undefined ? { hoaMonthlyUsd } : {}),
				})
			: undefined;

	const distribution = buildDistribution({
		pricesUsd: detail.comps.pricesUsd,
		subjectPriceUsd: detail.price ?? 0,
		cohortLabel: detail.comps.cohortLabel,
	});

	/**
	 * §2.3–2.5 inventory. Empty today for every feed listing, because
	 * `listing_photos.ai_tags` is unpopulated for the fmls import — so pins, the
	 * tour, and the sheets simply do not appear rather than appearing empty. The
	 * code path is live: backfilling tags turns all three on with no UI change.
	 */
	const hotspots = buildHotspots(detail.photos, {
		comps: detail.comps,
		...(detail.sqft !== undefined ? { sqft: detail.sqft } : {}),
		...(detail.yearBuilt !== undefined ? { yearBuilt: detail.yearBuilt } : {}),
	});
	const tour = buildListingTour(hotspots, {
		...(detail.sqft !== undefined ? { sqft: detail.sqft } : {}),
		...(detail.beds !== undefined ? { beds: detail.beds } : {}),
		...(detail.yearBuilt !== undefined ? { yearBuilt: detail.yearBuilt } : {}),
	});

	const openSheet = (hotspot: Hotspot) => {
		setOpenHotspot(hotspot);
		// §2.4 #1: a visited pin stops pulsing.
		setVisitedPins((v) => (v.includes(hotspot.id) ? v : [...v, hotspot.id]));
	};

	// §2.6 `action_tap(kind)`. Wired to a no-op sink until the mobile event queue
	// covers listing_explore_events — deliberately a named function so the call
	// sites are already correct rather than needing to be found later.
	const onAction = (_kind: ActionKind) => {};

	/**
	 * §2.2 / §2.3: the guided tour. Rendered INSTEAD of free explore, and only
	 * when a real tour exists — `buildListingTour` returns null unless it can
	 * produce 3 evidence-backed stops, and §2.2 sends that buyer straight to free
	 * explore, which is the same no-penalty path the ✕ takes.
	 */
	if (mode === "tour" && tour) {
		const stop = tour.stops[Math.min(stopIndex, tour.stops.length - 1)];
		if (stop) {
			return (
				<View style={styles.screen}>
					<TourStop
						stop={stop}
						index={stopIndex}
						stopIds={tour.stops.map((s) => s.id)}
						onPrev={() => setStopIndex((i) => Math.max(i - 1, 0))}
						onNext={() => {
							if (stopIndex >= tour.stops.length - 1) {
								setMode("transition");
								return;
							}
							setStopIndex((i) => i + 1);
						}}
						onExit={() => setMode("free")}
						onAction={onAction}
					/>
				</View>
			);
		}
	}

	const stats = [
		detail.beds !== undefined ? `${detail.beds} beds` : null,
		detail.baths !== undefined ? `${detail.baths} baths` : null,
		detail.sqft !== undefined
			? `${detail.sqft.toLocaleString("en-US")} sqft`
			: null,
		detail.yearBuilt !== undefined ? `built ${detail.yearBuilt}` : null,
	]
		.filter((s): s is string => s !== null)
		.join(" · ");

	const sectionStyle = (id: SectionId) => [
		styles.section,
		highlight === id && styles.sectionHighlight,
	];

	return (
		<View style={styles.screen}>
			<ScrollView
				ref={scrollRef}
				contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.hero}>
					{hero ? (
						<Image source={{ uri: hero.url }} style={styles.heroImg} />
					) : (
						<View style={[styles.heroImg, styles.heroEmpty]} />
					)}
					<Pressable
						onPress={() => router.back()}
						hitSlop={10}
						style={[styles.heroBack, { top: insets.top + 8 }]}
					>
						<Text style={styles.heroBackLabel}>←</Text>
					</Pressable>
					{/* §2.4 #1: a pin per hotspot; unvisited ones pulse. Pulse is the
					    ring's opacity, not a scale transform — a scaling pin over a photo
					    reads as a layout jitter on device. */}
					{hotspots.map((hotspot) => (
						<Pressable
							key={hotspot.id}
							onPress={() => openSheet(hotspot)}
							hitSlop={8}
							style={[
								styles.pin,
								{
									left: `${hotspot.pin.x * 100}%`,
									top: `${hotspot.pin.y * 100}%`,
								},
								!visitedPins.includes(hotspot.id) && styles.pinUnvisited,
							]}
						>
							<Text style={styles.pinGlyph}>{emojiForRoom(hotspot.room)}</Text>
						</Pressable>
					))}
				</View>

				<View
					style={sectionStyle("overview")}
					onLayout={(e) => onSectionLayout("overview")(e.nativeEvent.layout.y)}
				>
					<Text style={styles.price}>
						{detail.price !== undefined
							? formatUsd(detail.price)
							: detail.address}
					</Text>
					<Text style={styles.address}>
						{detail.address} · {detail.city}, {detail.state}
					</Text>
					{!!stats && <Text style={styles.stats}>{stats}</Text>}
					{/* §2.2: once the buyer is in free explore and a tour exists, the top
					    of the page keeps a text link back into it. */}
					{mode === "free" && !!tour && (
						<Pressable
							onPress={() => {
								setStopIndex(0);
								setMode("tour");
							}}
							hitSlop={6}
						>
							<Text style={styles.replay}>Replay tour →</Text>
						</Pressable>
					)}
					{detail.description?.map((para) => (
						<Text key={para.slice(0, 32)} style={styles.body}>
							{para}
						</Text>
					))}
				</View>

				{!!monthly && (
					<View
						style={sectionStyle("monthly")}
						onLayout={(e) => onSectionLayout("monthly")(e.nativeEvent.layout.y)}
					>
						<Text style={styles.sectionHead}>MONTHLY</Text>
						<Text
							style={styles.big}
						>{`${formatUsd(monthly.totalUsd)}/mo`}</Text>
						<Text style={styles.dim}>
							{assumptionLabel(DEFAULT_ANNUAL_RATE, DEFAULT_DOWN_FRACTION)}
						</Text>
						<Text style={styles.dim}>
							{`principal & interest ${formatUsd(monthly.principalAndInterestUsd)}`}
							{monthly.hoaMonthlyUsd !== undefined
								? ` · HOA ${formatUsd(monthly.hoaMonthlyUsd)}`
								: ""}
						</Text>
						{/* Says what is NOT in the number, rather than quietly excluding
						    it: taxes and insurance are not in the schema. */}
						<Text style={styles.dim}>
							Taxes and insurance aren't included — we don't have them for this
							home.
						</Text>
					</View>
				)}

				{distribution.kind !== "empty" && (
					<View
						style={sectionStyle("comps")}
						onLayout={(e) => onSectionLayout("comps")(e.nativeEvent.layout.y)}
					>
						<Text style={styles.sectionHead}>COMPS</Text>
						<PriceHistogram distribution={distribution} size="full" />
						{detail.comps.medianPricePerSqft !== undefined && (
							<Text style={styles.dim}>
								{`${detail.comps.cohortLabel} median $${detail.comps.medianPricePerSqft}/sqft · ${detail.comps.medianPricePerSqftSampleSize} listings`}
							</Text>
						)}
					</View>
				)}

				{/* §2.4 #3: one section per hotspot room, each a row that opens the
				    action sheet. Absent entirely when there are no hotspots — no
				    "features coming soon" placeholder. */}
				{hotspots.map((hotspot) => (
					<Pressable
						key={hotspot.id}
						onPress={() => openSheet(hotspot)}
						style={({ pressed }) => [
							styles.section,
							pressed && styles.pressedRow,
						]}
					>
						<Text style={styles.sectionHead}>
							{hotspot.room} {emojiForRoom(hotspot.room)}
						</Text>
						<Text style={styles.stats}>{hotspot.title}</Text>
						<Text style={styles.dim}>
							{`${hotspot.actions.length} actions`}
						</Text>
					</Pressable>
				))}

				{!!detail.hoaRaw && (
					<View
						style={sectionStyle("costs")}
						onLayout={(e) => onSectionLayout("costs")(e.nativeEvent.layout.y)}
					>
						<Text style={styles.sectionHead}>COSTS</Text>
						<Text style={styles.body}>HOA {detail.hoaRaw}</Text>
					</View>
				)}
			</ScrollView>

			{/* §2.4 #4: the commercial endpoint, reachable from any scroll position. */}
			<View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
				<Pressable style={styles.cta}>
					<Text style={styles.ctaLabel}>Schedule a tour</Text>
				</Pressable>
			</View>

			{/* §2.4 #5: an overlay ON free explore, not a route — Continue must resume
			    the same URL at the same scroll position. */}
			{mode === "transition" && !!tour && (
				<TransitionCard
					signals={transitionSignals(tour)}
					onContinue={() => setMode("free")}
				/>
			)}

			{/* Mounted ONLY while open. An always-mounted transparent Modal
			    black-screened the whole feed on iOS in task-1 — see DEVLOG
			    2026-07-27. Do not switch this to a `visible` toggle. */}
			{!!openHotspot && (
				<HotspotSheet
					hotspot={openHotspot}
					onClose={() => setOpenHotspot(null)}
					onAction={onAction}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		padding: 24,
		backgroundColor: colors.bg,
	},
	hero: { height: HERO_HEIGHT, backgroundColor: colors.surface2 },
	heroImg: { width: "100%", height: HERO_HEIGHT },
	heroEmpty: { backgroundColor: colors.surface2 },
	heroBack: {
		position: "absolute",
		left: 16,
		width: 36,
		height: 36,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.glass,
	},
	heroBackLabel: { ...textStyles.headline, color: colors.ink },
	pin: {
		position: "absolute",
		width: 32,
		height: 32,
		marginLeft: -16,
		marginTop: -16,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.glass,
	},
	/** Unvisited pins carry the accent ring (§2.4 #1). */
	pinUnvisited: { borderWidth: 2, borderColor: colors.accent },
	pinGlyph: { fontSize: 16 },
	section: {
		paddingHorizontal: 20,
		paddingVertical: 18,
		gap: 6,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	sectionHighlight: { backgroundColor: colors.surface2 },
	pressedRow: { opacity: 0.75 },
	replay: { ...textStyles.headline, color: colors.accent, marginTop: 6 },
	sectionHead: { ...textStyles.caption, color: colors.accent },
	price: { ...textStyles.title1, color: colors.ink },
	big: { ...textStyles.title1, color: colors.ink },
	address: { ...textStyles.footnote, color: colors.ink2 },
	stats: { ...textStyles.body, color: colors.ink },
	body: { ...textStyles.body, color: colors.ink, marginTop: 4 },
	title: { ...textStyles.title2, color: colors.ink, textAlign: "center" },
	dim: { ...textStyles.footnote, color: colors.ink2 },
	backBtn: {
		minHeight: 44,
		justifyContent: "center",
		paddingHorizontal: 20,
		borderRadius: radii.pill,
		backgroundColor: colors.surface2,
	},
	backLabel: { ...textStyles.headline, color: colors.ink },
	ctaBar: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: 20,
		paddingTop: 12,
		backgroundColor: colors.bg,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	cta: {
		minHeight: 50,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: radii.btn,
		backgroundColor: colors.cta,
	},
	ctaLabel: { ...textStyles.headline, color: colors.bg },
});
