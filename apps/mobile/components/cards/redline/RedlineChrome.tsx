/**
 * Shared chrome for the four redline card faces (2026-07-30, owner:
 * 「全按redline覆盖」).
 *
 * The redline gives every one of its four cards the SAME top bar (a category
 * pill top-left, a heart button top-right) and the same CTA pill shape, so those
 * live here once rather than being retyped per face. Everything below is a
 * transcription of the redline's own numbers — 15px insets, a 38pt heart, a 48pt
 * full-width CTA, 999 radius.
 *
 * ── Where the icons come from ───────────────────────────────────────────────
 *
 * The icons were originally composed from bordered `View`s, because the redline
 * asked for Lucide-style line art and Lucide wants `react-native-svg` — which
 * red screens in Expo Go on this project (`RNSVGCircle must be a function`, see
 * DEVLOG 2026-07-30 04:55). That constraint has NOT gone away.
 *
 * On 2026-08-01 the owner reviewed six real icon libraries at true chip size and
 * picked **Phosphor Fill** ("这些图标不可爱" about the old line art). Phosphor
 * ships an icon FONT as well as SVGs, and a font needs no native module at all,
 * so the real artwork now ships via `expo-font` with none of the RNSVG risk.
 * See `./icon-font.ts` for the glyph table and the subsetting command.
 *
 * `HeartIcon` below is the one exception and is still `View` art — the redline's
 * unsaved heart is an OUTLINE and this subset only carries Phosphor's fill.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radii, redline } from "../../../theme/tokens";
import { redlineText } from "../../../theme/typography";
import {
	ICON_FONT,
	ICON_GLYPH,
	ICON_OPTICAL_SCALE,
	type RedlineIconName,
} from "./icon-font";

// Re-exported because every face already imports the icon type from this module;
// the artwork moved to `icon-font.ts`, the public surface did not.
export type { RedlineIconName };

/** §0.5 — every touch target is at least 44pt, even when the art is smaller. */
const MIN_TOUCH = 44;
/** The redline's icon stroke: "about 1.7px", round caps and joins. */
const STROKE = 1.7;

// ─── Category pill ──────────────────────────────────────────────────

/**
 * `LISTING` / `COMMUNITY` / `TRADE-OFF` / `AI INSIGHT`.
 *
 * Distinct from the chrome's `KindChip` (glass base, amber text, 11px/600) —
 * the redline's pill is white-translucent with BLACK text at 10px/700/0.1em, and
 * the amber would violate "forest green is the only accent".
 */
export function RedlinePill({ label }: { label: string }) {
	return <Text style={styles.pill}>{label}</Text>;
}

// ─── Photo-count pill ───────────────────────────────────────────────

/**
 * The redline's "⊕ 18 Photos" counter, bottom-left of the listing hero.
 *
 * Spec: dark translucent pill (`--photoPill`, rgba(14,13,11,.5)), a 13pt camera
 * glyph, white 11px text, 6px icon/text gap, 11×6 padding, inset 15 left /
 * 14 bottom.
 *
 * Renders the REAL photo count. The pill was absent from the card for a while
 * because the DTO carried no count — a note in `ListingFace` even claimed the
 * gallery size was unavailable. It was: `browse-cards.ts` already fetches every
 * `listing_photos` row to pick the hero, so the count was one `.length` away.
 * 254 of 260 active listings have 2+ photos (median 10).
 */
export function RedlinePhotoCount({ count }: { count: number }) {
	return (
		<View style={styles.photoPill}>
			<RedlineIcon name="camera" size={13} color={redline.onPhoto} />
			<Text style={styles.photoPillLabel}>{count} Photos</Text>
		</View>
	);
}

// ─── Heart ──────────────────────────────────────────────────────────

/**
 * The favourite button. Present on all four cards in the reference board.
 *
 * `onPress` is optional: the redline draws the affordance on the trade-off and
 * insight cards too, where there is nothing to favourite. Rather than silently
 * dropping it there (which would break the redline's shared top bar) or wiring
 * a fake action, it renders non-interactive when no handler is supplied.
 */
export function RedlineHeart({ onPress }: { onPress?: () => void }) {
	const art = (
		<View style={styles.heart}>
			<HeartIcon />
		</View>
	);
	if (!onPress) return art;
	return (
		<Pressable
			onPress={onPress}
			hitSlop={MIN_TOUCH / 2}
			accessibilityRole="button"
			accessibilityLabel="Save"
			style={({ pressed }) => pressed && styles.pressedSoft}
		>
			{art}
		</Pressable>
	);
}

// ─── CTA ────────────────────────────────────────────────────────────

interface RedlineCtaProps {
	label: string;
	onPress: () => void;
	/**
	 * `solid` = the accent fill with white text (listing / insight).
	 * `light` = white fill with accent text, for use over a photo (community).
	 */
	tone?: "solid" | "light";
	/**
	 * 44pt instead of the redline's 48pt. Opt-in, and used ONLY by the listing
	 * card, whose panel shrank to 35.2% when the hero went to 64.8%
	 * (2026-08-01). The other three faces keep 48 — their panels did not change,
	 * and shrinking this globally would silently restyle three cards to fix one.
	 *
	 * 44 is the floor, not a free parameter: §0.5 requires a 44pt touch target.
	 */
	compact?: boolean;
}

