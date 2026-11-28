/**
 * SwipeStack — the deck as a row of cards paged sideways: the card in front,
 * the one before it parked off the left edge, and the next one a gap to its
 * right, where the screen shows a strip of it.
 *
 * Until phase414 this was a STACK: the top card flew out on a swipe, which
 * was its verdict, and the next rose from behind it. A swipe only browses now
 * (`lib/gesture/page-layer.ts`), so the cards sit side by side and a turned
 * page can be turned back. The name stayed with the file.
 *
 * Only the top card responds to the pan/tap gesture and, through the caller's
 * `renderCard(role)`, plays video.
 *
 * ## Why each card owns its own animated style
 *
 * Cards are keyed by item identity so that paging keeps a card's subtree —
 * the CardVideo player and its buffer survive the turn. The GestureDetector
 * sits on the card-sized frame rather than on the top card, for the same
 * reason.
 *
 * That identity-keying is in direct tension with per-POSITION animated styles,
 * and two device bugs came out of the tension in the stack's day:
 *
 *   1. *Ghosting.* A view's animated style was swapped as it was promoted, and
 *      Reanimated does not revert native props a detached style already wrote.
 *
 *   2. *Post-swipe jump.* Position was measured from React's `activeIndex` while
 *      the swipe itself resolved on the UI thread. The index advance and the drag
 *      reset therefore landed on different frames, and in between, the outgoing
 *      card sat in the top slot at offset 0 — snapping back to centre and
 *      flashing before it was replaced.
 *
 * The fix for both is the same and is kept: geometry is a pure function of the
 * card's ABSOLUTE index (`StackCard`, one `useAnimatedStyle` per card, created
 * once and never swapped) measured against a UI-thread `topAbs` cursor. React's
 * `activeIndex` decides only WHICH cards are mounted, never where they are
 * drawn — so a late re-render changes the mounted window without moving a
 * single pixel.
 *
 * There is exactly ONE face per card. A tap used to crossfade to a §0.5 data
 * face; the owner cut that mechanic on 2026-07-30 ("砍掉flip back的功能").
 *
 * Generic over the card data type — it knows nothing about feed semantics; it
 * reports the step and the item that was in front to the caller. What each
 * item may DO arrives through `capability(item)`, resolved by the caller
 * (§1.3), so nothing in here branches on a card kind.
 *
 * `tx` — the live drag offset — is handed to the render callbacks because the
 * trade-off card's halves brighten with the finger.
 *
 * ## A card can be taken out of the row (phase415)
 *
 * `dismiss` removes the card in front — it drops away where it stands and the
 * cards after it close up — and the caller then takes it out of `items`. Every
 * card after it moves up one index, so a card's index in `items` is no longer
 * fixed for its lifetime. What IS fixed is its **UI index**: the number its
 * style was created with. `shift` is the difference between the two, read off
 * a card the stack already knows (keys must therefore survive a removal —
 * `lib/feed/deck-key.ts`). After a removal the cards on screen keep their UI
 * index, the cursor is already where it should be, and nothing moves.
 */
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import {
	GestureDetector,
	type GestureType,
} from "react-native-gesture-handler";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import { useSwipeCard } from "../hooks/use-swipe-card";
import {
	type CardCapability,
	INERT_CAPABILITY,
} from "../lib/gesture/capability";
import { dismissExit } from "../lib/gesture/dismiss-exit";
import { type PageStep, cardPageX } from "../lib/gesture/page-layer";
import type { TapSlot, TapStatus } from "../lib/gesture/tap-slot";
import { cardFrameHeight } from "../theme/card-frame";
import { colors, radii } from "../theme/tokens";

/**
 * How many cards stay mounted either side of the one in front. One: the card
 * before it, to turn back to, and the next, whose edge shows.
 */
const AROUND = 1;

type CardRole = "top" | "next" | "after";

