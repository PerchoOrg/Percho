/**
 * ExploreButton (§0.6 #5) — the explicit feed→detail entry. Hit target ≥ 44pt
 * per §0.5.
 *
 * Two tones. The default `glass` pill with ink text is what the immersive
 * dark-photo faces use. `solid` is demo variant C's `.go`: an amber fill with
 * white uppercase text, for the LIGHT listing card, where a translucent light
 * pill on a near-white surface is invisible. On that card the amber is the only
 * accent on the whole face, which is the point — 「仅用点缀色突出核心操作」.
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
	/** Visual weight. Defaults to the original glass pill. */
	tone?: "glass" | "solid";
}

export function ExploreButton({
	onPress,
	width,
	tone = "glass",
}: ExploreButtonProps) {
	const solid = tone === "solid";
	return (
		<Pressable
			hitSlop={8}
			onPress={onPress}
			style={({ pressed }) => [
				styles.btn,
				solid && styles.btnSolid,
				width != null && { width, alignSelf: "auto" as const },
				pressed && (solid ? styles.pressedSolid : styles.pressed),
			]}
		>
			<Text
				style={[
					styles.label,
					solid && styles.labelSolid,
					width != null && styles.labelCentered,
				]}
			>
				{solid ? "EXPLORE" : "Explore →"}
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
	btnSolid: { backgroundColor: colors.accent, paddingVertical: 15 },
	pressed: { opacity: 0.8 },
	/** A fill this saturated should darken, not fade — fading reads as disabled. */
	pressedSolid: { backgroundColor: colors.accentDeep },
	label: { ...textStyles.headline, color: colors.ink },
	labelSolid: {
		...textStyles.caption,
		color: colors.surface,
		letterSpacing: 1.2,
	},
	labelCentered: { textAlign: "center" },
});
