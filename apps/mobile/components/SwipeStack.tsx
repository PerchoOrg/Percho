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
 */
import { StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSwipeCard } from "../hooks/use-swipe-card";
import { colors, radii } from "../theme/tokens";

const WINDOW = 3;

type CardRole = "top" | "next" | "after";

const ROLES: CardRole[] = ["top", "next", "after"];

interface SwipeStackProps<T> {
	items: T[];
	activeIndex: number;
	onDecision: (decision: "left" | "right", item: T) => void;
	renderCard: (item: T, role: CardRole) => React.ReactNode;
	/** Data face (§0.5). Omit for card kinds that don't flip. */
	renderBack?: (item: T, role: CardRole) => React.ReactNode;
	keyExtractor: (item: T, index: number) => string;
	cardWidth: number;
	cardHeight: number;
	enabled: boolean;
}

export function SwipeStack<T>({
	items,
	activeIndex,
	onDecision,
	renderCard,
	renderBack,
	keyExtractor,
	cardWidth,
	cardHeight,
	enabled,
}: SwipeStackProps<T>) {
	const window = items.slice(activeIndex, activeIndex + WINDOW);
	const top = window[0];

	const { gesture, topStyle, tx, frontStyle, backStyle } = useSwipeCard({
		cardWidth,
		enabled: enabled && !!top,
		onDecision: (decision) => {
			if (top) onDecision(decision, top);
		},
	});

	const nextStyle = useAnimatedStyle(() => {
		const p = Math.min(Math.abs(tx.value) / cardWidth, 1);
		return {
			transform: [{ scale: 0.94 + 0.06 * p }],
			opacity: 0.5 + 0.5 * p,
		};
	});

	return (
		<View style={styles.stack}>
			<GestureDetector gesture={gesture}>
				<View style={{ width: cardWidth, height: cardHeight }}>
					{window.map((item, i) => {
						const role = ROLES[i] ?? "after";
						const isTop = role === "top";
						return (
							<Animated.View
								key={keyExtractor(item, activeIndex + i)}
								style={[
									styles.card,
									{ zIndex: WINDOW - i },
									isTop ? topStyle : role === "next" ? nextStyle : styles.after,
								]}
							>
								<Animated.View
									style={[
										StyleSheet.absoluteFill,
										isTop ? frontStyle : styles.faceVisible,
									]}
								>
									{renderCard(item, role)}
								</Animated.View>
								{!!renderBack && (
									<Animated.View
										style={[
											StyleSheet.absoluteFill,
											isTop ? backStyle : styles.faceHidden,
										]}
									>
										{renderBack(item, role)}
									</Animated.View>
								)}
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