/** The imperative handle passed to `onPagerReady`. */
export interface PagerHandle {
	/** Turn the page without a drag — on (1) or back (-1) — with the same slide. */
	page: (step: PageStep) => void;
	/**
	 * Take the card in front out of the row. `leavingMark` lands on it, it
	 * greys and falls off the bottom (`lib/gesture/dismiss-exit.ts`), the
	 * cards after it close up, and `onDismissed` then names it — the caller
	 * must remove it from `items` there.
	 */
	dismiss: () => void;
}

/** What a face needs to animate with the drag. `tx` is live on the UI thread. */
export interface CardRenderArgs {
	role: CardRole;
	tx: SharedValue<number>;
	cardWidth: number;
	/**
	 * The tap gesture's target slot — an interactive card target (save heart,
	 * explore link) writes its tap id into it on touch start; the pan's `onEnd`
	 * reads it to decide whether the release was a tap. See
	 * `lib/gesture/tap-slot.ts` for why this exists at all.
	 */
	tapSlot?: SharedValue<TapSlot>;
	/** The tap gesture's live state. Only used to disarm a stale slot. */
	tapStatus?: SharedValue<TapStatus>;
	/**
	 * The deck's own pan/tap composition, so a face can build a gesture that
	 * BLOCKS it — `Gesture.Pan().blocksExternalGesture(deckGesture)`.
	 *
	 * The community card's progress bar is the case this exists for: scrubbing
	 * it is a horizontal drag, which is also the swipe, and without an explicit
	 * relation the two race. Whoever activates first wins, and the deck's pan
	 * needs 10pt of travel while a scrub wants to start immediately — so the
	 * scrub usually wins, and "usually" is how a buyer loses the card they were
	 * trying to rewind.
	 *
	 * Handed down rather than looked up: the gesture is built in `useSwipeCard`
	 * and a face has no other route to it.
	 */
	deckGesture?: GestureType;
}

/**
 * Role from the card's distance to the one in front.
 *
 * Only the card at depth 0 is top: `renderCard` maps the top role to `isTop`,
 * which is what `CardVideo` uses to decide whether to play, and a card that is
 * not in front must not (owner on device, 2026-07-28: "ios上面划走listing视频后
 * 音乐没有停止"). Geometry does not read the role at all.
 */
function roleFor(depth: number): CardRole {
	if (depth === 0) return "top";
	if (depth === 1) return "next";
	return "after";
}

export interface SwipeStackProps<T> {
	items: readonly T[];
	activeIndex: number;
	/** The page turned: `item` is the card that was in front when it did. */
	onPage: (step: PageStep, item: T) => void;
	/** Whether a swipe may turn back. False on the first card of a visit. */
	canGoBack: boolean;
	/** A `dismiss` has run: take `item` out of `items` now. */
	onDismissed?: (item: T) => void;
	/**
	 * What lands on the middle of a card as it is dismissed — the caller's
	 * way of saying WHY it is leaving. The stack only places and times it.
	 */
	leavingMark?: React.ReactNode;

	/**
	 * Called when a release was a TAP on an interactive card target (the save
	 * heart / the explore link). The target's tap id (`"save:<id>"` /
	 * `"explore:<id>"`) is what the feed maps to the right action; the
	 * exclusive-tap gesture (see `useSwipeCard`) detects the tap, so a
	 * Pressable-vs-Pan conflict is impossible by construction.
	 */
	onTapTarget?: (target: string) => void;

	/**
	 * Called with a stable handle that turns the page, or takes the card in
	 * front out, for the caller.
	 */
	onPagerReady?: (pager: PagerHandle) => void;

	renderCard: (item: T, args: CardRenderArgs) => React.ReactNode;
	/**
	 * React key per mounted card. MUST be unique across the whole `items` array,
	 * and must not change for a card that stays in it when another is taken
	 * out — the stack finds its place again by this key.
	 *
	 * A content id alone is NOT unique here: §1.9 has the composer deliberately
	 * re-emit a card the buyer has already seen once fresh inventory runs out
	 * ("循环 + seen 角标"), so the same card id legitimately appears at two
	 * positions in one deck. Keying on it alone made React log "Encountered two
	 * children with the same key" and then reuse or omit one of the two subtrees —
	 * which is what a flashing card and a card that would not leave actually were.
	 */
	keyExtractor: (item: T, index: number) => string;
	cardWidth: number;
	/** The paper between two cards. */
	cardGap: number;
	/**
	 * Explicit card height. 2026-08-13: the feed no longer passes one — the
	 * card fills the container (`flex: 1`), so height is derived from the
	 * available space.
	 */
	cardHeight?: number;
	/** §1.3 per-item gesture capability. Resolved before the gesture is built. */
	capability: (item: T) => CardCapability;
}

