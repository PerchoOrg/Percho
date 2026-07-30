/**
 * The discovery feed (spec-v3 `01-feed.md`) — the app's only main consumption
 * surface, and deliberately THIN.
 *
 * Every decision this screen appears to make is made somewhere pure and tested:
 * what to show is `generateFeed`, what a swipe means is `applySwipe`, whether the
 * funnel advances is `evaluateStageAdvance`, what a gesture may do is
 * `cardBehavior(card).capability`, what a card says is `content.ts`. What is left
 * here is wiring: fetch → compose → render → dispatch. Nothing below picks a
 * threshold, authors a string a card shows, or computes a statistic.
 *
 * The §1.1 red line is satisfied structurally, not by null checks: the gesture
 * layer never sees a card kind at all (capability is data resolved before the
 * gesture is built), and each face is a component over a NARROWED card type, so a
 * faceless kind has no back-face component that could mis-render.
 *
 * `Explore →` on a LISTING card is now wired (task-2): it pushes
 * `/listing/[id]`, and a data-face row pushes the same route with `?focus=<key>`.
 * `Explore →` on a COMMUNITY card is still unwired — that target is task-3, and
 * `CardFoot` renders the button only when given a handler, so omitting it leaves
 * no dead affordance rather than fake navigation (the call PLAN B11 made for
 * `See on map →`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SoundToggle } from "../../components/SoundToggle";
import { type CardRenderArgs, SwipeStack } from "../../components/SwipeStack";
import { AreaFace } from "../../components/cards/AreaFace";
import { AskFace } from "../../components/cards/AskFace";
import { ChallengeFace } from "../../components/cards/ChallengeFace";
import { CommunityFace } from "../../components/cards/CommunityFace";
import { InsightFace } from "../../components/cards/InsightFace";
import { ListingFace } from "../../components/cards/ListingFace";
import { MilestoneFace } from "../../components/cards/MilestoneFace";
import { SwipeLabels } from "../../components/cards/SwipeLabels";
import { TradeoffFace } from "../../components/cards/TradeoffFace";
import { CardSkeleton } from "../../components/feed/CardSkeleton";
import { ExhaustedCard } from "../../components/feed/ExhaustedCard";
import { OfflineBar } from "../../components/feed/OfflineBar";

import { UndoToast } from "../../components/feed/UndoToast";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { cardBehavior } from "../../lib/feed/behavior";
import type { ChallengeCardV3, FeedCardV3 } from "../../lib/feed/card-types";
import { deckKey } from "../../lib/feed/deck-key";
import {
	buildSamplerDeck,
	samplerEnabled,
	samplerLabel,
} from "../../lib/feed/dev-sampler";
import {
	buildGestureEvent,
	buildSkipLayerEvent,
	buildStageEvent,
	buildSwipeEvent,
} from "../../lib/feed/events";
import { generateFeed, insertMilestone } from "../../lib/feed/generate-feed";
import { milestoneFor } from "../../lib/feed/milestone";
import { FIRST_PAGE_SIZE, PREFETCH_DISTANCE } from "../../lib/feed/ratios";
import { evaluateStageAdvance } from "../../lib/feed/stage-advance";
import { useEventQueue } from "../../state/event-queue";
import { useFeedSession } from "../../state/feed-session";
import { useFunnelStore } from "../../state/funnel";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const GUTTER = 16;
/** Card is portrait; capped against viewport height on small devices. */
const CARD_ASPECT = 1.5;
const CARD_MAX_VIEWPORT = 0.74;

