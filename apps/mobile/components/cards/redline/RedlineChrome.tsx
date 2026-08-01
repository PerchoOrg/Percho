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
	| "sparkle"
	// Community-highlight dims. Added when the community card started
	// receiving real `dims` from the Nextdoor seed: the ten dims that actually
	// occur need ten distinct glyphs, and before this `quiet` was borrowing the
	// two-heads `family` art, which reads as "family" on a tile labelled
	// "Quiet Streets".
	| "moon"
	| "path"
	| "shop"
	| "cup"
	| "check"
	| "expand";

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
		// A crescent moon — "Quiet Streets".
		//
		// Drawn as an ARC, not as two overlapping discs. The two-disc trick needs
		// an opaque disc in the backdrop's colour to bite the crescent out, and
		// this icon's main call site is a glass tile floating over a photo — there
		// is no solid colour there to paint with, so the bite would show as a grey
		// blob. A circle with two adjacent borders set transparent gives a real
		// open arc that composites correctly over anything.
		case "moon":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							{
								borderWidth: STROKE,
								borderColor: color,
								// The open side of the crescent.
								borderRightColor: "transparent",
								borderTopColor: "transparent",
								width: size * 0.86,
								height: size * 0.86,
								borderRadius: size * 0.43,
								left: size * 0.07,
								top: size * 0.07,
								transform: [{ rotate: "-20deg" }],
							},
						]}
					/>
				</View>
			);
		// A winding path — "Trails Nearby". Three offset dashes read as a trail
		// receding, which is legible at 17pt where an S-curve is not.
		case "path":
			return (
				<View style={[styles.icon, box]}>
					{[
						{ w: 0.5, l: 0.06, t: 0.7 },
						{ w: 0.38, l: 0.3, t: 0.44 },
						{ w: 0.26, l: 0.5, t: 0.18 },
					].map((seg) => (
						<View
							key={seg.t}
							style={[
								styles.iconAbs,
								{
									backgroundColor: color,
									width: size * seg.w,
									height: STROKE,
									left: size * seg.l,
									top: size * seg.t,
									borderRadius: STROKE,
								},
							]}
						/>
					))}
				</View>
			);
		// A shopfront with an awning — "Cultural Scene" (shops, food, downtown).
		case "shop":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: size * 0.9,
								height: STROKE,
								left: size * 0.05,
								top: size * 0.32,
								borderRadius: STROKE,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								borderColor: color,
								borderLeftWidth: STROKE,
								borderRightWidth: STROKE,
								borderBottomWidth: STROKE,
								width: size * 0.74,
								height: size * 0.48,
								left: size * 0.13,
								top: size * 0.34,
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
								width: size * 0.3,
								height: size * 0.24,
								left: size * 0.35,
								top: size * 0.58,
								borderTopLeftRadius: size * 0.15,
								borderTopRightRadius: size * 0.15,
							},
						]}
					/>
				</View>
			);
		// A cup — "Great for Hosting" (entertaining: dinners, wine, gatherings).
		case "cup":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							{
								borderColor: color,
								borderLeftWidth: STROKE,
								borderRightWidth: STROKE,
								borderBottomWidth: STROKE,
								width: size * 0.52,
								height: size * 0.36,
								left: size * 0.14,
								top: size * 0.22,
								borderBottomLeftRadius: size * 0.24,
								borderBottomRightRadius: size * 0.24,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: STROKE,
								height: size * 0.24,
								left: size * 0.4 - STROKE / 2,
								top: size * 0.56,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: size * 0.36,
								height: STROKE,
								left: size * 0.22,
								top: size * 0.8,
								borderRadius: STROKE,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							line,
							{
								width: size * 0.22,
								height: size * 0.22,
								borderRadius: size * 0.11,
								left: size * 0.64,
								top: size * 0.28,
							},
						]}
					/>
				</View>
			);
		// A ticked box — "Move-in Ready".
		case "check":
			return (
				<View style={[styles.icon, box]}>
					<View
						style={[
							styles.iconAbs,
							line,
							{
								width: size * 0.84,
								height: size * 0.84,
								borderRadius: size * 0.24,
								left: size * 0.08,
								top: size * 0.08,
							},
						]}
					/>
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: size * 0.22,
								height: STROKE,
								left: size * 0.24,
								top: size * 0.52,
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
								width: size * 0.38,
								height: STROKE,
								left: size * 0.38,
								top: size * 0.46,
								borderRadius: STROKE,
								transform: [{ rotate: "-45deg" }],
							},
						]}
					/>
				</View>
			);
		// Four corner brackets pushing outward — "Spacious".
		case "expand":
			return (
				<View style={[styles.icon, box]}>
					{[
						{ k: "tl", top: STROKE, left: STROKE, tw: STROKE, lw: STROKE },
						{ k: "tr", top: STROKE, right: STROKE, tw: STROKE, rw: STROKE },
						{ k: "bl", bottom: STROKE, left: STROKE, bw: STROKE, lw: STROKE },
						{ k: "br", bottom: STROKE, right: STROKE, bw: STROKE, rw: STROKE },
					].map((c) => (
						<View
							key={c.k}
							style={[
								styles.iconAbs,
								{
									borderColor: color,
									borderTopWidth: c.tw ?? 0,
									borderBottomWidth: c.bw ?? 0,
									borderLeftWidth: c.lw ?? 0,
									borderRightWidth: c.rw ?? 0,
									width: size * 0.3,
									height: size * 0.3,
									...(c.top !== undefined ? { top: 0 } : { bottom: 0 }),
									...(c.left !== undefined ? { left: 0 } : { right: 0 }),
								},
							]}
						/>
					))}
					<View
						style={[
							styles.iconAbs,
							{
								backgroundColor: color,
								width: size * 0.34,
								height: STROKE,
								left: size * 0.33,
								top: size * 0.5 - STROKE / 2,
								borderRadius: STROKE,
								transform: [{ rotate: "-45deg" }],
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