interface StackCardProps {
	/**
	 * This card's UI index: its index in `items` plus the stack's `shift`.
	 * Fixed for as long as the card is on screen — the one exception is the
	 * card BEFORE a dismissed one, which `hole` covers.
	 */
	uiIndex: number;
	/** UI index of the card in front, on the UI thread. */
	topAbs: SharedValue<number>;
	dragX: SharedValue<number>;
	/** This is the card a `dismiss` is taking out. */
	leaving: boolean;
	/** Drawn over a leaving card's middle (`SwipeStackProps.leavingMark`). */
	leavingMark: React.ReactNode;
	gone: SharedValue<number>;
	hole: SharedValue<number>;
	cardWidth: number;
	/** Card to card: a card's width plus the gap. */
	pitch: number;
	/** The y every card rests at (see `restTop` in `SwipeStack`). */
	restTop: number;
	/** The card frame's height in points (see `cardFrameHeight`). */
	frameHeight: number;
	/** The card's only face. */
	front: React.ReactNode;
}

/**
 * One card's frame. Its animated style is created once, with `uiIndex`
 * captured as a constant, and is never swapped for another — which is what
 * makes the stale-prop ghosting and the handoff jump structurally impossible
 * rather than merely fixed. Every branch writes the SAME props, for the first
 * of those reasons.
 *
 * ── A dismissal, in three kinds of card ─────────────────────────────────────
 *
 * The card LEAVING stays where it stands while the mark lands on it and the
 * picture greys, then falls off the bottom — all from `gone`, through
 * `dismissExit`. It is told by a prop rather than by its index: an index can
 * be handed to another card before this one unmounts.
 *
 * The cards AFTER it follow the drag as on any page turn — it carries them up
 * one place, and the handoff moves the cursor in the frame it is zeroed.
 *
 * The cards BEFORE it must not move at all, and that handoff would move them:
 * the cursor steps past a card that is no longer there. So while `hole` names
 * the gap they are drawn relative to IT. When the caller's list catches up,
 * such a card's UI index rises by one — to `hole` itself, which is no longer
 * "before" it — and the ordinary formula puts it in exactly the same place.
 * Both descriptions agree, so it does not matter which frame the list lands on.
 */
function StackCard({
	uiIndex,
	topAbs,
	dragX,
	leaving,
	leavingMark,
	gone,
	hole,
	cardWidth,
	pitch,
	restTop,
	frameHeight,
	front,
}: StackCardProps) {
	// Every card is the same box (`cardFrameHeight`) at the same height on the
	// page; the only thing that moves one is the page turning.
	const box = { width: cardWidth, height: frameHeight, top: restTop };
	const style = useAnimatedStyle(() => {
		if (leaving) {
			const exit = dismissExit(gone.value, frameHeight);
			return {
				opacity: exit.opacity,
				transform: [
					{ translateX: 0 },
					{ translateY: exit.dropY },
					{ rotate: `${exit.turnDeg}deg` },
				],
			};
		}
		const x =
			hole.value >= 0 && uiIndex < hole.value
				? (uiIndex - hole.value) * pitch
				: cardPageX(uiIndex - topAbs.value, dragX.value, pitch);
		return {
			opacity: 1,
			transform: [{ translateX: x }, { translateY: 0 }, { rotate: "0deg" }],
		};
	});
	// Only a leaving card mounts the two views these drive, and it mounts
	// them animated from the start.
	const washStyle = useAnimatedStyle(() => ({
		opacity: leaving ? dismissExit(gone.value, frameHeight).wash : 0,
	}));
	const markStyle = useAnimatedStyle(() => {
		const exit = dismissExit(leaving ? gone.value : 0, frameHeight);
		return {
			opacity: exit.markOpacity,
			transform: [{ scale: exit.markScale }],
		};
	});

	return (
		<>
			{/* The WIDE half of the two-shadow elevation (owner 2026-08-14:
			    `0 16px 38px rgba(32,28,22,.085)`), on a shadow-only view BEHIND
			    the card so it follows the card's real bounds. Same box and the
			    same animated x as the card, no touch handling. */}
			<Animated.View
				pointerEvents="none"
				style={[styles.cardGlow, box, leaving && styles.over, style]}
			/>
			{/* A leaving card falls OVER the one sliding into its place. */}
			<Animated.View style={[styles.card, box, leaving && styles.over, style]}>
				<View style={StyleSheet.absoluteFill}>{front}</View>
				{leaving && (
					<>
						<Animated.View
							pointerEvents="none"
							style={[StyleSheet.absoluteFill, styles.wash, washStyle]}
						/>
						<Animated.View
							pointerEvents="none"
							style={[StyleSheet.absoluteFill, styles.mark, markStyle]}
						>
							{leavingMark}
						</Animated.View>
					</>
				)}
			</Animated.View>
		</>
	);
}

