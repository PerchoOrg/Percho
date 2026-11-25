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
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	Image,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
	type CardRenderArgs,
	type SwipeHintHandle,
	SwipeStack,
} from "../../components/SwipeStack";
import { AreaFace } from "../../components/cards/AreaFace";
import {
	CHAPTER_TAP_TARGET,
	CommunityFace,
} from "../../components/cards/CommunityFace";
import {
	EXPLORE_TAP_TARGET,
	ListingFace,
	SAVE_TAP_TARGET,
} from "../../components/cards/ListingFace";
import { SwipeLabels } from "../../components/cards/SwipeLabels";
import { TradeoffFace } from "../../components/cards/TradeoffFace";
import { CardSkeleton } from "../../components/feed/CardSkeleton";
import { ExhaustedCard } from "../../components/feed/ExhaustedCard";
import { OfflineBar } from "../../components/feed/OfflineBar";
import { PlaceBlock } from "../../components/feed/PlaceBlock";
import { useCfScores } from "../../hooks/use-cf-scores";
import { useFeedPool } from "../../hooks/use-feed-pool";
import { cardBehavior } from "../../lib/feed/behavior";
import type { FeedCardV3 } from "../../lib/feed/card-types";
import { cityFilmCard } from "../../lib/feed/city-film-card";
import { deckKey } from "../../lib/feed/deck-key";
import { buildSamplerDeck, samplerEnabled } from "../../lib/feed/dev-sampler";
import { buildGestureEvent, buildSwipeEvent } from "../../lib/feed/events";
import { cardPoster } from "../../lib/feed/first-poster";
import {
	RERANK_HOLD,
	generateFeed,
	movedUpCount,
	rerankTail,
} from "../../lib/feed/generate-feed";
import { placeBlockModel } from "../../lib/feed/place-block";
import { FIRST_PAGE_SIZE, PREFETCH_DISTANCE } from "../../lib/feed/ratios";
import { preferScope } from "../../lib/feed/scope";
import {
	CARD_TAP_TARGET,
	SHARE_TAP_TARGET,
	SOUND_TAP_TARGET,
} from "../../lib/gesture/tap-slot";
import { launchDone } from "../../lib/launch-ready";
import { LISTINGS_IN_APP } from "../../lib/listings-in-app";
import {
	type SharedRef,
	parseSharedParam,
	putOnTop,
	shareTargetForCard,
	sharedCardInPool,
} from "../../lib/share/share-link";
import { openShareSheet } from "../../lib/share/share-sheet";
import { releaseSplash } from "../../lib/splash-gate";
import { useEventQueue } from "../../state/event-queue";
import { useFeedSession } from "../../state/feed-session";
import { useFunnelStore } from "../../state/funnel";
import { useSavedStore } from "../../state/saved";
import { useSoundStore } from "../../state/sound";
import { useSwipeHintStore } from "../../state/swipe-hint";
import {
	BLOCK_GAP,
	CARD_FOOT,
	GUTTER,
	ROOM_ABOVE,
	ROOM_BELOW,
	feedPage,
} from "../../theme/feed-page";
import { colors } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

