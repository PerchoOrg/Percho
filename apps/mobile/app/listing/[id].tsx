/**
 * Listing explore page (phase119 redesign) — `/listing/[id]`.
 *
 * The owner's `percho-explore-reference.html` is the visual truth source; the
 * accompanying spec's one-line brief for this page: answer "does this home fit
 * ME", not "here are the MLS fields". Structure, top to bottom:
 *
 *   MediaCarousel   video slide 0 + every photo, room-jump strip
 *   Headline        price / specs / address / days·$psf·built
 *   FitCard         ★ locally-derived match & trade-off rows (`lib/listing/fit`)
 *   CostBlock       monthly payment split, stated assumptions
 *   RoiBlock        "if you rented it out" on the same figures (phase D)
 *   SchoolsBlock    nearest public school per level, state proficiency (phase D)
 *   FactsBlock      ≤6 real fields; the long tail is P1's Ask entry
 *   CompareRail     this home next to the buyer's SAVES (not recommendations)
 *   ActionDock      ✕ / ♡ / Request a tour
 *
 * Every section can be independently absent (fit underivable → no card; no
 * saves → no rail; no price → no cost) — absence over placeholder, always.
 *
 * This replaced the tour/hotspot explore page (owner decision 2026-08-23,
 * "直接替换"). The tour machinery (`TourStop`, `HotspotSheet`, `build-hotspots`)
 * stays in the repo unmounted; `?focus=` deep links land here harmlessly as
 * plain opens (no live caller emits them today).
 */
import type { InsightTheme } from "@percho/shared/insights";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Linking,
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionDock } from "../../components/listing/explore/ActionDock";
import {
	type AppBarTab,
	CollapsedAppBar,
} from "../../components/listing/explore/CollapsedAppBar";
import { CompareRail } from "../../components/listing/explore/CompareRail";
import { CostBlock } from "../../components/listing/explore/CostBlock";
import { FactsBlock } from "../../components/listing/explore/FactsBlock";
import { FitCard } from "../../components/listing/explore/FitCard";
import { InsightRail } from "../../components/listing/explore/InsightRail";
import { MediaCarousel } from "../../components/listing/explore/MediaCarousel";
import { PhotoGrid } from "../../components/listing/explore/PhotoGrid";
import { PhotoViewer } from "../../components/listing/explore/PhotoViewer";
import { RoiBlock } from "../../components/listing/explore/RoiBlock";
import { SchoolsBlock } from "../../components/listing/explore/SchoolsBlock";
import { TourRequestSheet } from "../../components/listing/explore/TourRequestSheet";
import { assumptionLine, buildCost } from "../../lib/listing/cost";
import { useListingDetail } from "../../lib/listing/detail-dto";
import {
	buildDockActionEvent,
	buildExploreOpenEvent,
	buildFitDwellEvent,
	buildInsightFocusEvent,
	buildInsightSourceTapEvent,
	buildInsightVerifyTapEvent,
	buildMediaSwipeEvent,
	buildPhotoFullscreenEvent,
	buildRoomJumpEvent,
	buildTradeoffVoteEvent,
} from "../../lib/listing/explore-events";
import { buildFacts } from "../../lib/listing/facts";
import { deriveFit } from "../../lib/listing/fit";
import { rankInsights, summarizeKinds } from "../../lib/listing/insights";
import {
	DEFAULT_DOWN_FRACTION,
	formatUsd,
	parseHoaMonthlyUsd,
} from "../../lib/listing/monthly";
import { useRates } from "../../lib/listing/rates";
import { buildRoomGroups } from "../../lib/listing/rooms";
import { useListingSummaries } from "../../lib/listing/summaries";
import { useAuthStore } from "../../state/auth";
import { useEventQueue } from "../../state/event-queue";
import { useFeedSession } from "../../state/feed-session";
import { useFunnelStore } from "../../state/funnel";
import { useInsightAffinity } from "../../state/insight-affinity";
import { useSavedStore } from "../../state/saved";
import { explore, fonts } from "../../theme/tokens";