export function SwipeStack<T>({
	items,
	activeIndex,
	onPage,
	canGoBack,
	onDismissed,
	leavingMark,
	onTapTarget,
	onPagerReady,

	renderCard,
	keyExtractor,
	cardWidth,
	cardGap,
	cardHeight,
	capability,
}: SwipeStackProps<T>) {
	const top = items[activeIndex];
	const pitch = cardWidth + cardGap;

	const topCapability: CardCapability =
		top === undefined ? INERT_CAPABILITY : capability(top);

	// Geometry does not depend on this range — only on each card's UI index —
	// so widening or narrowing it cannot move anything the buyer sees.
	const from = Math.max(0, activeIndex - AROUND);
	const to = Math.min(items.length, activeIndex + AROUND + 1);
	const mounted: { item: T; absIndex: number; key: string }[] = [];
	for (let i = from; i < to; i++) {
		const item = items[i];
		if (item !== undefined) {
			mounted.push({ item, absIndex: i, key: keyExtractor(item, i) });
		}
	}

	/**
	 * `shift`: a card's UI index minus its index in `items`. Read off a card
	 * the stack already drew — the one in front if it can be, since after a
	 * removal that card and the one after it are the two that kept their UI
	 * index. With no card known (a new deck) the last shift is as good as any.
	 *
	 * Written during render, and safe to: the result is a function of the keys
	 * and the map, and running it twice gives the same map.
	 */
	const uiIndexOf = useRef(new Map<string, number>());
	const lastShift = useRef(0);
	const anchor =
		mounted.find(
			(m) => m.absIndex === activeIndex && uiIndexOf.current.has(m.key),
		) ??
		mounted.find(
			(m) => m.absIndex > activeIndex && uiIndexOf.current.has(m.key),
		) ??
		mounted.find((m) => uiIndexOf.current.has(m.key));
	const shift = anchor
		? (uiIndexOf.current.get(anchor.key) ?? 0) - anchor.absIndex
		: lastShift.current;
	lastShift.current = shift;
	uiIndexOf.current = new Map(mounted.map((m) => [m.key, m.absIndex + shift]));

	/** The card a `dismiss` is taking out, from the tap until it is removed. */
	const [leavingKey, setLeavingKey] = useState<string | null>(null);
	const leavingItem = useRef<T | null>(null);

	const {
		gesture,
		panGesture,
		tx,
		topAbs,
		tapSlot,
		tapStatus,
		page,
		dismiss,
		gone,
		hole,
	} = useSwipeCard({
		cardWidth,
		pitch,
		capability: topCapability,
		canGoBack,
		// Index 0 of `items`, as a UI index.
		firstIndex: shift,
		onPage: (step) => {
			if (top) onPage(step, top);
		},
		onDismissed: (done) => {
			const item = leavingItem.current;
			leavingItem.current = null;
			// In the same commit as the caller's removal, so the card is never
			// drawn again without its `leaving`.
			setLeavingKey(null);
			if (done && item !== null) onDismissed?.(item);
		},
		onTapTarget: (target) => {
			if (target === "__touchdown__") return;
			if (top) onTapTarget?.(target);
		},
	});

	/**
	 * Keep the UI-thread cursor in step with React.
	 *
	 * For a page turn or a dismissal this is idempotent: the handoff worklet
	 * already moved `topAbs` to exactly this value one or two frames ago, so
	 * the write changes nothing and the late re-render cannot move a card. For
	 * an index the caller set itself (a recomposed deck starts again at 0) no
	 * worklet ran, so this is what moves the cards — a layout effect rather
	 * than a passive one so it lands in the same commit.
	 */
	useLayoutEffect(() => {
		topAbs.value = activeIndex + shift;
	}, [activeIndex, shift, topAbs]);

	/**
	 * The caller's list has caught up with a dismissal: every card left has
	 * its own UI index again and nothing hangs off the gap.
	 *
	 * Two frames late on purpose. The card before the gap is right under
	 * either description only while `hole` is still set or its new UI index
	 * has reached the UI thread; clearing `hole` first would draw it a card
	 * too far left for a frame. Nothing needs the gap cleared sooner — a page
	 * turn clears it for itself.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: `shift` is the trigger — it changes when a card before the cursor leaves `items`
	useEffect(() => {
		let second = 0;
		const first = requestAnimationFrame(() => {
			second = requestAnimationFrame(() => {
				hole.value = -1;
			});
		});
		return () => {
			cancelAnimationFrame(first);
			cancelAnimationFrame(second);
		};
	}, [shift, hole]);
	useLayoutEffect(() => {
		if (leavingKey === null) gone.value = 0;
	}, [leavingKey, gone]);

	const topKey = mounted.find((m) => m.absIndex === activeIndex)?.key;
	const inFront = useRef<{ item: T; key: string } | null>(null);
	inFront.current =
		top !== undefined && topKey !== undefined
			? { item: top, key: topKey }
			: null;

	// `page` and `dismiss` are stable until the card's width changes, and the
	// caller keeps the handle in a ref.
	useEffect(() => {
		onPagerReady?.({
			page,
			dismiss: () => {
				const front = inFront.current;
				if (front === null || leavingItem.current !== null) return;
				leavingItem.current = front.item;
				setLeavingKey(front.key);
				dismiss();
			},
		});
	}, [onPagerReady, page, dismiss]);

	/**
	 * The FIXED stage (owner spec 2026-08-15: 「页面骨架固定, card 可以不同
	 * 高度」). `flex: 1` inside the padded container makes it deterministic —
	 * and it is the SAME box for every card kind, so nothing a card does can
	 * move the page skeleton. Every card is the FILM's shape inside it
	 * (`cardFrameHeight`), capped by the stage.
	 */
	const [stageHeight, setStageHeight] = useState(0);
	const onStageLayout = useCallback((e: LayoutChangeEvent) => {
		setStageHeight(e.nativeEvent.layout.height);
	}, []);

	// EVERY card is the same box (owner 2026-08-17 — one frame height for all
	// kinds): the tour canvas's own aspect, capped by the stage, or the
	// caller's fixed `cardHeight`. One number for the whole deck, not a
	// per-kind lookup, so a page turn cannot change the frame height.
	//
	// Since 2026-09-05 this is derived from the card's WIDTH rather than as a
	// share of the stage (see `theme/card-frame.ts`).
	const frameHeight =
		cardHeight !== undefined
			? cardHeight
			: // Pre-layout there is no stage yet, so no height either; the cards
				// land the frame they will keep as soon as it arrives.
				cardFrameHeight(stageHeight, cardWidth);
	/**
	 * Where the cards rest: a THIRD of the stage's slack above them, two thirds
	 * below (2026-09-07). The feed's stage has been the card's own box since
	 * phase380, so this is 0 there.
	 */
	const restTop =
		stageHeight === 0 ? 0 : Math.max(0, (stageHeight - frameHeight) / 3);

	const argsFor = (role: CardRole): CardRenderArgs => ({
		role,
		tx,
		cardWidth,
		tapSlot,
		tapStatus,
		deckGesture: panGesture,
	});

	return (
		<View style={styles.stack} onLayout={onStageLayout}>
			<GestureDetector gesture={gesture}>
				<View style={[styles.frame, { width: cardWidth }]}>
					{mounted.map(({ item, absIndex, key }) => (
						<StackCard
							key={key}
							uiIndex={absIndex + shift}
							topAbs={topAbs}
							dragX={tx}
							leaving={key === leavingKey}
							leavingMark={leavingMark}
							gone={gone}
							hole={hole}
							cardWidth={cardWidth}
							pitch={pitch}
							restTop={restTop}
							frameHeight={frameHeight}
							front={renderCard(item, argsFor(roleFor(absIndex - activeIndex)))}
						/>
					))}
				</View>
			</GestureDetector>
		</View>
	);
}

