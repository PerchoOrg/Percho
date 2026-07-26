/**
 * SwipeStack (§0.6 #7) — renders the top card plus the two behind it at the
 * spec resting values: next = scale 0.94 / opacity 0.5, after = 0.88 / 0.25.
 * Only the top card gets the pan gesture (via useSwipeCard) and, through the
 * caller's `renderCard(role)`, video playback. As the top card is dragged the
 * next card rises toward scale 1 / opacity 1.
 *
 * Generic over the card data type — task-0 knows nothing about feed semantics;
 * it reports the raw `'left' | 'right'` decision and the item to the caller.
 */
import { useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSwipeCard } from "../hooks/use-swipe-card";
import { colors, radii } from "../theme/tokens";

const DEFAULT_WIDTH = Dimensions.get("window").width - 32;

interface SwipeStackProps<T> {
	items: T[];
	activeIndex: number;
	onDecision: (decision: "left" | "right", item: T) => void;
	renderCard: (item: T, role: "top" | "next" | "after") => React.ReactNode;
	keyExtractor: (item: T, index: number) => string;
	cardWidth?: number;
	cardHeight?: number;
	enabled?: boolean;
}

export function SwipeStack<T>({
	items,
	activeIndex,
	onDecision,
	renderCard,
	keyExtractor,
	cardWidth = DEFAULT_WIDTH,
	cardHeight = DEFAULT_WIDTH * 1.5,
	enabled = true,
}: SwipeStackProps<T>) {
	const top = items[activeIndex];
	const next = items[activeIndex + 1];
	const after = items[activeIndex + 2];

	const { gesture, topStyle, tx, reset } = useSwipeCard({
		cardWidth,
		enabled: enabled && !!top,
		onDecision: (decision) => {
			if (top) onDecision(decision, top);
		},
	});

	// Drag resets whenever the active card changes (after a commit advances).
	// biome-ignore lint/correctness/useExhaustiveDependencies: activeIndex is the trigger, not a read dependency
	useEffect(() => {
		reset();
	}, [activeIndex, reset]);

	const nextStyle = useAnimatedStyle(() => {
		const p = Math.min(Math.abs(tx.value) / cardWidth, 1);
		return {
			transform: [{ scale: 0.94 + 0.06 * p }],
			opacity: 0.5 + 0.5 * p,
		};
	});

	const cardBox = { width: cardWidth, height: cardHeight };

	return (
		<View style={styles.stack}>
			{after && (
				<View
					key={keyExtractor(after, activeIndex + 2)}
					style={[styles.card, cardBox, styles.after]}
				>
					{renderCard(after, "after")}
				</View>
			)}
			{next && (
				<Animated.View
					key={keyExtractor(next, activeIndex + 1)}
					style={[styles.card, cardBox, nextStyle]}
				>
					{renderCard(next, "next")}
				</Animated.View>
			)}
			{top && (
				<GestureDetector gesture={gesture}>
					<Animated.View
						key={keyExtractor(top, activeIndex)}
						style={[styles.card, cardBox, topStyle]}
					>
						{renderCard(top, "top")}
					</Animated.View>
				</GestureDetector>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	stack: { flex: 1, alignItems: "center", justifyContent: "center" },
	card: {
		position: "absolute",
		borderRadius: radii.card,
		overflow: "hidden",
		backgroundColor: colors.ink, // card face is always dark (§0.3)
	},
	after: { transform: [{ scale: 0.88 }], opacity: 0.25 },
});