/**
 * CardContainer insets (2026-08-13 redesign). The card now fills ALL of the
 * feed's available height (`flex: 1` inside the stack), so this padding is the
 * card's only margin — the old centered box with ~50pt of dead space top and
 * bottom is gone.
 *
 * 2026-08-13 owner revision: the media should read as an embedded WHITE card,
 * so the container's horizontal padding grows to 16 (was 12) — the paper
 * background shows around the card and the media box (which has its own
 * margin from the white text block) reads inset.
 *
 * 2026-08-14 owner revision: the card should not read as full-bleed at all —
 * horizontal 24 (was 16) so a clear band of paper shows down BOTH sides, and
 * top 12 (was 8) to seat it under the header row. This is the card
 * FRAME's inset — the frame, not the media; since 2026-08-18 every face is
 * full-bleed inside it.
 *
 * 2026-08-14 polish pass: horizontal 24 → 30 — the owner wanted the card ~6%
 * narrower with more paper on each side. `stackWrap` is `alignItems: center`,
 * so widening its padding narrows the card symmetrically; top/bottom are
 * unchanged.
 *
 * 2026-08-16 (Tia): 30 → 46 — the cards were too wide to read as swipeable,
 * so the next card's edge never showed. The wider band makes the card
 * visibly narrower than the screen and the next card peeks beside it (the
 * constant itself is defined above the doc block; `GUTTER` above matches).
 *
 * 2026-08-23: 37 → 16 (owner — buyers reported the cards read small with too
 * much spare paper around them). The card was 44% of the screen's area; it is
 * now 56–59% on every iPhone from the 13 mini up.
 *
 * The 2026-08-16 rationale above is retained for history but no longer
 * describes the stack: `PEEK_PT` went to 0 on 2026-08-19 and the behind card
 * rests at `STACK_RESTING` scale 0.94 — SMALLER than the top card — so nothing
 * peeks beside it at any gutter width. What the band still buys is the
 * swipeable read (a card that touches both screen edges is a page, not a
 * card), and 16 keeps a visible band for that.
 *
 * The ceiling on this is the VIDEO, not the layout: both tour canvases are
 * 1080x1576, so on a 3x screen a card wider than 360pt is upsampling its own
 * source. 16 puts the common phones at exactly 1.00 and the Max phones at
 * ~1.13, which their 2.7-4.5 Mbps top rendition absorbs without a visible
 * change. Going wider than this needs a bigger canvas first.
 *
 * 2026-09-06 (phase182): `top` 24 → 16, equal to `bottom`. The community strip
 * is gone (owner: it made the page 「not well organized and immersive」), so
 * these are FLOORS on either side of the card, and the card is drawn at the
 * tour's aspect (「Don't cut film」) with whatever the page has spare shared
 * out by `SwipeStack`'s `restTop`.
 *
 * 2026-09-07: `top` 16 → 12 (owner: 「the empty space between card and header
 * is too big」). The 16 came from the handoff, where it sat under an uppercase
 * type row; that row is gone, so the title's own line is what the card now
 * hangs from and it wants to be closer. The floors are no longer symmetric on
 * purpose — see `restTop`, which pairs with this.
 *
 * 2026-11-23: unchanged by the place block. phase378 put the block UNDER the
 * card and moved the card to the top of the screen at an 8pt gutter; the
 * owner then picked the block ABOVE the card instead ("numbers above the
 * card", `/demos/feed-above-card-v1` option 1), at the header's own 86pt, so
 * these are what they were and the card sits where it always has.
 *
 * 2026-11-24 (phase380): "card下方空隙多了 整体向下或者增大上面的文字". The
 * card stopped floating in a stage: it hangs `CARD_FOOT` (12) above the tab
 * bar at an 8pt `GUTTER`, the place block sits `BLOCK_GAP` above it, and the
 * screen's leftover goes above the block. The numbers live in
 * `theme/feed-page.ts`, which `theme/card-aspect.test.ts` runs per device.
 */

/**
 * The card frame height is NOT decided here any more (owner, 2026-08-17: one
 * frame height for every kind). It is `theme/card-frame.ts`'s
 * `CARD_FRAME_RATIO`, applied by `SwipeStack` to every card it mounts.
 *
 * What this replaced: three competing heights — listing 0.95, trade-off 0.62,
 * and area/community at `width × 1.2` — which meant an alternating deck
 * cross-faded the frame height on every commit and the page visibly jumped.
 */

