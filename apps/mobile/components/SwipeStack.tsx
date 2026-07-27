/**
 * SwipeStack (§0.6 #7) — renders the top card plus the two behind it at the
 * spec resting values: next = scale 0.94 / opacity 0.5, after = 0.88 / 0.25.
 * Only the top card responds to the pan/tap gesture and, through the caller's
 * `renderCard(role)`, plays video. As the top card is dragged the next card
 * rises toward scale 1 / opacity 1.
 *
 * Each card in the window is keyed by item identity and rendered with the same
 * element shape, so promoting the next card to top preserves its subtree — the
 * CardVideo player and its buffer survive the swipe. The GestureDetector sits on
 * the card-sized frame rather than on the top card, for the same reason.
 *
 * `renderBack` is the §0.5 data face: stacked behind the video face and
 * crossfaded in over 350ms when the top card is tapped (never a 3D flip).
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
import { StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import { useSwipeCard } from "../hooks/use-swipe-card";
import { canFlipCard } from "../lib/gesture/can-flip";
import {
	type CardCapability,
	INERT_CAPABILITY,
} from "../lib/gesture/capability";
import {
	type CardLayerRole,
	cardLayerVisual,
} from "../lib/gesture/stack-layer";
import { colors, radii } from "../theme/tokens";

const WINDOW = 3;

type CardRole = CardLayerRole;

const ROLES: CardRole[] = ["top", "next", "after"];

/** What a face needs to animate with the drag. `tx` is live on the UI thread. */
export interface CardRenderArgs {
	role: CardRole;
	tx: SharedValue<number>;
	cardWidth: number;
}

interface SwipeStackProps<T> {
	items: readonly T[];
	activeIndex: number;
	onDecision: (decision: "left" | "right", item: T) => void;
	/** Fired at commit, before any `revealMs` hold and the flyout (§1.6). */
	onCommit?: (decision: "left" | "right", item: T) => void;
	renderCard: (item: T, args: CardRenderArgs) => React.ReactNode;
	/**
	 * Data face (§0.5). Return null for card kinds that don't flip.
	 *
	 * Deliberately NOT given `tx`: a data face is a static layout the buyer reads
	 * after the card has stopped moving, and keeping it drag-independent is what
	 * lets this be called before the gesture exists — which is what closes the
	 * §1.1 red line (see below).
	 */
	renderBack?: (item: T, role: CardRole) => React.ReactNode;
	/** Overlay above the top card only — §1.8 direction labels live here. */
	renderOverlay?: (item: T, args: CardRenderArgs) => React.ReactNode;
	keyExtractor: (item: T, index: number) => string;
	cardWidth: number;
	cardHeight: number;
	/** §1.3 per-item gesture capability. Resolved before the gesture is built. */
	capability: (item: T) => CardCapability;
}

export function SwipeStack<T>({
	items,
	activeIndex,
	onDecision,
	onCommit,
	renderCard,
	renderBack,
	renderOverlay,
	keyExtractor,
	cardWidth,
	cardHeight,
	capability,
}: SwipeStackProps<T>) {
	const window = items.slice(activeIndex, activeIndex + WINDOW);
	const top = window[0];

	// §1.1 red line: a card with no data face must not flip. `renderBack` is one
	// callback shared by a mixed deck and returns null for the kinds that don't
	// flip (ask / tradeoff / milestone), so the existence of the *callback* says
	// nothing about the *item*. Gating on the callback — the original bug — let a
	// tap crossfade an ask card out to a blank face. Gate on the rendered result.
	const topBack =
		top !== undefined && renderBack ? renderBack(top, "top") : null;
	const topBackRenders = canFlipCard(topBack);

	// `flippable` is an AND of two independent facts, and neither alone suffices:
	// what the card KIND allows (`capability`, which cannot know a pool row was
	// missing the data a face needs) and whether a face actually rendered for
	// THIS item (which cannot know the kind shouldn't flip in the first place).
	const declared = top === undefined ? INERT_CAPABILITY : capability(top);
	const topCapability: CardCapability = {
		...declared,
		flippable: declared.flippable && topBackRenders,
	};

	const { gesture, tx, frontStyle, backStyle } = useSwipeCard({
		cardWidth,
		capability: topCapability,
		onDecision: (decision) => {
			if (top) onDecision(decision, top);
		},
		onCommit: (decision) => {
			if (top && onCommit) onCommit(decision, top);
		},
	});

	const argsFor = (role: CardRole): CardRenderArgs => ({
		role,
		tx,
		cardWidth,
	});

	// One style per LAYER, each writing the identical prop set (transform +
	// opacity). Cards are keyed by item identity, so the style attached to a
	// given view changes as it is promoted — and Reanimated leaves the native
	// props a detached style already wrote in place. A style that omitted
	// `opacity` would inherit 0.5 from the layer it replaced, and the cards
	// underneath would show through the promoted card (the ghosting bug).
	// `cardLayerVisual` is the single source of both, asserted for key parity.
	const layer0 = useAnimatedStyle(() => {
		const v = cardLayerVisual("top", tx.value, cardWidth);
		return {
			transform: [
				{ translateX: v.translateX },
				{ rotate: `${v.rotateDeg}deg` },
				{ scale: v.scale },
			],
			opacity: v.opacity,
		};
	});
	const layer1 = useAnimatedStyle(() => {
		const v = cardLayerVisual("next", tx.value, cardWidth);
		return {
			transform: [
				{ translateX: v.translateX },
				{ rotate: `${v.rotateDeg}deg` },
				{ scale: v.scale },
			],
			opacity: v.opacity,
		};
	});
	const layer2 = useAnimatedStyle(() => {
		const v = cardLayerVisual("after", tx.value, cardWidth);
		return {
			transform: [
				{ translateX: v.translateX },
				{ rotate: `${v.rotateDeg}deg` },
				{ scale: v.scale },
			],
			opacity: v.opacity,
		};
	});
	const layerStyles = [layer0, layer1, layer2];

	return (
		<View style={styles.stack}>
			<GestureDetector gesture={gesture}>
				<View style={{ width: cardWidth, height: cardHeight }}>
					{window.map((item, i) => {
						const role = ROLES[i] ?? "after";
						const isTop = role === "top";
						// Reuse the already-computed top face rather than calling
						// renderBack twice for the same item.
						const back = isTop
							? topBack
							: renderBack
								? renderBack(item, role)
								: null;
						return (
							<Animated.View
								key={keyExtractor(item, activeIndex + i)}
								style={[
									styles.card,
									{ zIndex: WINDOW - i },
									layerStyles[i] ?? layerStyles[2],
								]}
							>
								<Animated.View
									style={[
										StyleSheet.absoluteFill,
										isTop ? frontStyle : styles.faceVisible,
									]}
								>
									{renderCard(item, argsFor(role))}
								</Animated.View>
								{canFlipCard(back) && (
									<Animated.View
										style={[
											StyleSheet.absoluteFill,
											isTop ? backStyle : styles.faceHidden,
										]}
									>
										{back}
									</Animated.View>
								)}
								{/* Above both faces and outside the crossfade: the §1.8
								    labels must stay legible while a flip is in progress. */}
								{isTop && renderOverlay
									? renderOverlay(item, argsFor(role))
									: null}
							</Animated.View>
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
	after: { transform: [{ scale: 0.88 }], opacity: 0.25 },
	faceVisible: { opacity: 1 },
	faceHidden: { opacity: 0 },
});
