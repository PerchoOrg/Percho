/**
 * The card's top-right control (phase175, owner pick "H1").
 *
 * ── What this replaces and why ──────────────────────────────────────────────
 *
 * The feed had no way to mute a playing tour until phase140 put one back next
 * to the bookmark. Two round discs drew the owner's objection — 「右上两个
 * button 很奇怪」 — so the two controls became ONE object. That capsule
 * shipped, and on device it read wrong for two reasons the demo frames at
 * `percho.co/demos/card-corner-v2` isolate (H0 is a replica of it):
 *
 *   1. **Two sizes of white on one row.** The capsule was 37pt tall next to a
 *      ~26pt LISTING badge — same material, same 12pt inset, different height.
 *      The mismatch reads before either glyph does. So the control is now the
 *      badge's twin: `CORNER_HEIGHT` is the badge's own height and the fill is
 *      the badge's own `rgba(255,255,255,0.92)`.
 *   2. **The glyphs were not glyphs.** Both were built from bordered `View`s at
 *      Lucide geometry, because neither icon font carried a speaker. At 17pt
 *      the speaker's 2.8pt-wide box with a 1.75pt border on each side closed
 *      into a blob, and the bookmark's notch was two rotated bars with a seam.
 *      Real Phosphor glyphs ship now — `soundOn` / `soundOff` / `bookmark` were
 *      added to both weights of the redline subset (2026-09-05), so this file
 *      draws no art at all.
 *
 * The save glyph is `bookmark-simple` — deliberately `TAB_BAR_GLYPH.saved`, the
 * Saved tab's own drawing, so the control and the tab it saves into are one
 * shape.
 *
 * The community card carries only the speaker: its bookmark was removed on
 * 2026-08-20 (owner: "remove the save button on the top right for community
 * card") and this is not the place to argue with that. One control renders as a
 * plain disc of the same height, so both faces show exactly one object.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { redline } from "../../theme/tokens";
import { RedlineIcon } from "./redline/RedlineChrome";

/** Ink shared with the badge's label — the CITY pill's label colour. */
const INK = "#181B18";

/**
 * The LISTING badge's height: 9.5pt label (≈11.4pt line box) + 7pt padding top
 * and bottom. The control matches it so the top row holds one size of white.
 */
const CORNER_HEIGHT = 26;
/** Glyph size — the largest that keeps 5.5pt of air inside a 26pt pill. */
const GLYPH = 15;
/** Air between the two glyphs; half of it is each cell's horizontal hit slop. */
const GAP = 12;

/**
 * One control. `onTouchStart` arms the stack's `tapSlot` (the face owns the
 * target ids); when it is absent — outside the swipe stack, as on
 * dev-foundation — `onPress` runs directly, exactly as the discs did.
 */
interface CornerControl {
	onPress: () => void;
	onTouchStart?: () => void;
}

interface CardCornerProps {
	/**
	 * Present when the card has a film to mute. A photo-only card shows no
	 * speaker rather than a control that promises audio it does not have.
	 */
	sound?: CornerControl & { on: boolean };
	/** Present when the card is saveable. Absent on the community face. */
	save?: CornerControl & { saved: boolean };
	/**
	 * How far below the card's top edge the control sits. 12 (the badge's own
	 * inset) everywhere except the community face, whose top-right corner is
	 * occupied by the tour video's BURNED-IN place-name pill — the render
	 * worker draws it at the COMMUNITY badge's height, and it is why the owner
	 * had the bookmark removed from that corner on 2026-08-20. Dropping the
	 * control below the pill keeps the control on the same side without
	 * covering the film's own label.
	 */
	top?: number;
}

/**
 * One object in the corner: a pill when the card has both controls, a disc when
 * it has one, nothing when it has neither.
 */
export function CardCorner({ sound, save, top = 12 }: CardCornerProps) {
	const both = sound !== undefined && save !== undefined;
	if (sound === undefined && save === undefined) return null;

	const soundCell = sound && (
		<Pressable
			key="sound"
			onTouchStart={sound.onTouchStart}
			onPress={sound.onTouchStart ? undefined : sound.onPress}
			accessibilityRole="button"
			accessibilityLabel={sound.on ? "Mute" : "Unmute"}
			hitSlop={both ? { top: 12, bottom: 12, left: 12, right: GAP / 2 } : 12}
			style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
		>
			<RedlineIcon
				name={sound.on ? "soundOn" : "soundOff"}
				size={GLYPH}
				color={INK}
				weight="outline"
			/>
		</Pressable>
	);

	const saveCell = save && (
		<Pressable
			key="save"
			onTouchStart={save.onTouchStart}
			onPress={save.onTouchStart ? undefined : save.onPress}
			accessibilityRole="button"
			accessibilityLabel={save.saved ? "Saved" : "Save"}
			hitSlop={both ? { top: 12, bottom: 12, left: GAP / 2, right: 12 } : 12}
			style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
		>
			{/* Saved fills the bookmark and turns it green — the redline's one
			    interactive colour, so the state reads as "yours" rather than as a
			    heavier icon. */}
			<RedlineIcon
				name="bookmark"
				size={GLYPH}
				color={save.saved ? redline.accent : INK}
				weight={save.saved ? "fill" : "outline"}
			/>
		</Pressable>
	);

	return (
		<View style={[styles.slot, both ? styles.pill : styles.disc, { top }]}>
			{soundCell}
			{saveCell}
		</View>
	);
}

const styles = StyleSheet.create({
	slot: {
		position: "absolute",
		right: 12,
		zIndex: 2,
		flexDirection: "row",
		alignItems: "center",
		/**
		 * The LISTING badge's own fill, not the capsule's old 0.85 — the two sit
		 * on one row and any difference in the white reads as a mistake. Plain
		 * translucency, no blur — expo-blur red-screens Expo Go (DEVLOG
		 * 2026-07-30; f7680a62).
		 */
		backgroundColor: "rgba(255,255,255,0.92)",
		height: CORNER_HEIGHT,
		borderRadius: CORNER_HEIGHT / 2,
		overflow: "hidden",
	},
	/** Two glyphs, `GAP` apart, in the badge's height. */
	pill: { paddingHorizontal: 9, gap: GAP },
	/** One glyph: a disc of the same height, so both faces show one object. */
	disc: { width: CORNER_HEIGHT, justifyContent: "center" },
	cell: { alignItems: "center", justifyContent: "center" },
	pressed: { opacity: 0.7 },
});
