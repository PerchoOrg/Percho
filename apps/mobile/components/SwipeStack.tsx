/**
 * SwipeStack (§0.6 #7) — the top card plus the two behind it at the spec resting
 * values (next = 0.94/0.5, after = 0.88/0.25), and the card that just left,
 * still mounted while it finishes flying out.
 *
 * Only the top card responds to the pan/tap gesture and, through the caller's
 * `renderCard(role)`, plays video. As the top card is dragged the next card rises
 * toward scale 1 / opacity 1.
 *
 * ## Why each card owns its own animated style
 *
 * Cards are keyed by item identity so that promoting the next card to top
 * preserves its subtree — the CardVideo player and its buffer survive the swipe.
 * The GestureDetector sits on the card-sized frame rather than on the top card,
 * for the same reason.
 *
 * That identity-keying is in direct tension with per-POSITION animated styles,
 * and two device bugs came out of the tension:
 *
 *   1. *Ghosting.* A view's animated style was swapped as it was promoted, and
 *      Reanimated does not revert native props a detached style already wrote.
 *      The old top style set only `transform`, so the `opacity: 0.5` written by
 *      the style it replaced stayed on the promoted card and the cards behind
 *      bled through it — two or three titles legible at once.
 *
 *   2. *Post-swipe jump.* Position was measured from React's `activeIndex` while
 *      the swipe itself resolved on the UI thread. The index advance and the drag
 *      reset therefore landed on different frames, and in between, the outgoing
 *      card sat in the top slot at offset 0 — snapping back to centre and
 *      flashing before it was replaced.
 *
 * The fix for both is the same: geometry is a pure function of the card's
 * ABSOLUTE index (`StackCard`, one `useAnimatedStyle` per card, created once and
 * never swapped) measured against a UI-thread `topAbs` cursor. React's
 * `activeIndex` now decides only WHICH cards are mounted, never where they are
 * drawn — so a late re-render changes the mounted window without moving a single
 * pixel, and there is no frame in which any card's transform is inconsistent.
 *
 * There is exactly ONE face per card. A tap used to crossfade to a §0.5 data
 * face (`renderBack`, `flipProgress`, `faceOpacity`, `canFlipCard`); the owner
 * cut that mechanic on 2026-07-30 ("砍掉flip back的功能"), so a card renders its
 * front and nothing else, and the only gesture on the stack is the pan.
 *
 * Generic over the card data type — task-0 knows nothing about feed semantics;
 * it reports the raw `'left' | 'right'` decision and the item to the caller.
 * What each item may DO arrives through `capability(item)`, resolved by the
 * caller (§1.3), so nothing in here branches on a card kind.
 *
 * `tx` — the live drag offset — is handed to the render callbacks because two
 * §1.6/§1.8 faces are defined in terms of it: the trade-off card's halves
 * brighten with the finger and the direction labels fade in with it. Without it
 * exposed, those faces cannot be built at all.
 */
