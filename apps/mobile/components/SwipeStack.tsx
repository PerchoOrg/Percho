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
import { useLayoutEffect } from "react";
import { StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import { useSwipeCard } from "../hooks/use-swipe-card";
import {
	type CardCapability,
	INERT_CAPABILITY,
} from "../lib/gesture/capability";
import { VISIBLE_WINDOW, cardStackVisual } from "../lib/gesture/stack-layer";
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

/** What a face needs to animate with the drag. `tx` is live on the UI thread. */
export interface CardRenderArgs {
	role: CardRole;
	tx: SharedValue<number>;
	cardWidth: number;
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

interface SwipeStackProps<T> {
	items: readonly T[];
	activeIndex: number;
	onDecision: (decision: "left" | "right", item: T) => void;

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
	cardHeight: number;
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

	const { gesture, tx, topAbs, exitX, advance } = useSwipeCard({
		cardWidth,
		capability: topCapability,
		onDecision: (decision) => {
			if (top) onDecision(decision, top);
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

	const argsFor = (role: CardRole): CardRenderArgs => ({
		role,
		tx,
		cardWidth,
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
				<View style={{ width: cardWidth, height: cardHeight }}>
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
	card: {
		...StyleSheet.absoluteFillObject,
		borderRadius: radii.card,
		overflow: "hidden",
		backgroundColor: colors.ink, // card face is always dark (§0.3)
	},
});
