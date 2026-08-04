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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PhotoGallery } from "../../components/listing/PhotoGallery";
import { PriceHistogram } from "../../components/listing/PriceHistogram";
import { TourStop } from "../../components/listing/TourStop";
import { TransitionCard } from "../../components/listing/TransitionCard";
import { ValueSlider } from "../../components/listing/ValueSlider";
import {
	DEFAULT_ANNUAL_RATE,
	assumptionLabel,
	formatRate,
} from "../../lib/listing/assumptions";
import {
	buildHotspots,
	buildListingTour,
	transitionSignals,
} from "../../lib/listing/build-hotspots";
import { useListingDetail } from "../../lib/listing/detail-dto";
import {
	buildActionTapEvent,
	buildDatapointFocusEvent,
	buildEvidenceCitedEvent,
	buildHotspotEvent,
	buildSaveFeatureEvent,
	buildTourEvent,
} from "../../lib/listing/explore-events";
import {
	FOCUS_HIGHLIGHT_MS,
	type SectionId,
	parseFocus,
	sectionForFocus,
	serialiseFocus,
} from "../../lib/listing/focus-key";
import { buildGallerySlides } from "../../lib/listing/gallery";
import { buildDistribution } from "../../lib/listing/histogram";
import type { ActionKind, Hotspot } from "../../lib/listing/hotspot";
import { emojiForRoom } from "../../lib/listing/hotspot";
import {
	DEFAULT_DOWN_FRACTION,
	computeMonthly,
	formatUsd,
	parseHoaMonthlyUsd,
} from "../../lib/listing/monthly";
import {
	type NavChip,
	buildNavChips,
	currentNavKey,
	navKey,
} from "../../lib/listing/section-nav";
import { DOWN_SCALE, RATE_SCALE } from "../../lib/listing/slider-scale";
import { useEventQueue } from "../../state/event-queue";
import { useFunnelStore } from "../../state/funnel";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const HERO_HEIGHT = 190;

/**
 * Height of the sticky chip strip. The activation line for "which section am I
 * in" sits just below it, so a heading counts as reached when it clears the
 * chips rather than when it slides under them.
 */
