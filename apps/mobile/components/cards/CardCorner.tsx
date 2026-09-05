/**
 * The card's top-right control (phase140, owner pick "G2").
 *
 * ── What this replaces and why ──────────────────────────────────────────────
 *
 * The feed had no way to mute a playing tour. §0.7's `SoundToggle` was feed
 * chrome until 2026-08-14, when the owner's "both top corners stay empty" rule
 * moved it to the listing explore hero — and phase119's explore rebuild then
 * deleted it without noticing. From that day the only control anywhere in the
 * app was the You tab's autoplay switch, which is not where a buyer hearing
 * music reaches.
 *
 * Putting it back next to the bookmark produced the owner's objection —
 * 「右上两个 button 很奇怪」 — so the two controls became ONE object: a single
 * translucent capsule holding both glyphs, split by a hairline. A stacked pair
 * of round discs was tried first (demo `G1`) and reads as two overlapping
 * circles no matter how it is tightened, which is the same objection restated.
 *
 * ── Both faces carry both controls again (phase174) ─────────────────────────
 *
 * The community card used to carry only the speaker, dropped below the badge's
 * line: its bookmark was removed on 2026-08-20 because the tour video BURNED a
 * place-name pill into that corner and a 40pt disc sat on top of it. phase174
 * moved that label out of the pixels and onto the card, so the corner is free —
 * owner 2026-09-05: "keep the sound and saved button on the top right to be
 * consistent with listing". The `top` prop and its community override went with
 * it; every face now puts one capsule at 12/12.
 *
 * A face with only ONE control is still a plain 40pt disc — that is what a
 * photo-only card (no film to mute) renders.
 *
 * ── The speaker is drawn, not typed ─────────────────────────────────────────
 *
 * Neither shipped icon font has a speaker: `PerchoIcons` is a 19-glyph FILL
 * subset and `TabBarIcons` carries four. `SoundToggle` used the 🔊/🔇 EMOJI,
 * which is why it could never sit beside the line-art bookmark. So the glyph is
 * composed from bordered `View`s at Lucide's own 24-grid geometry — the same
 * technique, and the same two constraints (`react-native-svg` red-screens Expo
 * Go; the font is fill-only), that already draw the bookmark and the arrow.
 */
import { Pressable, StyleSheet, View } from "react-native";

/** Ink shared with the bookmark — the CITY pill's label colour. */
const INK = "#181B18";
const STROKE = 1.75;

const SPEAKER = 17;
const K = SPEAKER / 24;
/** Lucide's box: x 2..6, y 9..15. */
const BOX_L = 2 * K;
const BOX_T = 9 * K;
const BOX_W = 4 * K;
const BOX_H = 6 * K;
/** Its flare: apex at x 6, flat edge at x 11, spanning y 5..19. */
const FLARE_L = 6 * K;
const FLARE_W = 5 * K;
const FLARE_HALF = 7 * K;
/** The one sound wave, as a ring showing only its right side. */
const WAVE = 10 * K;

/**
 * A speaker at 17pt. `on` draws the wave; `off` crosses it out — the classic
 * pair, and the muted form needs no arc so it cannot be mistaken for a
 * half-drawn one.
 */
function SpeakerIcon({ on }: { on: boolean }) {
	return (
		<View style={styles.speakerBox}>
			<View style={styles.speakerBody} />
			<View style={styles.speakerFlare} />
			{on ? (
				<View style={styles.wave} />
			) : (
				<>
					<View style={[styles.slash, styles.slashA]} />
					<View style={[styles.slash, styles.slashB]} />
				</>
			)}
		</View>
	);
}

/**
 * The bookmark, at the capsule's size. Duplicated from `ListingFace` rather
 * than extracted: that copy is 16pt on a 40pt disc with its own saved-fill
 * rules, and §0.2 does not ask for an abstraction at the second use — but the
 * geometry constants are Lucide's, so the two cannot drift in shape.
 */
const BOOKMARK = 16;
const BK = BOOKMARK / 24;
const BM_L = 5 * BK;
const BM_W = 14 * BK;
const BM_T = 3 * BK;
const BM_B = 21 * BK;
const BM_NOTCH = 16 * BK;
const BM_RUN = BM_W / 2;
const BM_RISE = BM_B - BM_NOTCH;
const BM_DIAG = Math.hypot(BM_RUN, BM_RISE);
const BM_ANGLE = (Math.atan2(BM_RISE, BM_RUN) * 180) / Math.PI;

function BookmarkIcon({ saved }: { saved: boolean }) {
	return (
		<View style={styles.bookmarkBox}>
			{saved && <View style={styles.bookmarkFill} />}
			<View style={styles.bookmarkTop} />
			<View style={[styles.bookmarkSide, styles.bookmarkSideLeft]} />
			<View style={[styles.bookmarkSide, styles.bookmarkSideRight]} />
			<View style={[styles.bookmarkDiag, styles.bookmarkDiagLeft]} />
			<View style={[styles.bookmarkDiag, styles.bookmarkDiagRight]} />
		</View>
	);
}

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
	/** Present when the card is saveable. */
	save?: CornerControl & { saved: boolean };
}

/**
 * One object in the corner: a capsule when the card has both controls, a plain
 * disc when it has one, nothing when it has neither.
 */
