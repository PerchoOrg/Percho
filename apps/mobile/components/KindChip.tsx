/**
 * KindChip (§0.6 #2) — top-left card label: LISTING / COMMUNITY / AREA / card
 * kind tag. Caption style on a --glass base with --accent text. Positioning
 * (top-left inset) is the card's job; this renders only the chip.
 */
import { StyleSheet, Text } from "react-native";
import { colors, radii } from "../theme/tokens";
import { type } from "../theme/typography";

export function KindChip({ label }: { label: string }) {
	return <Text style={styles.chip}>{label}</Text>;
}

const styles = StyleSheet.create({
	chip: {
		...type.caption,
		alignSelf: "flex-start",
		color: colors.accent,
		backgroundColor: colors.glass,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
		overflow: "hidden",
	},
});
