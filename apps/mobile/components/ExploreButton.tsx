/**
 * ExploreButton (§0.6 #5) — the explicit feed→detail entry. A --glass pill with
 * ink text; hit target ≥ 44pt per §0.5.
 */
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

interface ExploreButtonProps {
	onPress: () => void;
	/**
	 * Fixed width, used by the listing card so the button matches the map
	 * column's slot. Omit for the intrinsic `flex-start` pill the other callers
	 * expect — this must NOT change their layout.
	 */
	width?: number;
}

export function ExploreButton({ onPress, width }: ExploreButtonProps) {
	return (
		<Pressable
			hitSlop={8}
			onPress={onPress}
			style={({ pressed }) => [
				styles.btn,
				width != null && { width, alignSelf: "auto" as const },
				pressed && styles.pressed,
			]}
		>
			<Text style={[styles.label, width != null && styles.labelCentered]}>
				Explore →
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	btn: {
		minHeight: 44,
		justifyContent: "center",
		alignSelf: "flex-start",
		paddingHorizontal: 18,
		borderRadius: radii.pill,
		backgroundColor: colors.glass,
	},
	pressed: { opacity: 0.8 },
	label: { ...textStyles.headline, color: colors.ink },
	labelCentered: { textAlign: "center" },
});