export default function FeedScreen() {
	const { width, height } = useWindowDimensions();

	const stage = useFunnelStore((s) => s.stage);
	const stageHydrated = useFunnelStore((s) => s.hydrated);
	const promoteTo = useFunnelStore((s) => s.promoteTo);

	const signals = useFeedSession((s) => s.signals);
	const sessionN = useFeedSession((s) => s.sessionN);
	const sessionHydrated = useFeedSession((s) => s.hydrated);
	const recordSwipe = useFeedSession((s) => s.recordSwipe);
	const undoSwipe = useFeedSession((s) => s.undoSwipe);
	const recordInsightUnsure = useFeedSession((s) => s.recordInsightUnsure);
	const skipLayer = useFeedSession((s) => s.skipLayer);
	const resetStageCounter = useFeedSession((s) => s.resetStageCounter);
	const beginSession = useFeedSession((s) => s.beginSession);

	const enqueue = useEventQueue((s) => s.enqueue);
	const takeSeq = useEventQueue((s) => s.takeSeq);
	const drain = useEventQueue((s) => s.drain);

	// BOTH stores must be read back before a deck is built, or the first render
	// composes a stage-0 deck for a returning stage-3 buyer (§1.7).
	const hydrated = stageHydrated && sessionHydrated;

	const [activeIndex, setActiveIndex] = useState(0);
	const [deck, setDeck] = useState<readonly FeedCardV3[]>([]);

	const [engineExhausted, setEngineExhausted] = useState(false);
	const [undo, setUndo] = useState<{
		card: FeedCardV3;
		label: string;
		/** A milestone inserted by this swipe, if it hasn't been displayed yet. */
		milestoneId?: string;
	} | null>(null);
	const [milestonesShown, setMilestonesShown] = useState<readonly string[]>([]);
	/**
	 * Which challenge cards have been answered, and which side was tapped.
	 *
	 * Not in the session store: a challenge answer is market education, not scope
	 * signal, so there is nothing worth persisting. Keyed by card id rather than
	 * held per-card so the answer survives the card being re-rendered as the deck
	 * shuffles beneath it.
	 */
	const [answered, setAnswered] = useState<Record<string, "left" | "right">>(
		{},
	);
	const rotate = useRef(0);

	/**
	 * The funnel's city scope, derived from real geo signal — the server's stage-3
	 * preview join key. A default city list here would show a buyer previews in a
	 * place they never expressed interest in.
	 */
	const cities = useMemo(
		() =>
			signals.geo
				.filter((g) => g.level === "city" && g.right > g.left)
				.sort((a, b) => b.right - a.right)
				.map((g) => g.unitId),
		[signals.geo],
	);

	const { pool, loading, offline, exhausted, fetchMore, retry } = useFeedPool({
		stage,
		cities,
		likedCommunityIds: signals.likedCommunityIds,
		enabled: hydrated,
	});

	useEffect(() => {
		if (hydrated) beginSession();
	}, [hydrated, beginSession]);

	// §1.9: drain the telemetry queue once the network is back.
	useEffect(() => {
		if (!offline && hydrated) void drain();
	}, [offline, hydrated, drain]);

	/**
	 * Build the deck ONCE per semantic boundary, and only ever APPEND after that.
	 *
	 * `poolRef` rather than a `pool` dep is the whole point. `useFeedPool`
	 * accumulates pages, so every successful prefetch produces a new `pool`
	 * object — and this effect used to depend on it, which rebuilt the entire deck
	 * and reset `activeIndex` to 0 mid-session. On device that read as two
	 * separate bugs: the buyer would half-swipe, see the next card peek out, and a
	 * second later (the prefetch round-trip) watch it be replaced by a different
	 * card; and the reset frame flashed the swipe labels at full opacity, because
	 * the labels remounted on a new top card while `tx` still held the offset from
	 * the gesture that had just finished.
	 *
	 * A new pool must never move the buyer. It only makes MORE cards composable,
	 * which `appendPage` picks up on the next prefetch — so the fix is that the
	 * pool is read, never depended on.
	 *
	 * Signals and seenIds are likewise read imperatively at composition time:
	 * declaring them would rebuild the deck after every swipe.
	 */
	const poolRef = useRef(pool);
	poolRef.current = pool;

	/**
	 * DEV-ONLY recompose trigger, and 0 whenever the sampler is off.
	 *
	 * A number rather than the pool object: the pool is a new object identity on
	 * every merge, so depending on it directly would rebuild the deck on every
	 * pagination — the exact bug `poolRef` exists to avoid.
	 */
	const samplerPoolSize = samplerEnabled()
		? pool.listings.length + pool.communities.length + pool.geoUnits.length
		: 0;

	// biome-ignore lint/correctness/useExhaustiveDependencies: `samplerPoolSize` is a DEV-ONLY recompose trigger, not a value this effect reads directly (it reads `poolRef`). Biome sees no read and calls it unnecessary; without it the sampler deck never recomposes once the pool lands. It is 0 when the sampler is off, so production behaviour is unchanged.
	useEffect(() => {
		if (!hydrated) return;
		const s = useFeedSession.getState();
		/**
		 * DEV SAMPLER (`EXPO_PUBLIC_DEV_SAMPLER=1`): replace the funnel mix with a
		 * flat ~3-per-kind deck, video cards first.
		 *
		 * Off by default and gated on a build-time env var, so it cannot ship
		 * enabled. It bypasses the §1.7 MIX only — every card is still built by the
		 * real constructors from the real pool, and no listing is shown that the
		 * server did not already gate as visible.
		 */
		if (samplerEnabled()) {
			const sampled = buildSamplerDeck({ pool: poolRef.current, stage });
			if (sampled.length > 0) {
				rotate.current = 0;
				setDeck(sampled);
				setEngineExhausted(false);
				setActiveIndex(0);
				return;
			}
			// Pool not in yet — fall through and let the normal path run, and this
			// effect re-fires when the pool arrives.
		}
		const result = generateFeed({
			stage,
			signals: s.signals,
			pool: poolRef.current,
			seenIds: s.seenIds,
			count: FIRST_PAGE_SIZE,
			rotate: 0,
		});
		rotate.current = result.nextRotate;
		setDeck(result.cards);

		setEngineExhausted(result.exhausted);
		setActiveIndex(0);
		// `samplerPoolSize` is a DEV-ONLY dependency: the sampler composes straight
		// from the pool, so it must recompose once the pool lands. It is 0 in normal
		// operation, which keeps the production behaviour (recompose on stage change
		// only) exactly as it was — the pool is deliberately NOT a dependency there,
		// because pagination would otherwise rebuild the deck mid-session.
	}, [hydrated, stage, samplerPoolSize]);

	/**
	 * §1.7 pagination: append from the pool already held, deduped by the deck.
	 *
	 * Reads the deck through a ref for the same reason as the pool: depending on
	 * `deck` re-created this callback on every append, which re-fired the prefetch
	 * effect below, which appended again — a compose loop that only stopped when
	 * the engine ran dry.
	 */
	const deckRef = useRef(deck);
	deckRef.current = deck;

	const appendPage = useCallback(() => {
		const s = useFeedSession.getState();
		const current = deckRef.current;
		const result = generateFeed({
			stage,
			signals: s.signals,
			pool: poolRef.current,
			seenIds: [...s.seenIds, ...current.map((c) => c.id)],
			count: FIRST_PAGE_SIZE,
			rotate: rotate.current,
			milestonesShown,
		});
		rotate.current = result.nextRotate;
		if (result.cards.length === 0) return;
		setDeck((d) => [...d, ...result.cards]);

		setEngineExhausted(result.exhausted);
	}, [stage, milestonesShown]);

	// Prefetch when the active card is 5 from the end (§1.7). Keyed on the
	// DISTANCE to the end rather than on `activeIndex` and `deck.length`
	// separately, so a successful append (which moves both) settles the condition
	// instead of immediately re-satisfying it.
	const remaining = deck.length - activeIndex;
	useEffect(() => {
		if (deck.length === 0) return;
		if (remaining > PREFETCH_DISTANCE) return;
		if (!exhausted) fetchMore();
		appendPage();
	}, [remaining, deck.length, exhausted, fetchMore, appendPage]);

	const onDecision = useCallback(
		(decision: "left" | "right", card: FeedCardV3) => {
			const at = Date.now();
			const index = activeIndex;
			const prevSwipeAt = useFeedSession.getState().lastSwipeAt;

			enqueue(
				buildSwipeEvent({
					seq: takeSeq(),
					at,
					card,
					verdict: decision,
					funnelStage: stage,
					sessionN,
					activeIndex: index,
					...(prevSwipeAt !== undefined ? { prevSwipeAt } : {}),
				}),
			);

			const next = recordSwipe(card, decision, at);
			setActiveIndex(index + 1);

			const target = evaluateStageAdvance(stage, next, {
				units: pool.geoUnits,
			});
			// `promoteTo` is monotonic and returns whether it actually moved — that
			// boolean IS the §1.5 milestone trigger, so a ceremony card cannot fire
			// for a stage the buyer was already past.
			const advanced = target !== null && promoteTo(target);
			let insertedMilestoneId: string | undefined;

			if (advanced && target !== null) {
				enqueue(
					buildStageEvent({
						seq: takeSeq(),
						at,
						type: "stage_advance",
						fromStage: stage,
						toStage: target,
						swipesInStage: next.swipesInStage,
						sessionN,
					}),
				);
				resetStageCounter();

				const milestone = milestoneFor({
					fromStage: stage,
					toStage: target,
					signals: next,
					units: pool.geoUnits,
				});
				if (milestone !== null && !milestonesShown.includes(milestone.id)) {
					// B15: the very next card, not an append at the end of a deck the
					// buyer may never reach.
					setDeck((d) => insertMilestone(d, index, milestone, milestonesShown));
					setMilestonesShown((m) => [...m, milestone.id]);
					insertedMilestoneId = milestone.id;
				}
			}

			// §1.8: undo is offered for listing / community / area only.
			if (cardBehavior(card).undoable) {
				setUndo({
					card,
					label: decision === "right" ? "Liked" : "Passed",
					...(insertedMilestoneId ? { milestoneId: insertedMilestoneId } : {}),
				});
			}
		},
		[
			activeIndex,
			enqueue,
			takeSeq,
			stage,
			sessionN,
			recordSwipe,
			pool.geoUnits,
			promoteTo,
			resetStageCounter,
			milestonesShown,
		],
	);

	const onUndo = useCallback(() => {
		if (!undo) return;
		const restored = undoSwipe(undo.card.id);
		const undone = undo;
		setUndo(null);
		if (restored === null) return;
		setActiveIndex((i) => Math.max(0, i - 1));
		// The STAGE is not reverted — `funnel.ts` is monotonic by design (PLAN B5).
		// But a milestone this swipe inserted and the buyer has not yet reached is
		// removed: a ceremony for a stage they no longer have the evidence for is
		// worse than the asymmetry itself (owner's addition to B5).
		if (undone.milestoneId) {
			const id = undone.milestoneId;
			setDeck((d) => d.filter((c) => c.id !== id));
			setMilestonesShown((m) => m.filter((x) => x !== id));
		}
	}, [undo, undoSwipe]);

	const cardWidth = width - GUTTER * 2;
	const cardHeight = Math.min(
		cardWidth * CARD_ASPECT,
		height * CARD_MAX_VIEWPORT,
	);

	const capability = useCallback(
		(card: FeedCardV3) => cardBehavior(card).capability,
		[],
	);

	const emitGesture = useCallback(
		(type: "explore_tap" | "datapoint_tap", card: FeedCardV3) => {
			enqueue(
				buildGestureEvent({
					seq: takeSeq(),
					at: Date.now(),
					type,
					card,
					funnelStage: stage,
					sessionN,
				}),
			);
		},
		[enqueue, takeSeq, stage, sessionN],
	);

	const renderCard = useCallback(
		(card: FeedCardV3, { role, tx, cardWidth: w }: CardRenderArgs) => {
			const isTop = role === "top";
			switch (card.kind) {
				case "ask":
					return (
						<AskFace
							card={card}
							onSkipTopic={() => {
								skipLayer(card.layer);
								enqueue(
									buildSkipLayerEvent({
										seq: takeSeq(),
										at: Date.now(),
										layer: card.layer,
										funnelStage: stage,
										sessionN,
									}),
								);
								setActiveIndex((i) => i + 1);
							}}
						/>
					);
				case "area":
					return <AreaFace card={card} isTop={isTop} />;
				case "listing":
					return (
						<ListingFace
							card={card}
							stage={stage}
							isTop={isTop}
							/*
							 * Demo variant C puts the Explore CTA on the FRONT face, under the
							 * map circle — which since 2026-07-30 is the ONLY way into the
							 * listing detail page, because the data face that used to carry
							 * it (and its per-row `?focus=` deep links) went with the flip.
							 */
							onExplore={() => {
								emitGesture("explore_tap", card);
								router.push(`/listing/${card.id}`);
							}}
						/>
					);
				case "community":
					return <CommunityFace card={card} isTop={isTop} />;
				case "tradeoff":
					return <TradeoffFace card={card} tx={tx} cardWidth={w} />;
				case "challenge":
					return (
						<ChallengeFace
							card={card}
							chosen={answered[card.id] ?? null}
							onChoose={(side) => {
								setAnswered((a) => ({ ...a, [card.id]: side }));
								emitGesture("datapoint_tap", card);
							}}
							onExplore={() => {
								emitGesture("explore_tap", card);
								// §1.6's challenge is built from a real listing, so "tell me
								// more" navigates to that listing. Task-1 showed the card's own
								// fields in a sheet because this screen did not exist yet.
								if (card.listingId) {
									router.push(`/listing/${card.listingId}`);
								}
							}}
						/>
					);
				case "insight":
					return (
						<InsightFace
							card={card}
							neutralLabel="Not sure"
							onNotSure={() => {
								recordInsightUnsure(card);
								setActiveIndex((i) => i + 1);
							}}
						/>
					);
				case "milestone":
					return (
						<MilestoneFace
							card={card}
							onContinue={() => {
								enqueue(
									buildStageEvent({
										seq: takeSeq(),
										at: Date.now(),
										type: "milestone_cta",
										fromStage: card.fromStage,
										toStage: card.toStage,
										swipesInStage: signals.swipesInStage,
										sessionN,
									}),
								);
								setActiveIndex((i) => i + 1);
							}}
						/>
					);
			}
		},
		[
			stage,
			sessionN,
			signals.swipesInStage,
			answered,
			skipLayer,
			recordInsightUnsure,
			emitGesture,
			enqueue,
			takeSeq,
		],
	);

	const renderOverlay = useCallback(
		(card: FeedCardV3, { tx, cardWidth: w }: CardRenderArgs) => (
			<SwipeLabels card={card} tx={tx} cardWidth={w} />
		),
		[],
	);

	const atEnd = activeIndex >= deck.length;
	// §1.9's terminal card is for a genuinely dry pool, not for a momentary gap:
	// the engine reports exhaustion when every slot had to reuse seen content, and
	// the server reports it has no more inventory. Both, plus nothing left to show.
	const showExhausted = atEnd && (engineExhausted || exhausted) && !loading;

	return (
		<SafeAreaView style={styles.screen} edges={["top"]}>
			{offline && <OfflineBar />}
			{/*
			 * §0.6 #1: the mute control is the feed's only chrome besides the tab
			 * bar. It was previously mounted ONLY on `dev-foundation`, so on device
			 * there was no way to unmute a tour — the reason the owner reported the
			 * videos as having no sound (2026-07-28). Kept out of `stackWrap` so it
			 * sits on the status-bar row rather than over a card.
			 */}
			<View style={styles.chromeRow}>
				<SoundToggle />
			</View>
			{samplerEnabled() && (
				<View style={styles.samplerBar}>
					<Text style={styles.samplerLabel}>{samplerLabel(deck)}</Text>
				</View>
			)}
			<View style={styles.stackWrap}>
				{deck.length === 0 && loading ? (
					<View style={{ width: cardWidth, height: cardHeight }}>
						<CardSkeleton />
					</View>
				) : showExhausted ? (
					<View style={{ width: cardWidth, height: cardHeight }}>
						<ExhaustedCard onAdjustScope={retry} />
					</View>
				) : (
					<SwipeStack
						items={deck}
						activeIndex={activeIndex}
						onDecision={onDecision}
						renderCard={renderCard}
						renderOverlay={renderOverlay}
						keyExtractor={deckKey}
						cardWidth={cardWidth}
						cardHeight={cardHeight}
						capability={capability}
					/>
				)}
			</View>
			{undo && (
				<UndoToast
					label={undo.label}
					onUndo={onUndo}
					onExpire={() => setUndo(null)}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	stackWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
	/** Status-bar row holding the mute toggle, right-aligned (§0.6 #1). */
	chromeRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
		paddingHorizontal: 16,
		paddingTop: 4,
		zIndex: 100,
	},
	/** DEV sampler banner — deliberately loud so it can't be mistaken for prod. */
	samplerBar: {
		paddingVertical: 4,
		paddingHorizontal: 12,
		backgroundColor: colors.accent,
	},
	samplerLabel: { ...textStyles.caption, color: colors.bg },
	sheet: { paddingHorizontal: 20, paddingTop: 8, gap: 8 },
	sheetEyebrow: { ...textStyles.caption, color: colors.accent },
	sheetTitle: { ...textStyles.title2, color: colors.ink },
	sheetPrice: { ...textStyles.display, color: colors.ink },
	sheetBody: { ...textStyles.body, color: colors.ink2 },
});
