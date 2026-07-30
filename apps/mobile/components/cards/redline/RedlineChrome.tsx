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
 * ── Why the icons are Views and not SVG ─────────────────────────────────────
 *
 * The redline asks for "thin rounded line icons similar to SF Symbols" and says
 * Lucide is acceptable. Both want `react-native-svg`, which is NOT a dependency
 * of this app, and adding it is a known Expo Go landmine in this codebase
 * (`RNSVGCircle must be a function (received undefined)` — see the
 * `expo-go-native-deps` reference). `NeighborhoodScore` already draws its
 * progress arc out of plain `View`s for exactly this reason.
 *
 * So each icon here is composed from bordered `View`s: a stroke is a 1.7pt
 * border (the redline's stroke width), a round cap is a border radius. They are
 * intentionally simple — at 10–24pt on a phone a heavier illustration would
 * just be noise, and the redline's own rule is that luxury comes from
 * proportion and restraint rather than decoration.
 *
 * If `react-native-svg` is ever added for another reason, these can be swapped
 * for real Lucide paths without touching any face: every face imports the icon
 * by NAME, never by geometry.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radii, redline } from "../../../theme/tokens";
import { redlineText } from "../../../theme/typography";

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

/** An outline heart, built from two round lobes and a rotated square tail. */
function HeartIcon() {
	return (
		<View style={styles.heartIcon}>
			<View style={[styles.heartLobe, styles.heartLobeLeft]} />
			<View style={[styles.heartLobe, styles.heartLobeRight]} />
			<View style={styles.heartTail} />
		</View>
	);
}

/** Icon names every redline face may ask for. */
export type RedlineIconName =
	| "camera"
	| "school"
	| "tree"
	| "walk"
	| "family"
	| "car"
	| "yard"
	| "sparkle";

interface RedlineIconProps {
	name: RedlineIconName;
	/** Art size in points. The redline uses 10 (chip) / 17 (tile) / 24 (choice). */
	size: number;
	color: string;
}

/**
 * A line icon drawn from `View`s. Scale-driven: each shape is a fraction of
 * `size`, so one definition serves the chip (10pt), tile (17pt) and choice
 * badge (24pt) call sites.
 */