export default function FeedScreen() {
	const { width } = useWindowDimensions();

	const stage = useFunnelStore((s) => s.stage);
	const stageHydrated = useFunnelStore((s) => s.hydrated);

	const signals = useFeedSession((s) => s.signals);
	const sessionN = useFeedSession((s) => s.sessionN);
	const sessionHydrated = useFeedSession((s) => s.hydrated);
	const recordSwipe = useFeedSession((s) => s.recordSwipe);
	const beginSession = useFeedSession((s) => s.beginSession);

	/**
	 * The buyer's picked scope still SOFT-ORDERS the pool (`preferScope`), but
	 * it can no longer be picked here: the sheet moved to the Search/map tab
	 * (owner, 2026-09-09). Read, never written, on this screen.
	 */
	const scope = useFeedSession((s) => s.signals.scope);

	const toggleSound = useSoundStore((s) => s.toggle);

	const enqueue = useEventQueue((s) => s.enqueue);
	const takeSeq = useEventQueue((s) => s.takeSeq);
	const drain = useEventQueue((s) => s.drain);

	// Saved state — the card heart toggles it; nothing else reads it yet
	// (the Saved tab is still the task-5 placeholder).
	const toggleSaved = useSavedStore((s) => s.toggle);
	// Swipe-hint state — the motion hint's never-nag contract. Deliberately NOT
	// subscribed to `hasDiscoveredSwipe` / `hintSessionsShown`: the hint effect
	// below WRITES both, and a subscription would re-run it. See there.
	const hintHydrated = useSwipeHintStore((s) => s.hydrated);
	const recordSwipeHint = useSwipeHintStore((s) => s.recordSwipe);
	const recordHintShown = useSwipeHintStore((s) => s.recordHintShown);

	// BOTH stores must be read back before a deck is built, or the first render
	// composes a stage-0 deck for a returning stage-3 buyer (§1.7).
	const hydrated = stageHydrated && sessionHydrated;

	const [activeIndex, setActiveIndex] = useState(0);
	const [deck, setDeck] = useState<readonly FeedCardV3[]>([]);

	/**
	 * Whether this screen is the one in front. Explore pages are PUSHED over
	 * the feed, so the deck stays mounted underneath — and its top card kept
	 * playing audio under the explore page's own film (owner, 2026-08-25: "the
	 * card music does not stop and overlaps with the explore page one"). The
	 * faces get `suspended` while something covers us; that pauses without
	 * rewinding, so coming back resumes the card where it was.
	 */
	const [tabFocused, setFocused] = useState(true);
	/**
	 * The first film waits for the launch animation to start leaving
	 * (`lib/launch-ready.ts`) — otherwise it plays, with its narration, under
	 * the drawing and is two seconds in when the buyer first sees it.
	 */
	const launched = useSyncExternalStore(launchDone.subscribe, launchDone.get);
	const focused = tabFocused && launched;
	useFocusEffect(
		useCallback(() => {
			setFocused(true);
			return () => setFocused(false);
		}, []),
	);

	/**
	 * The buyer paused the top card with a bare tap (owner, 2026-08-25: "when
	 * tapping on the card, we should pause and resume"). Belongs to one
	 * viewing: the next card always starts playing, so it resets with the
	 * cursor rather than in the swipe handler — the deck also recomposes
	 * `activeIndex` to 0 on its own (§ the 2026-08-23 entry), and that must
	 * not inherit a pause either.
	 */
	const [paused, setPaused] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: activeIndex is the trigger, not a read
	useEffect(() => {
		setPaused(false);
	}, [activeIndex]);

	const [engineExhausted, setEngineExhausted] = useState(false);
	/**
	 * The `poolReady` the deck on screen was composed from. The first pool
	 * response and `loading: false` land in one render, and the compose effect
	 * only runs after it — so for a frame the deck was still the empty one built
	 * from `EMPTY_POOL`, whose `exhausted` is true, and the terminal card flashed
	 * before the first real card (owner, 2026-11-23).
	 */
	const [composedPoolReady, setComposedPoolReady] = useState(false);
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

	const { pool, loading, offline, exhausted, fetchMore } = useFeedPool({
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
	/**
	 * The pool the composer sees, with the buyer's explicit scope applied
	 * (phase140). `preferScope` REORDERS — the scoped city's content leads and
	 * nothing is dropped, per §1.3 — and returns the pool by identity when no
	 * scope is set, so a buyer who never opens the sheet pays nothing.
	 */
	/**
	 * Cross-user taste scores for the buyer's likes ("buyers who liked these
	 * also liked"). Attached to the pool the composer reads, so both the next
	 * appended page and the per-swipe tail re-rank see them; a mid-session
	 * arrival never rebuilds the deck, because nothing composes on the pool's
	 * identity.
	 */
	const cfScores = useCfScores(signals.likedListingIds);

	const scopedPool = useMemo(() => {
		const scoped = preferScope(pool, scope?.unitId ?? null);
		return cfScores === undefined ? scoped : { ...scoped, cfScores };
	}, [pool, scope?.unitId, cfScores]);

	/**
	 * What fits on this screen (`theme/feed-page.ts`): the card at the film's
	 * shape, and which of the place block's rows fit above it. From the page's
	 * own measured height, so the offline bar and the tab bar are already
	 * paid for.
	 */
	const [contentHeight, setContentHeight] = useState(0);
	const page = useMemo(
		() => feedPage(width, contentHeight),
		[width, contentHeight],
	);
	const cardWidth = page.cardWidth;

	const poolRef = useRef(scopedPool);
	poolRef.current = scopedPool;

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

	/**
	 * Whether the pool holds anything at all — the compose effect's ONE
	 * pool-shaped dependency (phase120).
	 *
	 * The effect deliberately does not depend on the pool (pagination must
	 * never rebuild a deck mid-session), but that left a bootstrap race: it
	 * fires when `hydrated` flips true, which is always BEFORE the first pool
	 * response lands (`useFeedPool` is `enabled: hydrated`), so it composed an
	 * empty deck from `EMPTY_POOL` — and nothing ever recomposed it. The append
	 * path can't rescue it either (it early-returns on an empty deck). Every
	 * sampler session masked this for weeks, because `samplerPoolSize` IS a
	 * pool-sized dependency; the first sampler-off session (2026-08-23) opened
	 * to a permanently blank feed.
	 *
	 * A boolean, not a count: false → true exactly once per stage, so the
	 * effect re-fires for the bootstrap and never again for a later page.
	 */
	const poolReady =
		pool.listings.length + pool.communities.length + pool.geoUnits.length > 0;

	// biome-ignore lint/correctness/useExhaustiveDependencies: `samplerPoolSize` (DEV-only), `poolReady` and `scope?.unitId` are recompose TRIGGERS, not values this effect reads directly (it reads `poolRef`). Biome sees no read and calls them unnecessary; without `poolReady` the production deck composes once from the still-empty pool and stays blank forever.
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
				setComposedPoolReady(poolReady);
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
			listings: LISTINGS_IN_APP,
		});
		rotate.current = result.nextRotate;
		setDeck(result.cards);
		setComposedPoolReady(poolReady);

		setEngineExhausted(result.exhausted);
		setActiveIndex(0);
		// `samplerPoolSize` is a DEV-ONLY dependency: the sampler composes straight
		// from the pool, so it must recompose once the pool lands. `poolReady` is
		// the production bootstrap (see its note): one false→true flip per stage,
		// so pagination still never rebuilds the deck mid-session.
		// `scope?.unitId` is a recompose TRIGGER: a new scope reorders the pool,
		// and the deck the buyer is holding was built from the old order. This is
		// the one case where resetting `activeIndex` to 0 is correct — they just
		// asked for a different place.
	}, [hydrated, stage, samplerPoolSize, poolReady, scope?.unitId]);

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
			listings: LISTINGS_IN_APP,
		});
		rotate.current = result.nextRotate;
		if (result.cards.length === 0) return;
		setDeck((d) => [...d, ...result.cards]);

		setEngineExhausted(result.exhausted);
	}, [stage]);

	/**
	 * A shared link opened the app here (phase337, owner: "跳转到app的explore页面
	 * 不是swipe的页面"): `+native-intent` turns `www.percho.co/watch/c/<slug>`
	 * into `/feed?shared=community:<slug>`. The card goes in FRONT of the deck
	 * the buyer already has, and they swipe on from it into everything else.
	 *
	 * The param is consumed and cleared, so coming back to the tab does not
	 * put the card on top again. The card comes from the pool — the same card
	 * a swipe would reach — so while the pool has not loaded it, more pages
	 * are fetched; if the whole pool is in and it is not there (a community
	 * with no film, say), its page opens instead, so the link never lands on
	 * nothing.
	 */
	const { shared } = useLocalSearchParams<{ shared?: string }>();
	const [pendingShare, setPendingShare] = useState<SharedRef | null>(null);
	useEffect(() => {
		const ref = parseSharedParam(shared);
		if (!ref) return;
		setPendingShare(ref);
		router.setParams({ shared: undefined });
	}, [shared]);
	useEffect(() => {
		if (!pendingShare || deck.length === 0) return;
		const card = sharedCardInPool(pool, pendingShare);
		if (card) {
			setPendingShare(null);
			setDeck((d) => putOnTop(d, activeIndex, card));
			return;
		}
		if (!exhausted) {
			fetchMore();
			return;
		}
		setPendingShare(null);
		router.push(
			pendingShare.kind === "community"
				? `/community/${pendingShare.slug}`
				: `/city/${pendingShare.slug}`,
		);
	}, [pendingShare, deck.length, pool, exhausted, fetchMore, activeIndex]);

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

	/**
	 * The place block's one read of the ACTIVE card (phase378).
	 *
	 * `activeIndex` only moves on a COMMITTED swipe, so the place, the figures
	 * and every destination change together and a cancelled swipe changes none
	 * of them. There is no frame in which the incoming card's map target sits
	 * under the outgoing card's place.
	 */
	const topCard = deck[activeIndex];
	const block = useMemo(
		() =>
			placeBlockModel({
				card: topCard,
				geoUnits: pool.geoUnits,
				communities: pool.communities,
			}),
		[topCard, pool.geoUnits, pool.communities],
	);

	/**
	 * The one line a trade-off answer earns back.
	 *
	 * 32 questions ask a great deal of a buyer, and until now a vote landed in
	 * `signals` and produced nothing they could see. This says what actually
	 * changed, with the real count — never "we'll remember that", which is the
	 * kind of reassurance an app says when nothing happened.
	 *
	 * Shown ONLY when homes really moved. A question whose field the mirror has
	 * not landed yet reorders nothing, and claiming otherwise would be the lie
	 * this line exists to avoid.
	 */
	const [echo, setEcho] = useState<string | null>(null);
	useEffect(() => {
		if (echo === null) return;
		const t = setTimeout(() => setEcho(null), 3200);
		return () => clearTimeout(t);
	}, [echo]);

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

			// Time-on-card, approximated by the gap since the previous swipe (the
			// same figure telemetry ships as `dtSincePrevSwipe`). It scales the
			// swipe's geo-tally weight — see `swipeWeight`.
			const fresh = recordSwipe(card, decision, at, {
				...(prevSwipeAt !== undefined ? { dwellMs: at - prevSwipeAt } : {}),
			});

			/*
			 * Re-rank the deck's unswiped tail with the signals this swipe just
			 * produced, so the NEXT cards follow the buyer's thumb card-by-card
			 * instead of waiting for the next appended page. `rerankTail` never
			 * touches the mounted window (the new activeIndex ±2 plus one card of
			 * slack) and reorders each kind only among its own slots, so the
			 * deck-key invariant and the mix rhythm both hold by construction.
			 */
			setDeck((d) =>
				rerankTail(d, index + 1 + RERANK_HOLD, fresh, poolRef.current),
			);

			if (card.kind === "tradeoff") {
				const moved = movedUpCount(pool.listings, card, decision);
				const side = decision === "right" ? card.right : card.left;
				setEcho(
					moved > 0
						? `${side.label} · ${moved} ${moved === 1 ? "home" : "homes"} moved up your feed`
						: null,
				);
			}
			// A real swipe IS the discovery — the hint never plays again. Only
			// reached by a committed PAN; every surviving kind commits.
			recordSwipeHint();
			setActiveIndex(index + 1);
		},
		[
			activeIndex,
			enqueue,
			takeSeq,
			stage,
			sessionN,
			recordSwipe,
			recordSwipeHint,
			// `movedUpCount` reads the loaded listings to count what the answer
			// promoted. `geoUnits` was the stale entry it replaced.
			pool.listings,
		],
	);

	const capability = useCallback(
		(card: FeedCardV3) => cardBehavior(card).capability,
		[],
	);

	/**
	 * §1.8's direction labels (owner pick "D2"), finally mounted. The component
	 * has existed since task-0 and the feed never passed a `renderOverlay`, so a
	 * drag has had no directional feedback at all: the card tilted and the buyer
	 * learned what it meant only after letting go.
	 *
	 * Only for `decide` cards. A trade-off is `either-or` and already shows the
	 * drag on its own terms — the chosen door widens and a green check lands by
	 * its label — so a red PASS badge over the losing door would contradict the
	 * face rather than annotate it. `cardBehavior` knows the difference, so
	 * nothing here branches on a card kind.
	 */
	const renderOverlay = useCallback(
		(card: FeedCardV3, args: CardRenderArgs) =>
			cardBehavior(card).mode === "decide" ? (
				<SwipeLabels card={card} tx={args.tx} cardWidth={args.cardWidth} />
			) : null,
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
		(card: FeedCardV3, args: CardRenderArgs) => {
			const isTop = args.role === "top";
			// The corner's share (phase335, owner: "feed卡右上角分享按键") — a
			// community, or a city with a page; no cell on any other card.
			const shareTarget = shareTargetForCard(card);
			const share = shareTarget
				? { onShare: () => openShareSheet(shareTarget) }
				: {};
			switch (card.kind) {
				case "area": {
					// A city with a film wears the community card's face — its place
					// label, its progress bar, its bottom row (phase329: "要保持一致").
					const film = cityFilmCard(card);
					const toCity = card.unit.citySlug
						? () => {
								emitGesture("explore_tap", card);
								router.push(`/city/${card.unit.citySlug}`);
							}
						: undefined;
					if (film) {
						return (
							<CommunityFace
								card={film}
								tag="CITY"
								saveKind="area"
								isTop={isTop}
								suspended={!focused || paused}
								tapSlot={args.tapSlot}
								deckGesture={args.deckGesture}
								{...(toCity ? { onExplore: toCity } : {})}
								{...share}
							/>
						);
					}
					return (
						<AreaFace
							card={card}
							isTop={isTop}
							suspended={!focused || paused}
							tapSlot={args.tapSlot}
							{...(toCity ? { onExplore: toCity } : {})}
							{...share}
						/>
					);
				}
				case "listing":
					return (
						<ListingFace
							card={card}
							isTop={isTop}
							suspended={!focused || paused}
							tapSlot={args.tapSlot}
							/*
							 * The owner's 2026-08-13 revision dropped the giant green
							 * CTA pill for a quiet right-bottom link. The link fires
							 * through the stack's exclusive-tap gesture
							 * (`onTapTarget` → EXPLORE_TAP_TARGET); the `onExplore`
							 * prop stays for callers outside the stack.
							 */
							onExplore={() => {
								emitGesture("explore_tap", card);
								router.push(`/listing/${card.id}`);
							}}
						/>
					);
				case "community":
					return (
						<CommunityFace
							card={card}
							isTop={isTop}
							suspended={!focused || paused}
							tapSlot={args.tapSlot}
							/* Lets the progress bar's drag block the deck's swipe —
							   without it the two race for the same gesture. */
							deckGesture={args.deckGesture}
							{...share}
							/*
							 * "Why people love it →" now has a destination (owner,
							 * 2026-08-02: 「最后还有why people love it的跳转button」).
							 *
							 * This comment used to say there was nowhere to send it, and that
							 * was true: `/listing/nearby` takes a LISTING id and no community
							 * route existed. `app/community/[slug].tsx` +
							 * `/api/mobile/community/<id-or-slug>` are that route now — the
							 * card's three reason tiles expanded, every other reason the
							 * residents stated, and the interest ranking that is the evidence
							 * under them. Deliberately NOT spec-v3 §3.3's four-pillar explore
							 * page: 安/学/便/潜 have no data on this DB (see the screen's
							 * header for the counts).
							 *
							 * Keyed by SLUG, not id, so a shared link and a feed tap land on
							 * the same URL; the endpoint accepts either.
							 */
							onExplore={() => {
								emitGesture("explore_tap", card);
								router.push(`/community/${card.slug}`);
							}}
						/>
					);
				case "tradeoff":
					return (
						<TradeoffFace card={card} tx={args.tx} cardWidth={args.cardWidth} />
					);
			}
		},
		[
			stage,
			sessionN,
			signals.swipesInStage,
			emitGesture,
			enqueue,
			takeSeq,
			focused,
			paused,
		],
	);

	/**
	 * The swipe-hint (owner spec, 2026-08-13; redrawn phase365): once the
	 * first card has settled (~500-800ms), it shows itself being liked and
	 * then passed — out to the right with the green wash and the LIKE mark,
	 * back, out to the left with PASS, back — so the buyer sees both that the
	 * cards swipe and what each side means. It was a 16pt nudge to the left
	 * until the owner's "好改" on 2026-11-20. Never nags:
	 * a real swipe (recordSwipe in `onDecision`) disables it forever; without
	 * a swipe it plays at most MAX_HINT_SESSIONS app opens.
	 *
	 * ── Why the deps are this narrow (2026-08-14) ───────────────────────────
	 *
	 * The hint never played on device, and the reason was in this effect rather
	 * than in the animation. `recordHintShown()` WRITES the hint store, and the
	 * effect used to subscribe to the value it writes (`hintSessionsShown`) and
	 * to `deck.length`. So the set() it makes re-rendered the screen with a
	 * changed dep, React ran the CLEANUP first — `clearTimeout(t)` — and the
	 * 600ms timer died a few milliseconds after being scheduled. The re-run
	 * then hit the `hintRunOnce` latch and returned. Worse, the session had
	 * already been counted, so three feed opens silently burned the entire
	 * never-nag budget without the buyer ever seeing a nudge. A `deck.length`
	 * append inside the 600ms window killed it the same way.
	 *
	 * The fix is to depend only on values this effect does not write:
	 * `hintEligible` is a BOOLEAN, so a deck that keeps growing does not
	 * re-trigger it, and the never-nag rules (discovered? budget left?) are
	 * already enforced inside `recordHintShown` against fresh store state —
	 * they never needed a subscription here.
	 */
	const hintRef = useRef<SwipeHintHandle | null>(null);
	const hintRunOnce = useRef(false);
	const onHintReady = useCallback((hint: SwipeHintHandle) => {
		hintRef.current = hint;
	}, []);
	/**
	 * A deck is up, the buyer is on its first card, and the launch animation
	 * is out of the way (the nudge would play unseen under it). Flips once.
	 */
	const hintEligible = launched && deck.length > 0 && activeIndex === 0;
	useEffect(() => {
		if (!hintHydrated || !hintEligible || hintRunOnce.current) return;
		hintRunOnce.current = true;
		// Returns false when the buyer has already discovered the swipe or the
		// MAX_HINT_SESSIONS budget is spent.
		if (!recordHintShown()) return;
		const t = setTimeout(() => {
			hintRef.current?.nudge();
		}, 600);
		return () => clearTimeout(t);
	}, [hintHydrated, hintEligible, recordHintShown]);

	const onTapTarget = useCallback(
		(target: string) => {
			if (target === CARD_TAP_TARGET) {
				const top = deckRef.current[activeIndex];
				// Only a card with a film has anything to pause; a photo card
				// showing a play glyph would promise a video it does not have.
				const hasVideo =
					top?.kind === "area"
						? !!top.unit.videoUrl
						: top?.kind === "listing" || top?.kind === "community"
							? !!top.videoUrl
							: false;
				if (hasVideo) setPaused((p) => !p);
				return;
			}
			if (target === CHAPTER_TAP_TARGET) {
				// A word in a city card's band: the card has already sought the
				// film; a paused film has to play or the jump looks like nothing.
				setPaused(false);
				return;
			}
			if (target === SOUND_TAP_TARGET) {
				// Global state (§0.7): muting here mutes the community tours and
				// the explore page too, which is the point — the buyer is
				// silencing Percho, not this one card.
				toggleSound();
				return;
			}
			if (target === SAVE_TAP_TARGET) {
				const top = deckRef.current[activeIndex];
				// Every face except the trade-off draws the bookmark, and under
				// `tapSlot` its own onPress is disarmed — so a kind missing from
				// here is a dead button, not a fallback. Listing was the only kind
				// listed at first; `area` was added when the CITY card's bookmark
				// was found dead, and `community` was dead again from phase174,
				// which gave that face its bookmark back.
				//
				// So the guard names the ONE kind with no bookmark instead of
				// enumerating the ones that have it. That makes the compiler the
				// thing keeping the two in step: a new card kind is a `SavedKind`
				// or it fails to typecheck here, and neither can be forgotten.
				if (top && top.kind !== "tradeoff") {
					toggleSaved(top.id, top.kind);
				}
				return;
			}
			if (target === SHARE_TAP_TARGET) {
				const top = deckRef.current[activeIndex];
				const shareTarget = top ? shareTargetForCard(top) : null;
				if (shareTarget) openShareSheet(shareTarget);
				return;
			}
			if (target === EXPLORE_TAP_TARGET) {
				const top = deckRef.current[activeIndex];
				if (top && top.kind === "listing") {
					emitGesture("explore_tap", top);
					router.push(`/listing/${top.id}`);
				}
				// The community card's "Why people love it →" link, rebuilt on
				// 2026-08-14 to the listing card's design system, fires through the
				// SAME tap target. Its destination is the community route, keyed by
				// SLUG (see the `onExplore` comment on `CommunityFace` above).
				if (top && top.kind === "community") {
					emitGesture("explore_tap", top);
					router.push(`/community/${top.slug}`);
				}
				// The city card's link, to the city's page (phase327).
				if (top && top.kind === "area" && top.unit.citySlug) {
					emitGesture("explore_tap", top);
					router.push(`/city/${top.unit.citySlug}`);
				}
			}
		},
		[activeIndex, toggleSaved, toggleSound, emitGesture],
	);

	// Destructured so the two handlers below narrow: TypeScript drops a
	// property's narrowing inside a closure, but keeps a `const`'s.
	const { placeSlug, explore, mapUnitId, mapPoint } = block;

	const atEnd = activeIndex >= deck.length;
	// §1.9's terminal card is for a genuinely dry pool, not for a momentary gap:
	// the engine reports exhaustion when every slot had to reuse seen content, and
	// the server reports it has no more inventory. Both, plus nothing left to show.
	// The pool is in but the deck has not been composed from it yet — still
	// loading as far as the buyer is concerned (see `composedPoolReady`).
	const composing = composedPoolReady !== poolReady;
	const showExhausted =
		atEnd && (engineExhausted || exhausted) && !loading && !composing;

	/**
	 * Tell the launch animation the feed is ready (`lib/splash-gate.ts`). It
	 * waits for the first card's still, so its fade lands on a picture; a dry
	 * pool or no network has nothing to wait for. The gate's own timer covers a
	 * slow image.
	 */
	const firstPoster = deck[0] ? cardPoster(deck[0]) : undefined;
	const nothingToWaitFor = showExhausted || offline;
	useEffect(() => {
		if (nothingToWaitFor) releaseSplash();
		else if (deck.length === 0) return;
		else if (!firstPoster) releaseSplash();
		else Image.prefetch(firstPoster).then(releaseSplash, releaseSplash);
	}, [deck.length, firstPoster, nothingToWaitFor]);

	return (
		<SafeAreaView style={styles.screen} edges={["top"]}>
			{offline && <OfflineBar />}
			<View
				style={styles.page}
				onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
			>
				{/*
				 * Three quarters of the room the screen has left over, above the
				 * block — the card and the block sit low on the page (owner,
				 * 2026-11-24: "card下方空隙多了 整体向下", then "整体向上再一点点").
				 * The trade-off answer's echo is said here.
				 */}
				<View style={styles.room}>
					{echo !== null && (
						<View style={styles.echo} pointerEvents="none">
							<Text style={styles.echoText} numberOfLines={2}>
								{echo}
							</Text>
						</View>
					)}
				</View>
				{/*
				 * The place block (phase378; above the card since phase379; set down
				 * on it in phase380): where the place is, Map, and three figures the
				 * film cannot show. It replaced the header that repeated the card's
				 * name.
				 *
				 * Each affordance appears only when its target is real: no map
				 * target, no Map button; no page, and a figure is text. The place
				 * line opens a community only for a HOME — on a community's own
				 * card Explore already goes there.
				 */}
				{page.rows !== "none" && (
					<PlaceBlock
						model={block}
						facts={page.rows === "both"}
						onOpenPlace={
							placeSlug !== null
								? () => router.push(`/community/${placeSlug}`)
								: undefined
						}
						onOpenMap={
							// The card's own point first (owner, 2026-09-14: "redirected to
							// that community or home on map, not just the county area") —
							// the city unit only for a card that carries no coordinates.
							mapPoint !== null
								? () =>
										router.navigate({
											pathname: "/(tabs)/search",
											params: {
												focusLat: String(mapPoint.lat),
												focusLng: String(mapPoint.lng),
												focusKind: mapPoint.kind,
											},
										})
								: mapUnitId !== null
									? () =>
											router.navigate({
												pathname: "/(tabs)/search",
												params: { focus: mapUnitId },
											})
									: undefined
						}
						onOpenCell={
							explore !== null
								? (cell) => {
										if (topCard) emitGesture("datapoint_tap", topCard);
										// The page opens on the part the figure belongs to.
										const params = {
											slug: explore.slug,
											...(cell.topic ? { open: cell.topic } : {}),
										};
										router.push(
											explore.kind === "community"
												? { pathname: "/community/[slug]", params }
												: { pathname: "/city/[slug]", params },
										);
									}
								: undefined
						}
					/>
				)}
				<View
					style={[
						styles.stackWrap,
						{
							height: page.cardHeight,
							marginTop: page.rows === "none" ? 0 : BLOCK_GAP,
						},
					]}
				>
					{deck.length === 0 && (loading || composing) ? (
						<View style={styles.cardContainer}>
							<CardSkeleton />
						</View>
					) : showExhausted ? (
						<View style={styles.cardContainer}>
							<ExhaustedCard
								/*
								 * One exit now, not two. "Adjust my scope" opened the
								 * scope sheet, and the sheet left the feed on
								 * 2026-09-09 — so widening happens where it now lives,
								 * which is the tab this button already went to.
								 */
								onBrowseMap={() => router.navigate("/(tabs)/search")}
							/>
						</View>
					) : (
						<SwipeStack
							items={deck}
							activeIndex={activeIndex}
							onDecision={onDecision}
							onTapTarget={onTapTarget}
							onHintReady={onHintReady}
							renderCard={renderCard}
							renderOverlay={renderOverlay}
							keyExtractor={deckKey}
							cardWidth={cardWidth}
							capability={capability}
						/>
					)}
					{/*
					 * Paused glyph, centred on the card. Drawn here rather than in the
					 * faces: `suspended` also covers "an explore page is over us",
					 * where nobody can see the card, and a glyph that appears for the
					 * pop-back animation's duration would flash. Only a TAP pause
					 * shows it. `pointerEvents="none"` so the next tap reaches the deck.
					 */}
					{paused && (
						<View style={styles.pausedWrap} pointerEvents="none">
							<View style={styles.pausedDisc}>
								<View style={styles.pausedTriangle} />
							</View>
						</View>
					)}
				</View>
				{/* The other quarter, under the card. */}
				<View style={styles.foot} />
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.bg },
	/**
	 * CardContainer (2026-08-13 redesign) — the card's only margin, now that
	 * the card fills the available height. `flex: 1` + centering keeps the
	 * stack vertically centred and the card stretching edge to edge.
	 */
	/**
	 * The answer echo, in the room above the place block — the one stretch of
	 * the page that is paper since the card sat down on the tab bar (phase380).
	 */
	echo: {
		paddingHorizontal: 24,
		alignItems: "center",
	},
	echoText: {
		...textStyles.footnote,
		color: colors.ink2,
		textAlign: "center",
	},
	/**
	 * Everything between the status bar (and the offline bar) and the tab bar,
	 * the card `CARD_FOOT` above the bar. Measured: `feedPage` decides what fits.
	 */
	page: { flex: 1, paddingBottom: CARD_FOOT },
	/** The leftover, shared out: above the block, and under the card. */
	room: { flex: ROOM_ABOVE, justifyContent: "center" },
	foot: { flex: ROOM_BELOW },
	/**
	 * The stage: the card's own box and nothing more, so `SwipeStack` finds no
	 * slack to share out and the card rests at its top.
	 */
	stackWrap: {
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: GUTTER,
	},
	/**
	 * Placeholder frame for skeleton / exhausted states — fills the same box
	 * the real card would (flex:1 within the padded container).
	 */
	cardContainer: { flex: 1, alignSelf: "stretch" },
	pausedWrap: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
	},
	pausedDisc: {
		width: 64,
		height: 64,
		borderRadius: 32,
		backgroundColor: colors.glass,
		alignItems: "center",
		justifyContent: "center",
	},
	/** A play triangle from borders — the icon font has no `play` glyph. */
	pausedTriangle: {
		width: 0,
		height: 0,
		marginLeft: 5,
		borderTopWidth: 12,
		borderBottomWidth: 12,
		borderLeftWidth: 20,
		borderTopColor: "transparent",
		borderBottomColor: "transparent",
		borderLeftColor: colors.ink,
	},
	sheet: { paddingHorizontal: 20, paddingTop: 8, gap: 8 },
	sheetEyebrow: { ...textStyles.caption, color: colors.ink2 },
	sheetTitle: { ...textStyles.title2, color: colors.ink },
	sheetPrice: { ...textStyles.display, color: colors.ink },
	sheetBody: { ...textStyles.body, color: colors.ink2 },
});