const styles = StyleSheet.create({
	/**
	 * The STAGE (owner spec 2026-08-15). `flex: 1` inside the padded container
	 * makes it deterministic, and it is the SAME box for every card kind, so
	 * nothing a card does can move the page skeleton.
	 *
	 * Where the cards sit inside it is `restTop`, not this box's alignment —
	 * the frame stretches to the whole stage and the cards are absolutely
	 * positioned within it.
	 */
	stack: { flex: 1, alignItems: "center", justifyContent: "center" },
	/**
	 * The card frame — the fixed stage box (width from `cardWidth`, height
	 * from `flex: 1` inside the padded container) and positioning context for
	 * the absolutely-placed cards. Nothing clips it: the card before and the
	 * card after are drawn outside it, and the screen's own edge is what cuts
	 * them. No shadow here — both elevation layers live on the card view.
	 */
	frame: {
		flex: 1,
		alignSelf: "stretch",
	},
	/**
	 * The WIDE elevation layer behind each card (owner 2026-08-14:
	 * `0 16px 38px rgba(32,28,22,.085)`). A shadow-only view — same box as the
	 * card it backs, `pointerEvents: none`, no background — because RN
	 * supports exactly ONE shadow per view.
	 */
	over: { zIndex: 2 },
	/**
	 * The grey over a dismissed card's picture. iOS has no greyscale filter
	 * for a view, so the picture is covered rather than drained: a neutral
	 * grey at `WASH_OPACITY` leaves its shapes and takes its colour.
	 */
	wash: { backgroundColor: "#4A4A48" },
	mark: { alignItems: "center", justifyContent: "center" },
	cardGlow: {
		position: "absolute",
		left: 0,
		borderRadius: radii.card,
		shadowColor: "rgba(32,28,22,0.085)",
		shadowOffset: { width: 0, height: 16 },
		shadowRadius: 38,
		shadowOpacity: 1,
	},
	card: {
		position: "absolute",
		left: 0,
		borderRadius: radii.card,
		overflow: "hidden",
		backgroundColor: colors.ink, // card face is always dark (§0.3)
		/**
		 * Soft lift off the paper background — the TIGHT half of the owner's
		 * two-shadow elevation spec (2026-08-14: `0 3px 10px rgba(32,28,22,.05)`).
		 * The WIDE layer (`0 16px 38px .085`) is a separate shadow-only view
		 * behind the card (same bounds, `pointerEvents: none`) — RN supports
		 * exactly ONE shadow per view.
		 *
		 * `overflow: hidden` above clips this view's CHILDREN, not its shadow,
		 * and no ancestor (`stack`, `stackWrap`) clips either — so the shadow is
		 * free to spill past the card's own inset.
		 */
		shadowColor: "rgba(32,28,22,0.05)",
		shadowOffset: { width: 0, height: 3 },
		shadowRadius: 10,
		/**
		 * iOS multiplies `shadowColor`'s alpha by `shadowOpacity`, which defaults
		 * to 0 — without this line the colour above renders nothing at all. 1
		 * keeps the 0.06 the owner specified as the effective opacity.
		 */
		shadowOpacity: 1,
		elevation: 6,
	},
});