export function RedlineIcon({ name, size, color }: RedlineIconProps) {
	const box = { width: size, height: size };
	const line = { borderColor: color, borderWidth: STROKE };

	switch (name) {
		// A lens in a body — the "18 Photos" pill.
		case "camera":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconFill,
							line,
							{
								top: size * 0.22,
								height: size * 0.56,
								borderRadius: size * 0.16,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							line,
							{
								width: size * 0.3,
								height: size * 0.3,
								borderRadius: size * 0.15,
								left: size * 0.35,
								top: size * 0.35,
							},
						]}
					/>
				</View>
			);
		// A mortarboard — "Top Schools" / "Great Schools".
		case "school":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							line,
							{
								width: size * 0.72,
								height: size * 0.36,
								left: size * 0.14,
								top: size * 0.2,
								borderRadius: size * 0.06,
								transform: [{ rotate: "-8deg" }],
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								borderColor: color,
								borderBottomWidth: STROKE,
								borderLeftWidth: STROKE,
								borderRightWidth: STROKE,
								width: size * 0.44,
								height: size * 0.28,
								left: size * 0.28,
								top: size * 0.5,
								borderBottomLeftRadius: size * 0.1,
								borderBottomRightRadius: size * 0.1,
							},
						]}
					/>
				</View>
			);
		// A conifer — "Private Backyard".
		case "tree":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							{
								borderLeftWidth: size * 0.22,
								borderRightWidth: size * 0.22,
								borderBottomWidth: size * 0.5,
								borderLeftColor: "transparent",
								borderRightColor: "transparent",
								borderBottomColor: color,
								left: size * 0.06,
								top: size * 0.1,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: STROKE,
								height: size * 0.26,
								left: size * 0.5 - STROKE / 2,
								top: size * 0.6,
							},
						]}
					/>
				</View>
			);
		// A walking figure — "Walkable Park" / "Walkable".
		case "walk":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							line,
							{
								width: size * 0.24,
								height: size * 0.24,
								borderRadius: size * 0.12,
								left: size * 0.38,
								top: 0,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: STROKE,
								height: size * 0.34,
								left: size * 0.5 - STROKE / 2,
								top: size * 0.3,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: STROKE,
								height: size * 0.34,
								left: size * 0.34,
								top: size * 0.62,
								transform: [{ rotate: "18deg" }],
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: STROKE,
								height: size * 0.34,
								left: size * 0.64,
								top: size * 0.62,
								transform: [{ rotate: "-18deg" }],
							},
						]}
					/>
				</View>
			);
		// Two heads — "Family Friendly".
		case "family":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							line,
							{
								width: size * 0.3,
								height: size * 0.3,
								borderRadius: size * 0.15,
								left: size * 0.04,
								top: size * 0.06,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							line,
							{
								width: size * 0.26,
								height: size * 0.26,
								borderRadius: size * 0.13,
								left: size * 0.62,
								top: size * 0.12,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								borderColor: color,
								borderTopWidth: STROKE,
								borderLeftWidth: STROKE,
								borderRightWidth: STROKE,
								width: size * 0.42,
								height: size * 0.3,
								left: size * -0.02,
								top: size * 0.5,
								borderTopLeftRadius: size * 0.2,
								borderTopRightRadius: size * 0.2,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								borderColor: color,
								borderTopWidth: STROKE,
								borderLeftWidth: STROKE,
								borderRightWidth: STROKE,
								width: size * 0.36,
								height: size * 0.26,
								left: size * 0.6,
								top: size * 0.54,
								borderTopLeftRadius: size * 0.18,
								borderTopRightRadius: size * 0.18,
							},
						]}
					/>
				</View>
			);
		// A car — the trade-off's commute option.
		case "car":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							{
								borderColor: color,
								borderTopWidth: STROKE,
								borderLeftWidth: STROKE,
								borderRightWidth: STROKE,
								width: size * 0.56,
								height: size * 0.24,
								left: size * 0.22,
								top: size * 0.24,
								borderTopLeftRadius: size * 0.14,
								borderTopRightRadius: size * 0.14,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							line,
							{
								width: size * 0.86,
								height: size * 0.26,
								left: size * 0.07,
								top: size * 0.46,
								borderRadius: size * 0.08,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: size * 0.14,
								height: size * 0.14,
								borderRadius: size * 0.07,
								left: size * 0.2,
								top: size * 0.68,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: size * 0.14,
								height: size * 0.14,
								borderRadius: size * 0.07,
								left: size * 0.66,
								top: size * 0.68,
							},
						]}
					/>
				</View>
			);
		// A house with a tree — the trade-off's backyard option.
		case "yard":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							{
								borderLeftWidth: size * 0.24,
								borderRightWidth: size * 0.24,
								borderBottomWidth: size * 0.26,
								borderLeftColor: "transparent",
								borderRightColor: "transparent",
								borderBottomColor: color,
								left: size * 0.02,
								top: size * 0.14,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							line,
							{
								width: size * 0.44,
								height: size * 0.34,
								left: size * 0.02,
								top: size * 0.4,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							line,
							{
								width: size * 0.3,
								height: size * 0.3,
								borderRadius: size * 0.15,
								left: size * 0.6,
								top: size * 0.24,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: STROKE,
								height: size * 0.22,
								left: size * 0.75 - STROKE / 2,
								top: size * 0.52,
							},
						]}
					/>
				</View>
			);
		// A four-point sparkle — the insight card's badge.
		case "sparkle":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: STROKE + 0.4,
								height: size,
								left: size * 0.5 - (STROKE + 0.4) / 2,
								top: 0,
								borderRadius: STROKE,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: size,
								height: STROKE + 0.4,
								left: 0,
								top: size * 0.5 - (STROKE + 0.4) / 2,
								borderRadius: STROKE,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: STROKE,
								height: size * 0.68,
								left: size * 0.5 - STROKE / 2,
								top: size * 0.16,
								borderRadius: STROKE,
								transform: [{ rotate: "45deg" }],
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: size * 0.68,
								height: STROKE,
								left: size * 0.16,
								top: size * 0.5 - STROKE / 2,
								borderRadius: STROKE,
								transform: [{ rotate: "45deg" }],
							},
						]}
					/>
				</View>
			);
	}
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

	icon: { position: "relative" },
	iconAbs: { position: "absolute" },
	iconFill: { position: "absolute", left: 0, right: 0 },
});
