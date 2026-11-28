/**
 * What the card's thumbs-down says back (phase414): the card is hidden, and the one
 * chance to take that back without leaving the feed.
 *
 * The You tab's RECENT list is still where a verdict is reviewed and undone
 * (phase140, chosen then over an Undo toast for a swipe). The thumbs-down is not a
 * swipe: it is one tap, on a control the thumb can land on by accident, and
 * it removes the card for good — so its undo is where the tap was.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { redline } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

export function HiddenToast({ onUndo }: { onUndo: () => void }) {
	return (
		<View style={styles.toast}>
			<Text style={styles.text} numberOfLines={1}>
				Hidden. You’ll see less like this.
			</Text>
			<Pressable
				onPress={onUndo}
				accessibilityRole="button"
				accessibilityLabel="Undo hiding this card"
				hitSlop={14}
				style={({ pressed }) => pressed && styles.pressed}
			>
				<Text style={styles.undo}>Undo</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	toast: {
		height: 44,
		borderRadius: 14,
		paddingHorizontal: 16,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		backgroundColor: "rgba(24,27,24,0.94)",
	},
	text: {
		...textStyles.footnote,
		flexShrink: 1,
		color: redline.onPhoto,
	},
	undo: {
		...textStyles.footnote,
		fontWeight: "700",
		color: redline.onPhoto,
		textDecorationLine: "underline",
	},
	pressed: { opacity: 0.6 },
});
