/**
 * useSwipeCard — binds the deck's sideways paging to a Reanimated pan + tap.
 *
 * A swipe BROWSES (phase414; it was a like/pass verdict until then — see
 * `lib/gesture/page-layer.ts`): left turns to the next card, right to the one
 * before, and nothing about the card is decided by either.
 *
 * Responsibilities:
 *   - drive `tx` while dragging horizontally; vertical carries no semantics on
 *     the card face, so the cards never translate vertically and the pan only
 *     claims horizontally-dominant touches (§0.5 ±30° sector),
 *   - resist a pull back when there is no card to go back to,
 *   - on release, delegate the decision to the pure `decideSwipe`, slide a
 *     whole card on or back, or spring to rest for a non-commit,
 *   - turn the page for a caller (`page`), and take the card in front out of
 *     the row for one (`dismiss`) — the card's "not for me" button. That is
 *     NOT a page turn and does not look like one: the card drops away where
 *     it stands, and the cards after it close the space it leaves.
 *
 * The hook owns none of the feed semantics — it reports the step to `onPage`
 * and lets the caller decide what moving on from a card records. What a given
 * card is ALLOWED to do arrives as a resolved `CardCapability` (§1.3), so no
 * handler in here ever branches on a card kind.
 */
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { Gesture } from "react-native-gesture-handler";
import {
	Easing,
	type SharedValue,
	runOnJS,
	runOnUI,
	useSharedValue,
	withDelay,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import {
	type CardCapability,
	clampDisplacement,
	commitDecision,
	panLive,
} from "../lib/gesture/capability";
import { decideSwipe } from "../lib/gesture/decide-swipe";
import { type PageStep, pageDrag, pageStep } from "../lib/gesture/page-layer";
import {
	CARD_TAP_TARGET,
	TAP_MAX_DX,
	type TapSlot,
	type TapStatus,
	isTapEnd,
} from "../lib/gesture/tap-slot";

/**
 * The page turn: a spring at damping 26 (§1.8's number for a card leaving).
 *
 * `duration` is absent on purpose. Reanimated has two spring families — physics
 * (`mass`/`stiffness`/`damping`) and duration (`duration`/`dampingRatio`) — and
 * supplying both silently drops one, taking `damping: 26` with it.
 *
 * `stiffness: 220` at `mass: 1` puts ζ = 26/(2·√220) ≈ 0.88 and ω ≈ 14.8 rad/s,
 * i.e. a ~260-280ms settle. `overshootClamping` because the handoff fires when
 * the spring finishes: a bounce past the resting place would be cut off by it.
 */
const PAGE_SPRING = {
	damping: 26,
	mass: 1,
	stiffness: 220,
	overshootClamping: true,
} as const;
const ACTIVE_OFFSET_X = 10;
const FAIL_OFFSET_Y = 20;
/**
 * A dismissed card's own exit, and how long after it starts the cards behind
 * it begin to close up — so the eye sees the card go before anything slides.
 */
const DISMISS_MS = 220;
const CLOSE_DELAY_MS = 110;

interface UseSwipeCardArgs {
	cardWidth: number;
	/** Card to card: a card's width plus the gap to the next. */
	pitch: number;
	/**
	 * What THIS top card is allowed to do (§1.3). Resolved by the caller before
	 * the gesture is built, which is what lets every handler below stay ignorant
	 * of card kinds.
	 */
	capability: CardCapability;
	/** Whether there is a card to go back to. */
	canGoBack: boolean;
	/**
	 * The UI index of the caller's first card. `canGoBack` comes from React and
	 * is a frame or two behind a page turn; this is what stops a second quick
	 * swipe back from turning past the first card in that time.
	 */
	firstIndex: number;
	/** Called on the JS thread once the page has turned and settled. */
	onPage: (step: PageStep) => void;
	/**
	 * Called on the JS thread once a `dismiss` has run and the row has closed —
	 * `done` — or at once with `false` when it could not start because a page
	 * was turning.
	 */
	onDismissed: (done: boolean) => void;
	/**
	 * Called when a release is a TAP on an interactive card target (the save
	 * heart / the explore link). `target` is the tap target's id; the card
	 * faces write it into `tapSlot` on their own touches. The feed wires this
	 * to the routing/emitting callbacks — see `lib/gesture/tap-slot.ts` for
	 * why a tap inside the pan gesture has to be detected here rather than by
	 * a nested `Pressable`.
	 */
	onTapTarget?: (target: string) => void;
}

interface UseSwipeCardResult {
	/**
	 * The composed gesture — `Gesture.Exclusive(pan, tap)`. The tap half gives
	 * interactive children (the save heart, the explore link) their own
	 * activation inside the pan area; it only ever activates on a stationary
	 * touch, so a swipe always wins the exclusive and nothing that drags the
	 * card can fire a tap.
	 */
	gesture: ReturnType<typeof Gesture.Exclusive>;
	/**
	 * The pan half on its own, so a gesture inside a card can declare a relation
	 * to it — `blocksExternalGesture` takes a base gesture and refuses a
	 * `ComposedGesture`, which is what `gesture` above is.
	 *
	 * The pan is also the only half worth blocking: the tap needs a stationary
	 * finger, so it can never contend with a drag.
	 *
	 * The community card's progress scrubber is the caller. Without the relation
	 * a scrub and a swipe race for the same horizontal drag, and losing that race
	 * turns the page under the buyer who was trying to rewind.
	 */
	panGesture: ReturnType<typeof Gesture.Pan>;
	/** Horizontal drag offset — every mounted card reads it. */
	tx: SharedValue<number>;
	/**
	 * Absolute index of the current top card, on the UI thread. Moved in the
	 * SAME worklet frame that zeroes `tx`, so the cards' geometry never passes
	 * through a state where the page has turned but the drag has not been
	 * taken back — that discontinuity is a jump. React's `activeIndex` catches
	 * up a frame or two later, and writing it back here is idempotent because
	 * this worklet already moved it to the same value.
	 */
	topAbs: SharedValue<number>;
	/**
	 * The tap gesture's target slot. The card faces write `{ target }` into it
	 * on their own touch start (the heart / explore link) and clear it on
	 * release; the pan's `onEnd` reads it to decide whether the release was a
	 * tap on that target. Faces are the only writers; the worklets are the only
	 * readers.
	 */
	tapSlot: SharedValue<TapSlot>;
	/** The tap gesture's live state, set on `onTouchesDown` / cleared on activate. */
	tapStatus: SharedValue<TapStatus>;
	/**
	 * Turn the page without a drag, with the same slide. Ignores `canGoBack`:
	 * the caller knows where it is going. A no-op while a turn is under way.
	 */
	page: (step: PageStep) => void;
	/**
	 * Take the card in front out of the row: `gone` runs 0 → 1 for its own
	 * exit, the cards after it slide up one place, and `onDismissed` fires. The
	 * caller then removes the card from its list. A no-op while a turn is
	 * under way.
	 */
	dismiss: () => void;
	/** 0 → 1 over a dismissed card's exit. Only that card reads it. */
	gone: SharedValue<number>;
	/**
	 * The UI index a dismissal is taking out, or -1. The cards BEFORE it are
	 * drawn relative to it rather than to the cursor until the caller's list
	 * catches up — see `StackCard`.
	 */
	hole: SharedValue<number>;
}

/**
 * Module-level dispatcher for tap targets. The pan's `onEnd` runs on the UI
 * thread and cannot read `handlers` (a ref); this runs on the JS thread via
 * `runOnJS` and derefs the ref there, where it is valid.
 */
function dispatchTapTarget(target: string) {
	if (target === "__touchdown__") return;
	lastTapTarget?.(target);
}

/** The latest tap-target handler, set by `useSwipeCard` (JS thread only). */
let lastTapTarget: ((target: string) => void) | null = null;

export function useSwipeCard({
	cardWidth,
	pitch,
	capability,
	canGoBack,
	firstIndex,
	onPage,
	onDismissed,
	onTapTarget,
}: UseSwipeCardArgs): UseSwipeCardResult {
	const tx = useSharedValue(0);
	const topAbs = useSharedValue(0);
	const gone = useSharedValue(0);
	const hole = useSharedValue(-1);
	/**
	 * `canGoBack`, mirrored for the worklets rather than captured by the
	 * gesture: it flips when the page turns, and a value the gesture memo
	 * depends on rebuilds the gesture — see `handlers` below for what that
	 * costs mid-touch.
	 */
	const backOpen = useSharedValue(canGoBack);
	const floor = useSharedValue(firstIndex);
	useLayoutEffect(() => {
		backOpen.value = canGoBack;
		floor.value = firstIndex;
	}, [canGoBack, firstIndex, backOpen, floor]);
	/**
	 * The tap gesture's two slots. `tapSlot.target` is written by the card
	 * faces (on their own touch start) and read by the pan's `onEnd`; the
	 * exclusive tap gesture itself only ever ACTIVATES on a stationary touch,
	 * so the pan and the tap can never both be active for one release.
	 */
	const tapSlot = useSharedValue<TapSlot>({ target: null });
	const tapStatus = useSharedValue<TapStatus>({ active: false });
	/**
	 * `onPage`, read through a ref so it is NOT a gesture-memo input.
	 *
	 * `SwipeStack` builds it as an inline arrow closing over the current top item,
	 * so a fresh identity arrives on every render. While a callback like this sat
	 * in the memo's dependency list, EVERY render rebuilt the gesture — including
	 * the renders that happen while a swipe is still resolving (the deck appends a
	 * page, the tail is re-ranked).
	 *
	 * Replacing a live `Gesture.Pan` mid-gesture drops the in-flight touch, so
	 * `onEnd` never fires on the handler that saw `onBegin`: the turn is never
	 * scheduled, the handoff never runs, and the cards stay where the finger
	 * left them.
	 *
	 * A ref keeps the latest callback reachable without making its identity a
	 * reason to rebuild.
	 */
	const handlers = useRef({ onPage, onDismissed, onTapTarget });
	handlers.current = { onPage, onDismissed, onTapTarget };
	// Mirror into the module-level slot so `dispatchTapTarget` (which runs on
	// the JS thread via runOnJS) can reach it without a ref deref in a worklet.
	lastTapTarget = onTapTarget ?? null;
	// Clear on unmount so a late runOnJS hop can never call a dead callback.
	// The cleanup closure compares identity to avoid clobbering a newer mount.
	// biome-ignore lint/correctness/useExhaustiveDependencies: once per mount — the cleanup must compare against the callback installed AT mount
	useEffect(() => {
		const installed = onTapTarget ?? null;
		return () => {
			if (lastTapTarget === installed) lastTapTarget = null;
		};
	}, []);
	/**
	 * True from the instant a turn commits until the handoff completes.
	 *
	 * The gap between those two moments is not a frame: the spring is ~280ms.
	 * Any touch inside it used to write `tx`, cancelling the pending animation —
	 * and a cancelled animation never runs its completion callback, so the
	 * handoff that moves the deck never fired and the cards were stuck between
	 * two pages for good.
	 */
	const committed = useSharedValue(false);

	// JS-side bookkeeping only. Everything that affects a pixel this frame has
	// already happened on the UI thread in `handoff` below.
	const settle = useCallback((step: PageStep) => {
		handlers.current.onPage(step);
	}, []);

	/**
	 * The atomic handoff, all on the UI thread in one frame: move `topAbs` by
	 * the step and zero `tx`. A card's x is `(index - topAbs) * pitch + tx`,
	 * and `tx` has just arrived at `-step * pitch`, so every card's x is
	 * unchanged across this frame (`cardPageX`'s test).
	 */
	const handoff = useCallback(
		(step: PageStep) => {
			"worklet";
			topAbs.value = topAbs.value + step;
			tx.value = 0;
			// Re-arm LAST: the new top card is only touchable once the cursor has
			// actually moved, so a touch landing on this very frame cannot be
			// attributed to the card that just left.
			committed.value = false;
			runOnJS(settle)(step);
		},
		[topAbs, tx, committed, settle],
	);

	/** Slide a whole card on or back, then hand off. */
	const turn = useCallback(
		(step: PageStep) => {
			"worklet";
			// Before the animation is scheduled: from here until the handoff the
			// cards take no further input. Writing `tx` from a second gesture
			// cancels the spring below, and a cancelled animation never calls its
			// callback — which is the handoff, so the deck would never move.
			committed.value = true;
			// A dismissal's hole is long closed by the time a page can turn.
			hole.value = -1;
			tx.value = withSpring(-step * pitch, PAGE_SPRING, (finished) => {
				if (finished) handoff(step);
			});
		},
		[pitch, tx, hole, committed, handoff],
	);

	const settleDismiss = useCallback((done: boolean) => {
		handlers.current.onDismissed(done);
	}, []);

	/**
	 * A dismissal's handoff. For every card AFTER the one that left this is a
	 * page turn's — the cursor moves on by one in the frame the drag is zeroed.
	 * The cards before it do not see it at all: they hang off `hole`.
	 */
	const handoffDismiss = useCallback(() => {
		"worklet";
		topAbs.value = topAbs.value + 1;
		tx.value = 0;
		committed.value = false;
		runOnJS(settleDismiss)(true);
	}, [topAbs, tx, committed, settleDismiss]);

	// `runOnUI` serializes its closure: shared values and worklets are safe to
	// capture, a plain object holding them is not.
	const dismiss = useCallback(() => {
		runOnUI(() => {
			"worklet";
			if (committed.value) {
				runOnJS(settleDismiss)(false);
				return;
			}
			committed.value = true;
			hole.value = topAbs.value;
			gone.value = 0;
			gone.value = withTiming(1, {
				duration: DISMISS_MS,
				easing: Easing.in(Easing.quad),
			});
			tx.value = withDelay(
				CLOSE_DELAY_MS,
				withSpring(-pitch, PAGE_SPRING, (finished) => {
					if (finished) handoffDismiss();
				}),
			);
		})();
	}, [pitch, tx, topAbs, gone, hole, committed, handoffDismiss, settleDismiss]);

	// Destructured out of the capability object so the memo depends on the three
	// VALUES, not on object identity. The caller resolves a capability per render
	// (`capability(item)`), so a fresh-but-equal object arrives every frame during
	// a drag — keying the memo on it would rebuild the gesture mid-gesture.
	const { pannable, commits, maxDisplacementRatio } = capability;

	const gesture = useMemo(() => {
		return Gesture.Pan()
			.enabled(pannable)
			.activeOffsetX([-ACTIVE_OFFSET_X, ACTIVE_OFFSET_X])
			.failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
			.onUpdate((e) => {
				// Checked here rather than through `.enabled()` because `committed`
				// flips without rebuilding the gesture, and a rebuild mid-gesture
				// would drop the in-flight touch (§1.1).
				if (!panLive({ pannable, committed: committed.value })) return;
				const clamped = clampDisplacement(
					e.translationX,
					cardWidth,
					maxDisplacementRatio,
				);
				tx.value = pageDrag(
					clamped,
					backOpen.value && topAbs.value > floor.value,
				);
			})
			.onEnd((e) => {
				if (!panLive({ pannable, committed: committed.value })) return;
				const clamped = clampDisplacement(
					e.translationX,
					cardWidth,
					maxDisplacementRatio,
				);

				/**
				 * Tap-target dispatch. A stationary release (≤6pt, no flick) whose
				 * touch began on an interactive card target is a TAP — the explore
				 * link or the save heart — and it goes to `onTapTarget`, NOT through
				 * the paging machinery. The pan only runs `onEnd` when the pan
				 * actually activated; the exclusive tap only writes `tapSlot` when
				 * IT activated, and the two cannot both activate for one touch, so
				 * a swipe release can never be mistaken for a tap.
				 */
				const tap = isTapEnd(
					tapSlot.value,
					tapStatus.value,
					e.translationX,
					e.velocityX,
				);
				if (tap.tapped && tap.target) {
					// `handlers.current` is a REF — not readable from a worklet.
					// Route through the module-level dispatcher, which reads the
					// ref on the JS thread (inside `runOnJS`'s target).
					runOnJS(dispatchTapTarget)(tap.target);
					// Clear the slot so a stale target cannot fire twice.
					tapSlot.value = { target: null };
					return;
				}
				// `commits: false` turns every release into a spring back. Resolved
				// here, before anything fires, so such a card never reaches `onPage`.
				const step = pageStep(
					commitDecision(
						decideSwipe({
							translationX: clamped,
							translationY: e.translationY,
							velocityX: e.velocityX,
							cardWidth,
						}),
						commits,
					),
					backOpen.value && topAbs.value > floor.value,
				);
				if (step === 0) {
					tx.value = withSpring(0);
					return;
				}
				turn(step);
			});
	}, [
		cardWidth,
		pannable,
		commits,
		maxDisplacementRatio,
		turn,
		tx,
		topAbs,
		backOpen,
		floor,
		committed,
		tapSlot,
		tapStatus,
	]);

	const tapGesture = useMemo(() => {
		return (
			Gesture.Tap()
				.enabled(pannable)
				// RNGH's tap needs a small radius to call itself a tap; anything
				// beyond it fails and hands the touch back to the pan (exclusive).
				.maxDistance(TAP_MAX_DX)
				.onTouchesDown((_e, _mgr) => {
					tapStatus.value = { active: true };
					// The face's own `onTouchStart` (a real React handler on the
					// JS thread) already armed `tapSlot.target` before the
					// gesture's touchesDown fired. Nothing to do here.
				})
				.onStart(() => {
					tapStatus.value = { active: false };
					// The tap ACTIVATED — the finger stayed still. This is a
					// real tap; the pan FAILED (it needs ±10pt), so the pan's
					// onEnd will never run. Keep `tapSlot` armed: the tap's
					// own `onEnd` (below) dispatches it.
				})
				.onEnd((_e, success) => {
					tapStatus.value = { active: false };
					// ONLY dispatch when the tap actually ENDED successfully
					// (the finger stayed still). In `Gesture.Exclusive(pan,
					// tap)`, when the pan wins a swipe, the tap FAILS — and
					// RNGH still fires `onEnd` with `success: false`. Without
					// this guard, a swipe that started on the heart would
					// dispatch the stale armed target and fire the save/explore
					// action on a card the user was swiping past.
					// Cleared on EVERY release, successful or not: a face arms the
					// slot on touch start and nothing else clears it, so a swipe that
					// began on the heart used to leave "save" armed for the next bare
					// tap anywhere on the card. (When the pan wins, its own `onEnd`
					// is a swipe by construction — `isTapEnd` needs ≤6pt and the pan
					// needs ≥10pt to activate — so it never wanted the slot.)
					const target = tapSlot.value.target;
					tapSlot.value = { target: null };
					if (!success) return;
					// Not while the page is turning: the card under the finger is on
					// its way out, and React still names the old one as the top —
					// a tap now would hide or like a card the buyer is not looking at.
					if (committed.value) return;
					// A bare tap on the face is a tap on the CARD.
					runOnJS(dispatchTapTarget)(target ?? CARD_TAP_TARGET);
				})
		);
	}, [pannable, tapStatus, tapSlot, committed]);

	const page = useCallback(
		(step: PageStep) => {
			runOnUI(() => {
				"worklet";
				if (committed.value) return;
				turn(step);
			})();
		},
		[committed, turn],
	);

	return {
		gesture: Gesture.Exclusive(gesture, tapGesture),
		// The pan ALONE, for a card face that needs to block it. See `panGesture`
		// on the return type.
		panGesture: gesture,
		tx,
		topAbs,
		tapSlot,
		tapStatus,
		page,
		dismiss,
		gone,
		hole,
	};
}