/**
 * The full-width pill CTA — "Explore Home →", "View Recommendations →",
 * "Why people love it →".
 *
 * The arrow is part of the label string rather than a separate glyph because the
 * redline writes it that way, and a text arrow keeps the label optically
 * centred as a unit at any width.
 */
export function RedlineCta({
	label,
	onPress,
	tone = "solid",
	compact = false,
}: RedlineCtaProps) {
	const light = tone === "light";
	return (
		<Pressable
			onPress={onPress}
			hitSlop={8}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={({ pressed }) => [
				styles.cta,
				compact && styles.ctaCompact,
				light ? styles.ctaLight : styles.ctaSolid,
				// A saturated fill must DARKEN under the finger; fading reads as
				// disabled. The light pill has no darker token, so it fades.
				pressed && (light ? styles.pressedSoft : styles.ctaPressed),
			]}
		>
			<Text style={[light ? styles.ctaLabelLight : styles.ctaLabel]}>
				{label}
			</Text>
		</Pressable>
	);
}

// ─── Icons ──────────────────────────────────────────────────────────

/**
 * The heart on every card's top-right. Phosphor's `heart-fill` is a filled
 * shape, but the redline's unsaved state is an OUTLINE heart, and this subset
 * carries no outline variant — so the hand-built art stays for this one glyph.
 * It is chrome with a single fixed size (17pt), not part of the scalable icon
 * vocabulary, so it never needed the font.
 */
function HeartIcon() {
	return (
		<View style={styles.heartIcon}>
			<View style={[styles.heartLobe, styles.heartLobeLeft]} />
			<View style={[styles.heartLobe, styles.heartLobeRight]} />
			<View style={styles.heartTail} />
		</View>
	);
}

interface RedlineIconProps {
	name: RedlineIconName;
	/** Art size in points. The redline uses 10 (chip) / 17 (tile) / 24 (choice). */
	size: number;
	color: string;
}

/**
 * A Phosphor Fill glyph, drawn as text.
 *
 * `width`/`height` are pinned to `size` and the glyph is centred inside them, so
 * this drops into the same layout slot the old `View`-composed icons occupied —
 * a call site that reserved 10pt still gets exactly 10pt. `includeFontPadding`
 * (Android) and `textAlignVertical` are what stop the font's line box from
 * adding invisible space above the art and pushing chip labels off centre.
 *
 * Note there is no `name`-not-found branch: `RedlineIconName` is a closed union
 * and `ICON_GLYPH` is a complete `Record` of it, so an unmapped name is a
 * compile error rather than a run-time tofu box.
 */
export function RedlineIcon({ name, size, color }: RedlineIconProps) {
	return (
		<View style={[styles.iconBox, { width: size, height: size }]}>
			<Text
				allowFontScaling={false}
				style={{
					fontFamily: ICON_FONT,
					fontSize: size * ICON_OPTICAL_SCALE,
					lineHeight: size * ICON_OPTICAL_SCALE,
					color,
					includeFontPadding: false,
					textAlignVertical: "center",
				}}
			>
				{ICON_GLYPH[name]}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	pill: {
		...redlineText.label,
		alignSelf: "flex-start",
		color: redline.ink,
		backgroundColor: redline.pill,
		paddingHorizontal: 11,
		paddingVertical: 7,
		borderRadius: radii.pill,
		overflow: "hidden",
	},
	/** The redline's "⊕ N Photos" counter: dark translucent, 11×6, 6px gap. */
	photoPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
		backgroundColor: redline.photoPill,
		paddingHorizontal: 11,
		paddingVertical: 6,
		borderRadius: radii.pill,
		overflow: "hidden",
	},
	photoPillLabel: {
		...redlineText.micro,
		color: redline.onPhoto,
	},
	heart: {
		width: 38,
		height: 38,
		borderRadius: radii.pill,
		backgroundColor: redline.heart,
		alignItems: "center",
		justifyContent: "center",
	},
	pressedSoft: { opacity: 0.8 },

	cta: {
		width: "100%",
		height: 48,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
	ctaSolid: { backgroundColor: redline.accent },
	/** See `compact` in RedlineCtaProps. 44 = the §0.5 touch-target floor. */
	ctaCompact: { height: 44 },
	ctaPressed: { backgroundColor: redline.accentDeep },
	ctaLight: { backgroundColor: redline.onPhoto, height: 47 },
	ctaLabel: { ...redlineText.cta, color: redline.onPhoto },
	ctaLabelLight: { ...redlineText.ctaSm, color: redline.accent },

	// Heart art. Two lobes + a rotated square read as a heart at 17pt without
	// needing a path.
	heartIcon: { width: 17, height: 17 },
	heartLobe: {
		position: "absolute",
		width: 9.5,
		height: 9.5,
		borderRadius: 5,
		borderWidth: STROKE,
		borderColor: redline.ink,
		top: 1.5,
	},
	heartLobeLeft: { left: 0 },
	heartLobeRight: { right: 0 },
	heartTail: {
		position: "absolute",
		width: 9,
		height: 9,
		left: 4,
		top: 4.6,
		borderRightWidth: STROKE,
		borderBottomWidth: STROKE,
		borderColor: redline.ink,
		borderBottomRightRadius: 2.5,
		transform: [{ rotate: "45deg" }],
	},

	/** Reserves the nominal icon box and centres the glyph inside it. */
	iconBox: { alignItems: "center", justifyContent: "center" },
});