export function CardCorner({ sound, save }: CardCornerProps) {
	const both = sound !== undefined && save !== undefined;
	if (sound === undefined && save === undefined) return null;

	const soundCell = sound && (
		<Pressable
			key="sound"
			onTouchStart={sound.onTouchStart}
			onPress={sound.onTouchStart ? undefined : sound.onPress}
			accessibilityRole="button"
			accessibilityLabel={sound.on ? "Mute" : "Unmute"}
			hitSlop={both ? 8 : 12}
			style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
		>
			<SpeakerIcon on={sound.on} />
		</Pressable>
	);

	const saveCell = save && (
		<Pressable
			key="save"
			onTouchStart={save.onTouchStart}
			onPress={save.onTouchStart ? undefined : save.onPress}
			accessibilityRole="button"
			accessibilityLabel={save.saved ? "Saved" : "Save"}
			hitSlop={both ? 8 : 12}
			style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
		>
			<BookmarkIcon saved={save.saved} />
		</Pressable>
	);

	return (
		<View style={[styles.slot, both ? styles.capsule : styles.disc]}>
			{soundCell}
			{both && <View style={styles.divider} />}
			{saveCell}
		</View>
	);
}

const CELL = 37;
const styles = StyleSheet.create({
	slot: {
		position: "absolute",
		top: 12,
		right: 12,
		zIndex: 2,
		flexDirection: "row",
		alignItems: "center",
		/**
		 * 0.85 rather than the lone disc's 0.75. A capsule is a bigger field of
		 * translucency and at 0.75 a bright sky read through its middle, which
		 * is what made the two-cell shape look like two circles. Plain
		 * translucency, no blur — expo-blur red-screens Expo Go (DEVLOG
		 * 2026-07-30; f7680a62).
		 */
		backgroundColor: "rgba(255,255,255,0.85)",
		overflow: "hidden",
	},
	/** Two cells + the hairline. Radius is half the height, so the ends are round. */
	capsule: { height: CELL, borderRadius: CELL / 2 },
	/** One cell: the 40pt disc every face has drawn since 2026-08-18. */
	disc: { width: 40, height: 40, borderRadius: 20 },
	cell: {
		width: CELL,
		height: CELL,
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: { opacity: 0.7 },
	divider: {
		width: StyleSheet.hairlineWidth,
		alignSelf: "stretch",
		marginVertical: 8,
		backgroundColor: "rgba(24,27,24,0.16)",
	},

	// ─── Speaker art (Lucide `M11 5L6 9H2v6h4l5 4V5z` on a 24 grid) ───────
	speakerBox: { width: SPEAKER, height: SPEAKER },
	speakerBody: {
		position: "absolute",
		left: BOX_L,
		top: BOX_T,
		width: BOX_W,
		height: BOX_H,
		borderWidth: STROKE,
		borderColor: INK,
		borderRadius: 1.5,
	},
	/**
	 * The flare, as a triangle whose flat edge is on the RIGHT: only the right
	 * border is painted, top and bottom are transparent. Filled rather than
	 * outlined because at 17pt an outlined trapezoid closes up into a smudge.
	 */
	speakerFlare: {
		position: "absolute",
		left: FLARE_L,
		top: SPEAKER / 2 - FLARE_HALF,
		width: 0,
		height: 0,
		borderRightWidth: FLARE_W,
		borderRightColor: INK,
		borderTopWidth: FLARE_HALF,
		borderBottomWidth: FLARE_HALF,
		borderTopColor: "transparent",
		borderBottomColor: "transparent",
	},
	/** A ring with only its right side painted reads as one sound wave. */
	wave: {
		position: "absolute",
		left: 11.5 * K,
		top: SPEAKER / 2 - WAVE / 2,
		width: WAVE,
		height: WAVE,
		borderRadius: WAVE / 2,
		borderWidth: STROKE,
		borderColor: "transparent",
		borderRightColor: INK,
	},
	/** Muted: the wave is replaced by a cross, never drawn half-on. */
	slash: {
		position: "absolute",
		left: 11 * K,
		top: SPEAKER / 2 - STROKE / 2,
		width: 7 * K,
		height: STROKE,
		borderRadius: STROKE / 2,
		backgroundColor: INK,
	},
	slashA: { transform: [{ rotate: "45deg" }] },
	slashB: { transform: [{ rotate: "-45deg" }] },

	// ─── Bookmark art (Lucide's 24-grid body 5..19 × 3..21, notch tip at 16) ──
	bookmarkBox: { width: BOOKMARK, height: BOOKMARK },
	bookmarkFill: {
		position: "absolute",
		left: BM_L + STROKE,
		top: BM_T + STROKE,
		width: BM_W - STROKE * 2,
		height: BM_NOTCH - BM_T - STROKE,
		backgroundColor: INK,
	},
	bookmarkTop: {
		position: "absolute",
		left: BM_L,
		top: BM_T,
		width: BM_W,
		height: STROKE,
		borderRadius: STROKE / 2,
		backgroundColor: INK,
	},
	bookmarkSide: {
		position: "absolute",
		top: BM_T,
		width: STROKE,
		height: BM_B - BM_T,
		borderRadius: STROKE / 2,
		backgroundColor: INK,
	},
	bookmarkSideLeft: { left: BM_L },
	bookmarkSideRight: { left: BM_L + BM_W - STROKE },
	bookmarkDiag: {
		position: "absolute",
		top: (BM_B + BM_NOTCH) / 2 - STROKE / 2,
		width: BM_DIAG,
		height: STROKE,
		borderRadius: STROKE / 2,
		backgroundColor: INK,
	},
	bookmarkDiagLeft: {
		left: BM_L + BM_RUN / 2 - BM_DIAG / 2,
		transform: [{ rotate: `${-BM_ANGLE}deg` }],
	},
	bookmarkDiagRight: {
		left: BM_L + BM_W - BM_RUN / 2 - BM_DIAG / 2,
		transform: [{ rotate: `${BM_ANGLE}deg` }],
	},
});