const NAV_H = 46;

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
	/**
	 * The full-photo gallery (2026-08-01). An OVERLAY, not a route, for the same
	 * reason `TransitionCard` is one: dismissing it must return the buyer to this
	 * page at the scroll position they left, and a route push/pop resets that.
	 */
	const [galleryOpen, setGalleryOpen] = useState(false);
	const [visitedPins, setVisitedPins] = useState<readonly string[]>([]);

	/**
	 * §2.4 #3: the calculator's two adjustable inputs. Seeded from the same
	 * defaults the data-face row uses, so the page opens showing the number the
	 * buyer already saw and the sliders explain it rather than contradicting it.
	 */
	const [downFraction, setDownFraction] = useState(DEFAULT_DOWN_FRACTION);
	const [annualRate, setAnnualRate] = useState(DEFAULT_ANNUAL_RATE);

	/** §2.4 #2: which chip is highlighted, driven by scroll position. */
	const [currentKey, setCurrentKey] = useState<string | null>(null);

	// ——— §2.6 telemetry ———
	// The queue and the stage are read once here; every emitter closes over them.
	const enqueue = useEventQueue((s) => s.enqueue);
	const takeSeq = useEventQueue((s) => s.takeSeq);
	const funnelStage = useFunnelStore((s) => s.stage);
	const listingId = params.id ?? "";

	/**
	 * Builds the shared context for an explore event. A function rather than a
	 * memo because `seq` must be reserved AT EMIT TIME — a memoised context would
	 * hand the same seq to every event in a session and destroy server-side dedupe.
	 */
	const ctx = useCallback(
		() => ({
			seq: takeSeq(),
			at: Date.now(),
			funnelStage,
			listingId,
		}),
		[takeSeq, funnelStage, listingId],
	);

	/** Open timestamp of the sheet, so `hotspot_open` can carry real dwell. */
	const sheetOpenedAt = useRef(0);
	/** Stop indices already reported, so a Prev/Next bounce is not a re-view. */
	const viewedStops = useRef<Set<string>>(new Set());

	// §2.1 #2 / §2.2: the landed-on section pulses for 2s, then stays put. A
	// timer, not an animation loop — the highlight is a one-shot cue.
	const [highlight, setHighlight] = useState<SectionId | null>(focusedSection);
	useEffect(() => {
		if (!focusedSection) return;
		setHighlight(focusedSection);
		const t = setTimeout(() => setHighlight(null), FOCUS_HIGHLIGHT_MS);
		return () => clearTimeout(t);
	}, [focusedSection]);

	/**
	 * §2.6 row 5, `datapoint_focus(key)` — which data-face row the buyer tapped
	 * to get here, which decides row ordering in v1.1.
	 *
	 * Emitted HERE rather than at the tap site on the feed card, because the
	 * focus key is a property of the arriving URL: a deep link from anywhere
	 * (share sheet, notification, a future Search result) is the same signal, and
	 * one emitter at the destination cannot be forgotten by a new caller.
	 * Keyed on `params.focus` so re-rendering does not re-report.
	 */
	useEffect(() => {
		if (!focus) return;
		enqueue(
			buildDatapointFocusEvent(ctx(), { focusKey: serialiseFocus(focus) }),
		);
	}, [focus, enqueue, ctx]);

	const scrollRef = useRef<ScrollView>(null);
	/**
	 * Scroll offset per nav key. Keyed by `navKey(...)`, so a fixed section
	 * ("monthly") and a generated room section ("hotspot:<id>") share one map —
	 * the chip strip and the `?focus=` deep link then read the same offsets
	 * instead of two maps that can disagree.
	 */
	const offsets = useRef<Record<string, number | undefined>>({});
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
	const onSectionLayout = (key: string) => (y: number) => {
		offsets.current[key] = y;
		if (key !== focusedSection || scrolledTo.current === focusedSection) return;
		scrolledTo.current = focusedSection;
		scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true });
	};

	/** §2.4 #2: a chip scrolls the page; it does not switch a tab. */
	const scrollToKey = (key: string) => {
		const y = offsets.current[key];
		if (y === undefined) return;
		scrollRef.current?.scrollTo({ y: Math.max(y - NAV_H, 0), animated: true });
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
	/**
	 * Every photo, in `sort_order`. This is the set the owner asked Explore to
	 * show — "浏览所有照片 包括视频里没有的" — so it is deliberately the raw DTO
	 * list, not the video's shot plan (8–14 clips after dedup + quota trim) and
	 * not the hotspot list (tagged, navigable rooms only).
	 */
	const gallerySlides = buildGallerySlides(detail.photos);
	const hoaMonthlyUsd = parseHoaMonthlyUsd(detail.hoaRaw);
	const monthly =
		detail.price !== undefined
			? computeMonthly({
					priceUsd: detail.price,
					// §2.4 #3: the sliders' current values, not the defaults. The data
					// face's row is this same function at the defaults — one formula,
					// two callers, which is why `monthly.ts` is shared and pure.
					annualRate,
					downFraction,
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
		// Start the dwell clock here, not in the sheet: §2.6 measures how long the
		// buyer looked, which begins when it opens, not when it finishes animating.
		sheetOpenedAt.current = Date.now();
		// §2.4 #1: a visited pin stops pulsing.
		setVisitedPins((v) => (v.includes(hotspot.id) ? v : [...v, hotspot.id]));
	};

	/**
	 * §2.6 `hotspot_open(hotspot_id, dwell_ms)`, emitted on CLOSE so the duration
	 * is real. See `explore-events.ts` for why dwell rides the open event rather
	 * than needing a second close row.
	 */
	const closeSheet = () => {
		const hotspot = openHotspot;
		if (hotspot && sheetOpenedAt.current > 0) {
			enqueue(
				buildHotspotEvent(ctx(), {
					hotspotId: hotspot.id,
					dwellMs: Date.now() - sheetOpenedAt.current,
				}),
			);
		}
		sheetOpenedAt.current = 0;
		setOpenHotspot(null);
	};

	/**
	 * §2.6 `action_tap(kind)` plus `save_feature(feature)`.
	 *
	 * Save emits BOTH: the tap belongs in the action distribution (§2.6 row 3
	 * watches for one action taking >70% share), and the saved feature is a
	 * separate profile write (row 4). Collapsing them would lose one or the other.
	 */
	const emitAction = (
		hotspot: Hotspot,
		kind: ActionKind,
		surface: "tour" | "sheet",
	) => {
		enqueue(
			buildActionTapEvent(ctx(), { hotspotId: hotspot.id, kind, surface }),
		);
		if (kind === "save") {
			enqueue(
				buildSaveFeatureEvent(ctx(), {
					hotspotId: hotspot.id,
					// The label the buyer saw, per §2.6 row 4 — not an internal id.
					feature: hotspot.title,
				}),
			);
		}
	};

	/**
	 * §2.2 / §2.3: the guided tour. Rendered INSTEAD of free explore, and only
	 * when a real tour exists — `buildListingTour` returns null unless it can
	 * produce 3 evidence-backed stops, and §2.2 sends that buyer straight to free
	 * explore, which is the same no-penalty path the ✕ takes.
	 */
	if (mode === "tour" && tour) {
		const stop = tour.stops[Math.min(stopIndex, tour.stops.length - 1)];
		if (stop) {
			const total = tour.stops.length;
			const tourCtx = {
				stopIndex,
				stopCount: total,
				stopId: stop.id,
			};
			/**
			 * §2.6 `tour_stop_view` + `evidence_cited`, emitted during RENDER of a
			 * stop the buyer has not seen before.
			 *
			 * In render rather than an effect, deliberately: the guarded set makes
			 * this idempotent, and an effect would need `stop.id` in its dependency
			 * list inside a branch that returns early — a conditional hook, which is
			 * illegal. The set also means Prev/Next bouncing over stop 2 reports one
			 * view, which is what a completion rate needs.
			 */
			if (!viewedStops.current.has(stop.id)) {
				viewedStops.current.add(stop.id);
				enqueue(buildTourEvent(ctx(), { ...tourCtx, type: "tour_stop_view" }));
				// §2.6 row 6: which profile signals actually got put in front of the
				// buyer. Null when the stop cited nothing — impossible today, since
				// `tour.ts` refuses an evidence-free stop, but the guard is the point.
				const cited = buildEvidenceCitedEvent(ctx(), {
					stopId: stop.id,
					evidenceIds: stop.evidence.flatMap((e) => e.sourceIds ?? [e.label]),
				});
				if (cited) enqueue(cited);
			}
			return (
				<View style={styles.screen}>
					<TourStop
						stop={stop}
						index={stopIndex}
						stopIds={tour.stops.map((s) => s.id)}
						onPrev={() => setStopIndex((i) => Math.max(i - 1, 0))}
						onNext={() => {
							if (stopIndex >= total - 1) {
								enqueue(
									buildTourEvent(ctx(), { ...tourCtx, type: "tour_complete" }),
								);
								setMode("transition");
								return;
							}
							setStopIndex((i) => i + 1);
						}}
						onExit={() => {
							// §2.6 row 1: abandon carries the stop it happened AT, which is
							// the drop-off point the completion funnel is measuring.
							enqueue(
								buildTourEvent(ctx(), { ...tourCtx, type: "tour_abandoned" }),
							);
							setMode("free");
						}}
						onAction={(kind) => emitAction(stop.hotspot, kind, "tour")}
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

	/**
	 * §2.4 #2's chip row. Built from what this page actually renders, using the
	 * SAME conditions as the JSX below — the flags are read from the same
	 * expressions, not re-derived, so a chip cannot outlive its section.
	 */
	const navChips: NavChip[] = buildNavChips({
		hotspots,
		hasMonthly: !!monthly,
		hasComps: distribution.kind !== "empty",
		hasCosts: !!detail.hoaRaw,
		// Community is 03's screen; the section is not on this page yet, so no chip.
		hasCommunity: false,
	});
	const activeKey = currentKey ?? navChips[0]?.key ?? null;

	return (
		<View style={styles.screen}>
			<ScrollView
				ref={scrollRef}
				contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
				showsVerticalScrollIndicator={false}
				/**
				 * The chip strip is child index 1 (the hero is 0), so it scrolls up
				 * with the hero and then PINS — §2.4 #2 wants it reachable from any
				 * scroll position without stealing height at the top of the page.
				 * `stickyHeaderIndices` rather than an absolutely positioned bar
				 * because an overlay would sit on top of the hero and its ← button.
				 */
				stickyHeaderIndices={navChips.length > 0 ? [1] : undefined}
				// 16/s is enough for a highlight that tracks headings and cheap
				// enough not to fight the scroll: this handler only recomputes which
				// chip is current from offsets already measured.
				scrollEventThrottle={64}
				onScroll={(e) =>
					setCurrentKey(
						currentNavKey(
							navChips,
							offsets.current,
							e.nativeEvent.contentOffset.y,
							NAV_H + 8,
						),
					)
				}
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
					{/*
					 * The gallery entry point, bottom-right of the hero.
					 *
					 * This is where the photo count went when the swipe card's hero pill
					 * was removed (2026-08-01). On the card that pill sat over playing
					 * video and cost immersion for no gain; here it is the affordance
					 * that answers "can I see the rest?", on a still image, on a screen
					 * the buyer navigated to on purpose. Same information, the surface
					 * where it is an action rather than a decoration.
					 *
					 * `> 1` because "1 Photo" is not worth a button — the hero already
					 * IS that photo.
					 */}
					{gallerySlides.length > 1 && (
						<Pressable
							onPress={() => setGalleryOpen(true)}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel={`View all ${gallerySlides.length} photos`}
							style={({ pressed }) => [
								styles.galleryBtn,
								pressed && styles.pressedRow,
							]}
						>
							<Text style={styles.galleryLabel}>
								{`⊞  All ${gallerySlides.length} photos`}
							</Text>
						</Pressable>
					)}
				</View>

				{/*
				 * §2.4 #2: a horizontally scrolling chip row. Scrolls the page, does
				 * NOT switch a tab — this is one long page and the chips are jumps
				 * within it. Rendered as an empty View (not null) when there are no
				 * chips, so `stickyHeaderIndices`'s child index stays valid.
				 */}
				{navChips.length > 0 ? (
					<View style={styles.navBar}>
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={styles.navRow}
						>
							{navChips.map((chip) => {
								const active = chip.key === activeKey;
								return (
									<Pressable
										key={chip.key}
										onPress={() => scrollToKey(chip.key)}
										style={({ pressed }) => [
											styles.chip,
											active && styles.chipActive,
											pressed && styles.pressedRow,
										]}
									>
										<Text
											style={[
												styles.chipLabel,
												active && styles.chipLabelActive,
											]}
										>
											{chip.label}
										</Text>
									</Pressable>
								);
							})}
						</ScrollView>
					</View>
				) : (
					<View />
				)}

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
							{/* The label must follow the SLIDERS, not the defaults — a
							    disclosure that says "assumes 6.5%" under a payment
							    computed at 8% is worse than no disclosure. */}
							{assumptionLabel(annualRate, downFraction)}
						</Text>
						<Text style={styles.dim}>
							{`principal & interest ${formatUsd(monthly.principalAndInterestUsd)}`}
							{monthly.hoaMonthlyUsd !== undefined
								? ` · HOA ${formatUsd(monthly.hoaMonthlyUsd)}`
								: ""}
						</Text>
						{/* §2.4 #3: "Monthly section = 可调计算器(down %、rate,滑杆)". */}
						<ValueSlider
							label="Down payment"
							valueLabel={`${Math.round(downFraction * 100)}% · ${formatUsd(monthly.downPaymentUsd)}`}
							value={downFraction}
							scale={DOWN_SCALE}
							onChange={setDownFraction}
							a11yLabel="Down payment percentage"
						/>
						<ValueSlider
							label="Interest rate"
							valueLabel={formatRate(annualRate)}
							value={annualRate}
							scale={RATE_SCALE}
							onChange={setAnnualRate}
							a11yLabel="Annual interest rate"
						/>
						{annualRate !== DEFAULT_ANNUAL_RATE && (
							<Pressable onPress={() => setAnnualRate(DEFAULT_ANNUAL_RATE)}>
								<Text style={styles.replay}>Reset to published rate</Text>
							</Pressable>
						)}
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
						// Registers this section's offset under the same key its chip
						// carries, which is what makes the chip able to scroll here.
						onLayout={(e) =>
							onSectionLayout(
								navKey({ kind: "hotspot", id: hotspot.id, room: hotspot.room }),
							)(e.nativeEvent.layout.y)
						}
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

			{/*
			 * The full-photo gallery. Mounted ONLY while open, following the same
			 * rule the HotspotSheet note below records: a permanently-mounted
			 * full-screen overlay black-screened the feed on iOS. This one is a plain
			 * absolutely-positioned View rather than a Modal, so it cannot repeat
			 * that failure, but conditional mounting also means a 40-photo listing
			 * pays nothing until the buyer asks for the photos.
			 */}
			{galleryOpen && (
				<PhotoGallery
					slides={gallerySlides}
					onClose={() => setGalleryOpen(false)}
				/>
			)}

			{/* Mounted ONLY while open. An always-mounted transparent Modal
			    black-screened the whole feed on iOS in task-1 — see DEVLOG
			    2026-07-27. Do not switch this to a `visible` toggle. */}
			{!!openHotspot && (
				<HotspotSheet
					hotspot={openHotspot}
					onClose={closeSheet}
					onAction={(kind) => emitAction(openHotspot, kind, "sheet")}
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
	/**
	 * The "All N photos" button, bottom-right of the hero. `glass` is the §0.3
	 * token for a light control laid over a photo — the same one the hero's ←
	 * uses, so the two read as one control layer rather than two designs.
	 */
	galleryBtn: {
		position: "absolute",
		right: 12,
		bottom: 12,
		minHeight: 34,
		justifyContent: "center",
		paddingHorizontal: 12,
		borderRadius: radii.pill,
		backgroundColor: colors.glass,
	},
	galleryLabel: { ...textStyles.footnote, color: colors.ink },
	section: {
		paddingHorizontal: 20,
		paddingVertical: 18,
		gap: 6,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	sectionHighlight: { backgroundColor: colors.surface2 },
	pressedRow: { opacity: 0.75 },
	/**
	 * The sticky chip strip. Opaque `bg` is required, not cosmetic: a sticky
	 * header with a transparent background lets the content scroll through it.
	 */
	navBar: {
		height: NAV_H,
		justifyContent: "center",
		backgroundColor: colors.bg,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	navRow: { paddingHorizontal: 20, gap: 8, alignItems: "center" },
	chip: {
		minHeight: 30,
		justifyContent: "center",
		paddingHorizontal: 12,
		borderRadius: radii.pill,
		backgroundColor: colors.surface2,
	},
	chipActive: { backgroundColor: colors.accent },
	chipLabel: { ...textStyles.footnote, color: colors.ink2 },
	chipLabelActive: { color: colors.bg },
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