/** Scroll offset (pt below a section's top) a tab jump lands at. */
const TAB_LANDING = 96;

/**
 * The feed's geo-unit id for a city — MUST mirror the server's `citySlug`
 * (`app/api/mobile/feed/route.ts`), because `SignalState.geo` is keyed by it.
 */
function cityGeoUnitId(city: string, state: string): string {
	return `city:${`${city}-${state}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")}`;
}

export default function ListingExploreScreen() {
	const params = useLocalSearchParams<{ id?: string }>();
	const insets = useSafeAreaInsets();
	const { width, height: screenH } = useWindowDimensions();
	const state = useListingDetail(params.id);
	const rate = useRates();

	// Reference §3.1: clamp(340, screenHeight * 0.46, 460) — 388pt on iPhone 15.
	const heroH = Math.min(Math.max(340, screenH * 0.46), 460);

	// ——— stores ———
	const enqueue = useEventQueue((s) => s.enqueue);
	const takeSeq = useEventQueue((s) => s.takeSeq);
	const funnelStage = useFunnelStore((s) => s.stage);
	const savedItems = useSavedStore((s) => s.items);
	const toggleSaved = useSavedStore((s) => s.toggle);
	const insightAffinity = useInsightAffinity((s) => s.focus);
	const bumpInsightAffinity = useInsightAffinity((s) => s.bump);
	const seenListingCount = useFeedSession((s) => s.seenListingIds.length);
	const geoSignals = useFeedSession((s) => s.signals.geo);

	const listingId = params.id ?? "";

	/** Shared event context. A function so `seq` is reserved at emit time. */
	const ctx = useCallback(
		() => ({
			seq: takeSeq(),
			at: Date.now(),
			funnelStage,
			listingId,
		}),
		[takeSeq, funnelStage, listingId],
	);

	/** §5 `explore_open` — once per arrival, not per render. */
	useEffect(() => {
		if (!listingId) return;
		enqueue(buildExploreOpenEvent(ctx()));
	}, [listingId, enqueue, ctx]);

	// ——— saves → summaries (rail + fit inputs). Listing saves only: the v2
	// store also holds communities, which no listing endpoint can resolve. ———
	const savedListingIds = savedItems
		.filter((item) => item.kind === "listing")
		.map((item) => item.id);
	const summaries = useListingSummaries(savedListingIds);

	// ——— overlays ———
	const [viewerIndex, setViewerIndex] = useState<number | null>(null);
	const [gridOpen, setGridOpen] = useState(false);
	const [tourOpen, setTourOpen] = useState(false);

	// ——— vote (optimistic; the offline-durable queue reports behind it) ———
	const [vote, setVote] = useState<"worth" | "not" | null>(null);

	// ——— scroll bookkeeping: app bar, tabs, fit dwell ———
	const scrollRef = useRef<ScrollView>(null);
	const [barVisible, setBarVisible] = useState(false);
	const [activeTab, setActiveTab] = useState<string | null>(null);
	const offsets = useRef<Record<string, number | undefined>>({});

	const fitSpan = useRef<{ y: number; h: number } | null>(null);
	const fitShownAt = useRef<number | null>(null);
	const fitDwellMs = useRef(0);

	const settleFitDwell = useCallback((visible: boolean) => {
		const now = Date.now();
		if (visible && fitShownAt.current === null) fitShownAt.current = now;
		if (!visible && fitShownAt.current !== null) {
			fitDwellMs.current += now - fitShownAt.current;
			fitShownAt.current = null;
		}
	}, []);

	/**
	 * §5 `fit_dwell`, emitted once when the page is left. The emitter lives in
	 * a ref so the unmount effect can stay mount-scoped without closing over a
	 * stale `ctx` (the same staleness class DEVLOG 2026-08-23 records).
	 */
	const emitFitDwell = useRef(() => {});
	emitFitDwell.current = () => {
		settleFitDwell(false);
		const e = buildFitDwellEvent(ctx(), { ms: fitDwellMs.current });
		if (e) enqueue(e);
	};
	useEffect(() => () => emitFitDwell.current(), []);

	const handleScroll = (y: number) => {
		setBarVisible(y > heroH - 120);
		// Which tab: the last section whose top has cleared the bar.
		let current: string | null = null;
		for (const id of ["home", "cost"]) {
			const top = offsets.current[id];
			if (top !== undefined && top - 140 <= y) current = id;
		}
		setActiveTab(current);
		// Fit dwell: visible while any part of the card is inside the viewport.
		const span = fitSpan.current;
		if (span) settleFitDwell(span.y < y + screenH && span.y + span.h > y);
	};

	const scrollToTab = (id: string) => {
		const y = offsets.current[id];
		if (y === undefined) return;
		scrollRef.current?.scrollTo({
			y: Math.max(y - TAB_LANDING, 0),
			animated: true,
		});
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
				<Text style={styles.centerTitle}>This home is no longer listed.</Text>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Text style={styles.backLabel}>← Back</Text>
				</Pressable>
			</View>
		);
	}

	if (state.status === "error") {
		return (
			<View style={styles.center}>
				<Text style={styles.centerTitle}>Couldn't load this home.</Text>
				<Text style={styles.dim}>{state.message}</Text>
				<Pressable onPress={state.reload} style={styles.backBtn}>
					<Text style={styles.backLabel}>Try again</Text>
				</Pressable>
			</View>
		);
	}

	const { detail } = state;
	const saved = savedItems.some((item) => item.id === detail.id);
	const rooms = buildRoomGroups(detail.photos);

	// Saves other than this home — comparing a home to itself teaches nothing.
	const otherSaves = summaries.filter((s) => s.id !== detail.id);

	const citySignal = geoSignals.find(
		(g) => g.unitId === cityGeoUnitId(detail.city, detail.state),
	);
	const fit = deriveFit({
		...(detail.price !== undefined ? { price: detail.price } : {}),
		...(detail.sqft !== undefined ? { sqft: detail.sqft } : {}),
		...(detail.beds !== undefined ? { beds: detail.beds } : {}),
		city: detail.city,
		saves: otherSaves,
		seenListingCount,
		...(citySignal
			? { citySignal: { right: citySignal.right, left: citySignal.left } }
			: {}),
	});

	const hoaMonthlyUsd = parseHoaMonthlyUsd(detail.hoaRaw);
	const cost =
		detail.price !== undefined
			? buildCost({
					priceUsd: detail.price,
					annualRate: rate.annualRate,
					downFraction: DEFAULT_DOWN_FRACTION,
					...(hoaMonthlyUsd !== undefined ? { hoaMonthlyUsd } : {}),
				})
			: null;

	const facts = buildFacts(detail);
	// "After you move in" (phase130): approved cards, ranked by weight and this
	// buyer's theme affinity. Empty → the section is absent.
	const insights = rankInsights(detail.insights ?? [], insightAffinity);
	const insightSummary = summarizeKinds(insights);

	const specs = [
		detail.beds !== undefined ? `${detail.beds} bd` : null,
		detail.baths !== undefined ? `${detail.baths} ba` : null,
		detail.sqft !== undefined
			? `${detail.sqft.toLocaleString("en-US")} sqft`
			: null,
	]
		.filter((s): s is string => s !== null)
		.join(" · ");

	const pricePerSqft =
		detail.price !== undefined && detail.sqft !== undefined && detail.sqft > 0
			? Math.round(detail.price / detail.sqft)
			: undefined;

	const tabs: AppBarTab[] = [
		{ id: "home", label: "HOME" },
		...(cost ? [{ id: "cost", label: "COST" }] : []),
	];

	const priceTitle =
		detail.price !== undefined ? formatUsd(detail.price) : detail.address;
	const barTitle =
		detail.beds !== undefined
			? `${priceTitle} · ${detail.beds} bd`
			: priceTitle;

	const toggleSave = (surface: "dock" | "hero") => {
		const nowSaved = toggleSaved(detail.id, "listing");
		if (surface === "dock") {
			enqueue(
				buildDockActionEvent(ctx(), { action: nowSaved ? "save" : "unsave" }),
			);
		}
	};

	const sectionLayout = (id: string) => (y: number) => {
		offsets.current[id] = y;
	};

	return (
		<View style={styles.screen}>
			<ScrollView
				ref={scrollRef}
				contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
				showsVerticalScrollIndicator={false}
				scrollEventThrottle={64}
				onScroll={(e) => handleScroll(e.nativeEvent.contentOffset.y)}
			>
				<MediaCarousel
					width={width}
					height={heroH}
					{...(detail.video ? { video: detail.video } : {})}
					photos={detail.photos}
					rooms={rooms}
					saved={saved}
					onBack={() => router.back()}
					onToggleSave={() => toggleSave("hero")}
					{...(detail.shareUrl
						? {
								onShare: () => {
									Share.share({
										message: `${detail.address}, ${detail.city} — ${detail.shareUrl}`,
										url: detail.shareUrl,
									}).catch(() => {});
								},
							}
						: {})}
					onOpenGrid={() => setGridOpen(true)}
					onOpenViewer={(photoIndex) => {
						setViewerIndex(photoIndex);
						enqueue(
							buildPhotoFullscreenEvent(ctx(), {
								index: photoIndex,
								room: rooms.keyByIndex[photoIndex] ?? "other",
							}),
						);
					}}
					onSlideChange={(index, room, dwellMs) =>
						enqueue(buildMediaSwipeEvent(ctx(), { index, room, dwellMs }))
					}
					onRoomJump={(room) => enqueue(buildRoomJumpEvent(ctx(), { room }))}
				/>

				{/* ——— Headline (§3.3) ——— */}
				<View
					style={styles.section}
					onLayout={(e) => sectionLayout("home")(e.nativeEvent.layout.y)}
				>
					<View style={styles.headline}>
						<Text style={styles.price}>{priceTitle}</Text>
						{!!specs && <Text style={styles.specs}>{specs}</Text>}
					</View>
					<Text style={styles.address}>
						{detail.address} · {detail.city}, {detail.state}
						{detail.zip ? ` ${detail.zip}` : ""}
					</Text>
					{(detail.daysOnMarket !== undefined ||
						pricePerSqft !== undefined ||
						detail.yearBuilt !== undefined) && (
						<View style={styles.meta}>
							{detail.daysOnMarket !== undefined && (
								<Text style={styles.metaItem}>
									<Text style={styles.metaStrong}>{detail.daysOnMarket}</Text>
									{" days listed"}
								</Text>
							)}
							{pricePerSqft !== undefined && (
								<Text style={styles.metaItem}>
									<Text style={styles.metaStrong}>{`$${pricePerSqft}`}</Text>
									/sqft
								</Text>
							)}
							{detail.yearBuilt !== undefined && (
								<Text style={styles.metaItem}>
									Built{" "}
									<Text style={styles.metaStrong}>{detail.yearBuilt}</Text>
								</Text>
							)}
						</View>
					)}
				</View>

				{/* ——— FitCard (§3.4) — absent when underivable, never faked ——— */}
				{fit && (
					<View
						style={styles.section}
						onLayout={(e) => {
							fitSpan.current = {
								y: e.nativeEvent.layout.y,
								h: e.nativeEvent.layout.height,
							};
						}}
					>
						<FitCard
							fit={fit}
							vote={vote}
							onVote={(value) => {
								setVote(value);
								if (fit.question) {
									enqueue(
										buildTradeoffVoteEvent(ctx(), {
											axis: fit.question.axis,
											value,
										}),
									);
								}
							}}
						/>
					</View>
				)}

				{/* ——— Cost (§3.7) ——— */}
				{cost && (
					<View
						style={[styles.section, styles.sectionRuled]}
						onLayout={(e) => sectionLayout("cost")(e.nativeEvent.layout.y)}
					>
						<Text style={styles.eyebrow}>WHAT YOU'D ACTUALLY PAY</Text>
						<CostBlock
							cost={cost}
							assumptionLine={assumptionLine({
								downFraction: DEFAULT_DOWN_FRACTION,
								annualRate: rate.annualRate,
								rateAsOf: rate.asOf,
							})}
						/>
					</View>
				)}

				{/* ——— ROI (phase D) — same cost figures, rent is the buyer's input ——— */}
				{cost && detail.price !== undefined && (
					<View style={[styles.section, styles.sectionRuled]}>
						<Text style={styles.eyebrow}>IF YOU RENTED IT OUT</Text>
						<RoiBlock
							priceUsd={detail.price}
							downFraction={DEFAULT_DOWN_FRACTION}
							cost={cost}
							{...(detail.rentEstimate
								? { rentEstimate: detail.rentEstimate }
								: {})}
						/>
					</View>
				)}

				{/* ——— Schools (phase D) — absent when the home has no coordinate ——— */}
				{detail.schools && detail.schools.length > 0 && (
					<View style={[styles.section, styles.sectionRuled]}>
						<Text style={styles.eyebrow}>SCHOOLS</Text>
						<SchoolsBlock schools={detail.schools} />
					</View>
				)}

				{/* ——— After you move in (phase130) — absent when no approved card ——— */}
				{insights.length > 0 && (
					<View style={[styles.section, styles.sectionRuled]}>
						<Text style={styles.eyebrow}>AFTER YOU MOVE IN</Text>
						<InsightRail
							insights={insights}
							summary={insightSummary}
							onFocus={(card, index) => {
								bumpInsightAffinity(card.theme as InsightTheme);
								enqueue(
									buildInsightFocusEvent(ctx(), {
										insightId: card.id,
										index,
										theme: card.theme,
									}),
								);
							}}
							onVerify={(card) =>
								enqueue(
									buildInsightVerifyTapEvent(ctx(), { insightId: card.id }),
								)
							}
							onSource={(card, basisIndex, url) => {
								enqueue(
									buildInsightSourceTapEvent(ctx(), {
										insightId: card.id,
										basisIndex,
									}),
								);
								Linking.openURL(url).catch(() => {});
							}}
						/>
					</View>
				)}

				{/* ——— Facts (§3.8) ——— */}
				{facts.length > 0 && (
					<View style={[styles.section, styles.sectionRuled]}>
						<Text style={styles.eyebrow}>THE REST OF IT</Text>
						<FactsBlock facts={facts} />
					</View>
				)}

				{/* ——— Compare (§3.9) — saves only, never recommendations ——— */}
				{otherSaves.length > 0 && (
					<View style={[styles.section, styles.sectionRuled]}>
						<Text style={styles.eyebrow}>NEXT TO WHAT YOU'VE SAVED</Text>
						<CompareRail
							current={{
								...(detail.price !== undefined ? { price: detail.price } : {}),
								city: detail.city,
								...(detail.photos[0] ? { thumbUrl: detail.photos[0].url } : {}),
							}}
							saves={otherSaves}
						/>
					</View>
				)}

				{/* ——— Trust line (phase D) — copy pending owner review ——— */}
				<View style={[styles.section, styles.sectionRuled]}>
					<Text style={styles.trust}>
						Percho doesn't take placement fees. No home, agent or neighbourhood
						pays to appear here or to rank higher; what you see is ordered by
						what you've told us you care about. Figures name their source, and
						anything we can't source stays blank.
					</Text>
				</View>
			</ScrollView>

			<CollapsedAppBar
				visible={barVisible}
				title={barTitle}
				subtitle={`${detail.address}, ${detail.city}`}
				saved={saved}
				tabs={tabs}
				activeTab={activeTab ?? tabs[0]?.id ?? null}
				onTab={scrollToTab}
				onBack={() => router.back()}
				onToggleSave={() => toggleSave("hero")}
			/>

			<ActionDock
				saved={saved}
				bottomInset={insets.bottom}
				onPass={() => {
					enqueue(buildDockActionEvent(ctx(), { action: "pass" }));
					router.back();
				}}
				onToggleSave={() => toggleSave("dock")}
				onTour={() => {
					enqueue(buildDockActionEvent(ctx(), { action: "tour" }));
					// Same gate as saving: a tour request is contact, and the
					// sheet prefills from the account.
					if (!useAuthStore.getState().session) {
						router.push("/auth");
						return;
					}
					setTourOpen(true);
				}}
			/>

			{/* Overlays — mounted only while open (see DEVLOG 2026-07-27). */}
			{gridOpen && (
				<PhotoGrid
					photos={detail.photos}
					rooms={rooms}
					onClose={() => setGridOpen(false)}
					onPick={(photoIndex) => {
						setGridOpen(false);
						setViewerIndex(photoIndex);
						enqueue(
							buildPhotoFullscreenEvent(ctx(), {
								index: photoIndex,
								room: rooms.keyByIndex[photoIndex] ?? "other",
							}),
						);
					}}
				/>
			)}
			{tourOpen && (
				<TourRequestSheet
					listingId={detail.id}
					address={detail.address}
					onClose={() => setTourOpen(false)}
				/>
			)}

			{viewerIndex !== null && (
				<PhotoViewer
					photos={detail.photos}
					rooms={rooms}
					initialIndex={viewerIndex}
					onClose={() => setViewerIndex(null)}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: explore.bg },
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		padding: 24,
		backgroundColor: explore.bg,
	},
	centerTitle: {
		fontSize: 17,
		fontWeight: "700",
		color: explore.ink,
		textAlign: "center",
		fontFamily: fonts.ui,
	},
	dim: { fontSize: 13, color: explore.ink2, fontFamily: fonts.ui },
	backBtn: {
		minHeight: 44,
		justifyContent: "center",
		paddingHorizontal: 20,
		borderRadius: 999,
		backgroundColor: explore.chip,
	},
	backLabel: {
		fontSize: 15,
		fontWeight: "600",
		color: explore.ink,
		fontFamily: fonts.ui,
	},
	section: { paddingHorizontal: 18, paddingVertical: 20 },
	sectionRuled: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: explore.line,
	},
	eyebrow: {
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 1.5,
		color: explore.muted,
		marginBottom: 12,
		fontFamily: fonts.ui,
	},
	trust: {
		fontSize: 11.5,
		lineHeight: 17,
		color: explore.ink2,
		fontFamily: fonts.ui,
	},
	headline: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 10,
	},
	price: {
		fontSize: 32,
		fontWeight: "700",
		letterSpacing: -1.1,
		color: explore.ink,
		fontFamily: fonts.ui,
		fontVariant: ["tabular-nums"],
	},
	specs: {
		fontSize: 13,
		fontWeight: "600",
		color: explore.ink2,
		fontFamily: fonts.ui,
	},
	address: {
		fontSize: 13,
		color: explore.muted,
		marginTop: 7,
		fontFamily: fonts.ui,
	},
	meta: { flexDirection: "row", gap: 16, marginTop: 13 },
	metaItem: { fontSize: 11.5, color: explore.ink2, fontFamily: fonts.ui },
	metaStrong: { fontWeight: "600", color: explore.ink },
});
