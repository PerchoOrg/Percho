/**
 * ActionDock (phase119 spec §3.10) — ✕ / ♡ / Request a tour, pinned to the
 * page foot over a gradient fade (no hard edge). ✕ and ♡ carry the feed's
 * swipe semantics: ✕ is "not for me" and leaves the page, ♡ is the same save
 * the card heart toggles. Event emission is the screen's job.
 */
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { explore, fonts, radii } from "../../../theme/tokens";

export interface ActionDockProps {
	saved: boolean;
	bottomInset: number;
	onPass: () => void;
	onToggleSave: () => void;
	onTour: () => void;
}

/** The page bg with alpha ramps for the dock's fade. */
const FADE_FROM = "rgba(246,241,232,0)";

export function ActionDock(props: ActionDockProps) {
	const { saved, bottomInset, onPass, onToggleSave, onTour } = props;
	return (
		<View style={styles.wrap} pointerEvents="box-none">
			<LinearGradient
				colors={[FADE_FROM, explore.bg]}
				locations={[0, 0.55]}
				style={StyleSheet.absoluteFill}
				pointerEvents="none"
			/>
			<View style={[styles.row, { paddingBottom: bottomInset + 6 }]}>
				<Pressable
					onPress={onPass}
					accessibilityLabel="Not for me"
					style={styles.round}
				>
					<Text style={styles.roundGlyph}>✕</Text>
				</Pressable>
				<Pressable
					onPress={onToggleSave}
					accessibilityLabel={saved ? "Remove from saved" : "Save"}
					style={styles.round}
				>
					<Text style={styles.roundGlyph}>{saved ? "♥" : "♡"}</Text>
				</Pressable>
				<Pressable onPress={onTour} style={styles.primary}>
					<Text style={styles.primaryLabel}>Request a tour</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 9 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 14,
		paddingTop: 12,
	},
	round: {
		width: 50,
		height: 50,
		borderRadius: radii.pill,
		backgroundColor: explore.surface,
		borderWidth: 1,
		borderColor: explore.lineStrong,
		alignItems: "center",
		justifyContent: "center",
	},
	roundGlyph: { fontSize: 18, color: explore.ink },
	primary: {
		flex: 1,
		height: 50,
		borderRadius: radii.pill,
		backgroundColor: explore.brand,
		alignItems: "center",
		justifyContent: "center",
	},
	primaryLabel: {
		fontSize: 15,
		fontWeight: "600",
		color: explore.surface,
		fontFamily: fonts.ui,
	},
});
