/**
 * ExploreButton (§0.6 #5) — the explicit feed→detail entry. A --glass pill with
 * ink text; hit target ≥ 44pt per §0.5.
 */
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radii } from "../theme/tokens";
import { type } from "../theme/typography";

interface ExploreButtonProps {
	onPress: () => void;
	label?: string;
}

export function ExploreButton({
	onPress,
	label = "Explore",
}: ExploreButtonProps) {
	return (
		<Pressable
			hitSlop={8}
			onPress={onPress}
			style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
		>
			<Text style={styles.label}>{label} →</Text>
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
	label: { ...type.headline, color: colors.ink },
});
