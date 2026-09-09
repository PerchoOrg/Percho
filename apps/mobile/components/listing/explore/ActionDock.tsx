/**
 * ActionDock (phase119 spec §3.10) — ✕ / save / Request a tour, pinned to the
 * page foot over a gradient fade (no hard edge). ✕ carries the feed's left
 * swipe: "not for me", and it leaves the page. Event emission is the screen's
 * job.
 *
 * The middle button was a `♡` until phase260, described here as "the same save
 * the card heart toggles" — the card has never drawn a heart, it draws a
 * bookmark, and the two are one action. It is `SaveGlyph` now; that file argues
 * why the bookmark is the mark and not the heart.
 */
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { explore, fonts, radii } from "../../../theme/tokens";
import { SaveGlyph } from "../../SaveGlyph";

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
					<SaveGlyph saved={saved} size={18} color={explore.ink} />
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