import { useEffect, useLayoutEffect } from "react";
import { StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnUI,
	type SharedValue,
	useAnimatedStyle,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { useSwipeCard } from "../hooks/use-swipe-card";
import {
	type CardCapability,
	INERT_CAPABILITY,
} from "../lib/gesture/capability";
import { VISIBLE_WINDOW, cardStackVisual } from "../lib/gesture/stack-layer";
import type { TapSlot, TapStatus } from "../lib/gesture/tap-slot";
import { colors, radii } from "../theme/tokens";

/** Cards visible at rest: top + 2 behind (§0.6 #7). Shared with the composer. */
const WINDOW = VISIBLE_WINDOW;
/**
 * How many already-swiped cards stay mounted. Exactly one: the card that just
 * committed has to remain in the tree to finish its flyout, and to stay parked
 * off-screen for the frame or two before React drops it.
 */
const TRAIL = 1;

type CardRole = "top" | "next" | "after";

/** The imperative swipe-hint handle passed to `onHintReady`. */
export interface SwipeHintHandle {
	/**
	 * Nudge the stack left 16pt and back — the swipe-hint. Runs on the UI
	 * thread; safe to call after mount (no-op if the stack is gone).
	 */
	nudge: () => void;
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
}

/**
 * Role from stack depth.
 *
 * `depth < 0` is a card that has ALREADY been swiped and is only still mounted
 * to finish its flyout (see `TRAIL`). It must NOT be "top".
 *
 * It used to be: `depth <= 0` returned "top", which meant the outgoing card kept
 * the top role for as long as it stayed in the tree — and `renderCard` maps the
 * top role to `isTop`, which is what `CardVideo` uses to decide whether to play.
 * So a swiped-away listing kept playing, with sound, underneath the new card.
 * Owner on device (2026-07-28): "ios上面划走listing视频后音乐没有停止".
 *
 * Only the card at depth 0 is top. Geometry does not read the role at all (it is
 * a pure function of the absolute index), so narrowing this cannot move a pixel —
 * it only changes what the card is told it is.
 */
function roleFor(depth: number): CardRole {
	if (depth === 0) return "top";
	if (depth === 1) return "next";
	return "after";
}

export interface SwipeStackProps<T> {
	items: readonly T[];
	activeIndex: number;
	onDecision: (decision: "left" | "right", item: T) => void;

	/**
	 * Called when a release was a TAP on an interactive card target (the save
	 * heart / the explore link). The target's tap id (`"save:<id>"` /
	 * `"explore:<id>"`) is what the feed maps to the right action; the
	 * exclusive-tap gesture (see `useSwipeCard`) detects the tap, so a
	 * Pressable-vs-Pan conflict is impossible by construction.
	 */
	onTapTarget?: (target: string) => void;

	/**
	 * Optional imperative nudge — the swipe-hint (owner 2026-08-13). Called
	 * ONCE on mount with a stable handle whose methods run the nudge on the
	 * UI thread via `runOnUI` on the stack's own shared values (never capture
	 * a plain object with `runOnUI` — Reanimated serializes closure
	 * captures, and a shared-value-backed object is not serializable).
	 * The feed plays it once when the first card settles; other callers
	 * (dev-foundation) simply omit it.
	 */
	onHintReady?: (hint: SwipeHintHandle) => void;

	renderCard: (item: T, args: CardRenderArgs) => React.ReactNode;
	/** Overlay above the top card only — §1.8 direction labels live here. */
	renderOverlay?: (item: T, args: CardRenderArgs) => React.ReactNode;
	/**
	 * React key per mounted card. MUST be unique across the whole `items` array,
	 * which is why the absolute index is passed in.
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
	/**
	 * Explicit card height. 2026-08-13: the feed no longer passes one — the
	 * card fills the container (`flex: 1`), so height is derived from the
	 * available space. `dev-foundation` still passes a fixed height.
	 */
	cardHeight?: number;
	/** §1.3 per-item gesture capability. Resolved before the gesture is built. */
	capability: (item: T) => CardCapability;
}

interface StackCardProps {
	/** This card's index in `items`. Fixed for the card's whole lifetime. */
	absIndex: number;
	/** UI-thread absolute index of the current top card. */
	topAbs: SharedValue<number>;
	advance: SharedValue<number>;
	dragX: SharedValue<number>;
	exitX: SharedValue<number>;
	cardWidth: number;
	zIndex: number;
	/** The card's only face. */
	front: React.ReactNode;
	/** §1.8 labels — above both faces, outside the crossfade. */
	overlay: React.ReactNode;
}

/**
 * One card's frame. Its animated styles are created once, with `absIndex`
 * captured as a constant, and are never swapped for another — which is what makes
 * the stale-prop ghosting and the handoff jump structurally impossible rather
 * than merely fixed.
 */
function StackCard({
	absIndex,
	topAbs,
	advance,
	dragX,
	exitX,
	cardWidth,
	zIndex,
	front,
	overlay,
}: StackCardProps) {
	const style = useAnimatedStyle(() => {
		const v = cardStackVisual({
			rel: absIndex - topAbs.value,
			advance: advance.value,
			dragX: dragX.value,
			exitX: exitX.value,
			cardWidth,
		});
		return {
			transform: [
				{ translateX: v.translateX },
				{ rotate: `${v.rotateDeg}deg` },
				{ scale: v.scale },
			],
			opacity: v.opacity,
		};
	});

	return (
		<Animated.View style={[styles.card, { zIndex }, style]}>
			<View style={StyleSheet.absoluteFill}>{front}</View>
			{overlay}
		</Animated.View>
	);
}

export function SwipeStack<T>({
	items,
	activeIndex,
	onDecision,
	onTapTarget,
	onHintReady,

	renderCard,
	renderOverlay,
	keyExtractor,
	cardWidth,
	cardHeight,
	capability,
}: SwipeStackProps<T>) {
	const top = items[activeIndex];

	const topCapability: CardCapability =
		top === undefined ? INERT_CAPABILITY : capability(top);

	const { gesture, tx, topAbs, exitX, advance, tapSlot, tapStatus } =
		useSwipeCard({
			cardWidth,
			capability: topCapability,
			onDecision: (decision) => {
				if (top) onDecision(decision, top);
			},
			onTapTarget: (target) => {
				if (target === "__touchdown__") return;
				if (top) onTapTarget?.(target);
			},
		});

	/**
	 * Keep the UI-thread cursor in step with React.
	 *
	 * For a SWIPE this is idempotent: the handoff worklet already advanced
	 * `topAbs` to exactly this value one or two frames ago, so the write changes
	 * nothing and the late re-render cannot move a card. For a TAP-driven advance
	 * (ask skip / "Not sure" / milestone CTA) no worklet ran, so this is what
	 * moves the stack — a layout effect rather than a passive one so it lands in
	 * the same commit and the promoted card is never painted at 0.94.
	 */
	useLayoutEffect(() => {
		topAbs.value = activeIndex;
	}, [activeIndex, topAbs]);

	// Hand the live shared values to the caller ONCE (the swipe-hint needs
	// them to run its nudge on the UI thread; it must not re-fire on every
	// render, which would reset the hint's run-once latch).
	// biome-ignore lint/correctness/useExhaustiveDependencies: deliver once on mount; `tx`/`advance` are stable shared values.
	useEffect(() => {
		const handle: SwipeHintHandle = {
			nudge: () => {
				// Run the animation on the UI thread. `runOnUI` serializes the
				// closure — capturing `tx`/`advance` (SharedValues) directly is
				// safe; capturing the handle itself is not.
				runOnUI(() => {
					"worklet";
					tx.value = withSequence(
						withTiming(-16, { duration: 240 }),
						withTiming(0, { duration: 240 }),
					);
					advance.value = withSequence(
						withTiming(0.035, { duration: 240 }),
						withTiming(0, { duration: 240 }),
					);
				})();
			},
		};
		if (onHintReady) onHintReady(handle);
	}, [onHintReady]);

	const argsFor = (role: CardRole): CardRenderArgs => ({
		role,
		tx,
		cardWidth,
		tapSlot,
		tapStatus,
	});

	// The mounted window trails one card behind `activeIndex` so a committed card
	// can finish flying out. Geometry does not depend on this range — only on
	// each card's absolute index — so widening or narrowing it cannot move
	// anything the buyer sees.
	// Exactly WINDOW live cards. Mounting a fourth would stack another 0.25-opacity
	// layer directly behind the `after` card at the same clamped depth, and two
	// translucent layers compound into a visibly darker card — the ghosting class
	// of bug all over again.
	const from = Math.max(0, activeIndex - TRAIL);
	const to = Math.min(items.length, activeIndex + WINDOW);
	const mounted: { item: T; absIndex: number }[] = [];
	for (let i = from; i < to; i++) {
		const item = items[i];
		if (item !== undefined) mounted.push({ item, absIndex: i });
	}

	return (
		<View style={styles.stack}>
			<GestureDetector gesture={gesture}>
				<View
					style={[
						styles.frame,
						{ width: cardWidth },
						cardHeight !== undefined
							? { height: cardHeight }
							: styles.frameCapped,
					]}
				>
					{mounted.map(({ item, absIndex }) => {
						const depth = absIndex - activeIndex;
						const isTop = depth === 0;
						const role = roleFor(depth);
						return (
							<StackCard
								key={keyExtractor(item, absIndex)}
								absIndex={absIndex}
								topAbs={topAbs}
								advance={advance}
								dragX={tx}
								exitX={exitX}
								cardWidth={cardWidth}
								// A card that has already been swiped must stay UNDER the
								// live stack while it flies out, or it would slide across
								// the face of the card that replaced it.
								zIndex={depth < 0 ? 0 : WINDOW + TRAIL - depth}
								front={renderCard(item, argsFor(role))}
								// §1.8 labels sit above the face.
								overlay={
									isTop && renderOverlay
										? renderOverlay(item, argsFor(role))
										: null
								}
							/>
						);
					})}
				</View>
			</GestureDetector>
		</View>
	);
}

const styles = StyleSheet.create({
	stack: { flex: 1, alignItems: "center", justifyContent: "center" },
	/**
	 * The card frame. With `cardHeight` absent (feed) it stretches to the
	 * container's full height — `flex: 1` inside the padded CardContainer —
	 * so the card fills the screen instead of the old centered 0.74 box.
	 *
	 * Carries the WIDE half of the card's two-shadow elevation (owner,
	 * 2026-08-14: `0 16px 38px rgba(32,28,22,.085)`). RN views support
	 * exactly ONE shadow each, so the wide layer lives on the frame (same
	 * size as the card, no clipping above it) and the tight contact layer
	 * on `card` below. No border anywhere.
	 */
	frame: {
		flex: 1,
		alignSelf: "stretch",
		shadowColor: "rgba(32,28,22,0.085)",
		shadowOffset: { width: 0, height: 16 },
		shadowRadius: 38,
		/**
		 * iOS multiplies `shadowColor`'s alpha by `shadowOpacity`, which
		 * defaults to 0 — without this the colour above renders nothing.
		 */
		shadowOpacity: 1,
	},
	/**
	 * The feed's height cap (owner, 2026-08-14: the card still reads too tall).
	 * `flex: 1` would take the container's whole height; `maxHeight: 95%` gives
	 * back 5% of it, and `stack`'s `justifyContent: "center"` splits the freed
	 * space evenly above and below — so the card shrinks about its own centre
	 * and paper shows top AND bottom.
	 *
	 * Applied only on the flex path: `dev-foundation` passes an explicit
	 * `cardHeight`, and clamping a fixed height against its container would
	 * silently resize a screen this change has nothing to do with.
	 */
	frameCapped: { maxHeight: "95%" },
	card: {
		...StyleSheet.absoluteFillObject,
		borderRadius: radii.card,
		overflow: "hidden",
		backgroundColor: colors.ink, // card face is always dark (§0.3)
		/**
		 * Soft lift off the paper background — the TIGHT half of the owner's
		 * two-shadow elevation spec (2026-08-14: `0 3px 10px rgba(32,28,22,.05)`).
		 * The wide layer (`0 16px 38px .085`) lives on `frame`. No border, no
		 * heavy shadow.
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
