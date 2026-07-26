/**
 * SoundToggle (§0.6 #1 / §0.7) — the only persistent feed chrome besides the
 * tab bar. A 30pt --glass round button on the status-bar row; flips the global
 * soundOn store. Positioning (status-bar row, right end, z-100) is the screen's
 * job — this renders the button.
 */
import { Pressable, StyleSheet, Text } from "react-native";
import { useSoundStore } from "../state/sound";
import { colors, radii } from "../theme/tokens";

export function SoundToggle() {
	const soundOn = useSoundStore((s) => s.soundOn);
	const toggle = useSoundStore((s) => s.toggle);
	return (
		<Pressable
			hitSlop={12}
			onPress={toggle}
			accessibilityLabel={soundOn ? "Mute" : "Unmute"}
			style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
		>
			<Text style={styles.glyph}>{soundOn ? "🔊" : "🔇"}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	btn: {
		width: 30,
		height: 30,
		borderRadius: radii.pill,
		backgroundColor: colors.glass,
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: { opacity: 0.7 },
	glyph: { fontSize: 15 },
});
