/**
 * TradeoffFace (§1.6) — the trade-off front face.
 *
 * ── 2026-08-29 rebuild: Two Doors ───────────────────────────────────────────
 *
 * Owner picked direction A of the three proposed on 2026-08-25. The card is no
 * longer a white form: it splits down the middle and each choice becomes a
 * PHOTOGRAPH, so the buyer picks between two places they can see rather than
 * between two words.
 *
 * Why it had to change at all. On 2026-08-18 listing / community / city
 * collapsed into ONE immersive face — media edge to edge, facts on a bottom
 * scrim, a frosted kind pill at 12/12. This card never made that trip, so it
 * was the deck's last white card, arriving between two playing tours as an
 * interruption rather than as the next card. It was also composed for a `0.62`
 * frame and the deck now runs `CARD_FRAME_RATIO` 0.83 for every kind: the same
 * ~230pt of content in a 531pt box, two 58pt discs floating in the middle of a
 * page of white. It was pulled from the mix on 2026-08-22; this is what brings
 * it back.
 *
 * What it borrows from the shared face, so it reads as the same box:
 *
 *   · frosted TRADE-OFF pill top-left at 12/12 — the LISTING / COMMUNITY badge
 *     verbatim, relabelled.
 *   · a bottom scrim per door, and the labels sit ON the photo.
 *   · NO bookmark disc. There is nothing here to save, and leaving that slot
 *     empty is the honest signal that this card is a question, not inventory.
 *
 * ── The photograph is borrowed, never bought ────────────────────────────────
 *
 * A trade-off has no media of its own. Rather than ship eleven stock images —
 * one per `DimKey` — each door borrows the hero of a pool row that CLAIMS that
 * dimension (`generate-feed.ts`'s `heroForDim`). Two consequences worth
 * knowing:
 *
 *   · the picture behind "Best schools" is a real community the buyer could be
 *     shown three cards later, not a stock lawn;
 *   · the card costs no new asset and no new licence — every image it draws is
 *     already rendering elsewhere in the same deck.
 *
 * A dim that no pool row claims gets NO photo, and the door falls back to the
 * unlit field below rather than borrowing an unrelated picture.
 *
 * ── The unlit field ─────────────────────────────────────────────────────────
 *
 * `cardSurfaces.tradeoff` and `tradeoffAlt` were written for exactly this card
 * ("the right half of the trade-off split only") and had never rendered. They
 * are the no-photo door: a warm ramp against a cool one, each with the choice's
 * own glyph blown up to 190pt and bled off the edge as a watermark.
 *
 * Neither field is green at rest. Green floods only the door being CHOSEN,
 * which keeps the redline's one rule about the accent — green is interactive
 * state, never decoration.
 *
 * ── The drag ────────────────────────────────────────────────────────────────
 *
 * The gesture is the deck's own swipe; this face just makes it visible. Pull
 * left and the left door widens to 66% while the right darkens behind a veil
 * and a green check lands beside the winning label. Nothing new to learn.
 *
 * The door's WIDTH is animated, which is a layout prop and therefore more
 * expensive than the opacity-only crossfade this file used to do. It is one
 * animated width on one view (the other door is `flex: 1` and takes what is
 * left), written on the UI thread by Reanimated — the split opening is the
 * whole point of the design, and a `scaleX` would distort the photographs.
 */
import type { DimKey } from "@percho/shared/types";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, {
	type AnimatedStyle,
	type SharedValue,
	interpolate,
	useAnimatedStyle,
} from "react-native-reanimated";
import type { TradeoffCardV3, TradeoffSideV3 } from "../../lib/feed/card-types";
import { SWIPE_THRESHOLD_RATIO } from "../../lib/gesture/decide-swipe";
import {
	cardSurfaces,
	colors,
	radii,
	redline,
	redlineRadii,
} from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { RedlineIcon, type RedlineIconName } from "./redline/RedlineChrome";

/**
 * How far the split slides at a full-threshold drag, as a share of the card.
 * 0.16 puts the chosen door at 66% and the discarded one at 34% — open enough
 * to read as a decision, short of the discarded photo becoming a sliver.
 */
const LEAN = 0.16;

/** The choice's glyph, on the door's foot. */
const DOOR_ICON = 21;
/** The same glyph as the unlit field's watermark, bled off the door's edge. */
const WATERMARK = 190;
/** The green confirmation beside the winning label. */
const CHECK_DISC = 20;
/** The `or` node that rides the split. */
const OR_NODE = 32;

/** Past this share of the threshold the choice is committed enough to confirm. */
const CONFIRM_AT = 0.45;

const DIM_ICON: Partial<Record<DimKey, RedlineIconName>> = {
	outdoors: "yard",
	space: "expand",
	trails: "path",
	walkable: "walk",
	schools: "school",
	family: "family",
	move_in: "check",
	quiet: "moon",
	hip: "shop",
	nightlife: "cup",
	entertaining: "cup",
};

const SUPPORT: Record<DimKey, string> = {
	outdoors: "More room outside",
	walkable: "Less time driving",
	schools: "Better for families",
	quiet: "Peace and quiet",
	hip: "A neighborhood scene",
	entertaining: "Great for hosting",
	trails: "Nature on your doorstep",
	nightlife: "Walk to dinner",
	family: "Made for family life",
	move_in: "Nothing to fix",
	space: "Room to grow",
};

function glyphFor(side: TradeoffSideV3): RedlineIconName {
	return side.icon ?? DIM_ICON[side.dim] ?? "walk";
}

interface DoorProps {
	side: TradeoffSideV3;
	/** Which unlit field this door wears when it has no photograph. */
	tone: "tradeoff" | "tradeoffAlt";
	/** Veil (the discarded door) and check (the chosen one), driven by the drag. */
	veilStyle: AnimatedStyle<ViewStyle>;
	checkStyle: AnimatedStyle<ViewStyle>;
	greenStyle: AnimatedStyle<ViewStyle>;
}

function Door({ side, tone, veilStyle, checkStyle, greenStyle }: DoorProps) {
	const surface = cardSurfaces[tone];
	const glyph = glyphFor(side);

	return (
		<>
			{side.photoUrl ? (
				<CardPhoto url={side.photoUrl} fit="cover" />
			) : (
				<>
					<LinearGradient
						colors={[surface.from, surface.to]}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 1 }}
						style={StyleSheet.absoluteFill}
					/>
					<LinearGradient
						colors={[surface.glow, "transparent"]}
						locations={[0, 0.58]}
						start={{ x: 0, y: 0 }}
						end={{ x: 0.85, y: 0.85 }}
						style={StyleSheet.absoluteFill}
					/>
					<View style={styles.watermark} pointerEvents="none">
						<RedlineIcon
							name={glyph}
							size={WATERMARK}
							color={redline.onPhoto}
							weight="outline"
						/>
					</View>
				</>
			)}

			{/* The chosen door's green wash. Sits UNDER the scrim so the label
			    keeps the contrast it was checked at. */}
			<Animated.View
				style={[styles.greenWash, greenStyle]}
				pointerEvents="none"
			>
				<LinearGradient
					colors={[redline.accent, redline.accentDeep]}
					start={{ x: 0, y: 0 }}
					end={{ x: 1, y: 1 }}
					style={StyleSheet.absoluteFill}
				/>
			</Animated.View>

			<LinearGradient
				colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.88)"]}
				locations={[0.42, 0.74, 1]}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
				style={styles.scrim}
				pointerEvents="none"
			/>

			<Animated.View style={[styles.veil, veilStyle]} pointerEvents="none" />

			<View style={styles.foot} pointerEvents="none">
				<RedlineIcon
					name={glyph}
					size={DOOR_ICON}
					color={redline.onPhoto}
					weight="outline"
				/>
				<View style={styles.labelRow}>
					<Text style={styles.label}>{side.label}</Text>
					<Animated.View style={[styles.check, checkStyle]}>
						<RedlineIcon
							name="check"
							size={13}
							color={redline.onPhoto}
							weight="fill"
						/>
					</Animated.View>
				</View>
				<Text style={styles.support}>{SUPPORT[side.dim]}</Text>
			</View>
		</>
	);
}

interface TradeoffFaceProps {
	card: TradeoffCardV3;
	tx: SharedValue<number>;
	cardWidth: number;
}

export function TradeoffFace({ card, tx, cardWidth }: TradeoffFaceProps) {
	const span = cardWidth * SWIPE_THRESHOLD_RATIO;

	/**
	 * The split, as a share of the card. Drag LEFT (negative `tx`) opens the
	 * LEFT door — the same sign convention the opacity crossfade used before.
	 */
	const leftDoorStyle = useAnimatedStyle(() => {
		const t = span === 0 ? 0 : tx.value / span;
		const basis = 0.5 - Math.max(-1, Math.min(1, t)) * LEAN;
		return { width: cardWidth * basis };
	});

	const splitStyle = useAnimatedStyle(() => {
		const t = span === 0 ? 0 : tx.value / span;
		const basis = 0.5 - Math.max(-1, Math.min(1, t)) * LEAN;
		return { left: cardWidth * basis };
	});

	/** The discarded door dims; the chosen one never does. */
	const leftVeil = useAnimatedStyle(() => ({
		opacity: interpolate(tx.value, [0, span], [0, 0.62], "clamp"),
	}));
	const rightVeil = useAnimatedStyle(() => ({
		opacity: interpolate(tx.value, [-span, 0], [0.62, 0], "clamp"),
	}));

	const leftGreen = useAnimatedStyle(() => ({
		opacity: interpolate(
			tx.value,
			[-span, -span * CONFIRM_AT],
			[0.9, 0],
			"clamp",
		),
	}));
	const rightGreen = useAnimatedStyle(() => ({
		opacity: interpolate(
			tx.value,
			[span * CONFIRM_AT, span],
			[0, 0.9],
			"clamp",
		),
	}));

	const leftCheck = useAnimatedStyle(() => ({
		opacity: interpolate(
			tx.value,
			[-span, -span * CONFIRM_AT],
			[1, 0],
			"clamp",
		),
		transform: [
			{
				scale: interpolate(
					tx.value,
					[-span, -span * CONFIRM_AT],
					[1, 0.6],
					"clamp",
				),
			},
		],
	}));
	const rightCheck = useAnimatedStyle(() => ({
		opacity: interpolate(tx.value, [span * CONFIRM_AT, span], [0, 1], "clamp"),
		transform: [
			{
				scale: interpolate(
					tx.value,
					[span * CONFIRM_AT, span],
					[0.6, 1],
					"clamp",
				),
			},
		],
	}));

	return (
		<View style={styles.face}>
			<View style={styles.doors}>
				<Animated.View style={[styles.door, leftDoorStyle]}>
					<Door
						side={card.left}
						tone="tradeoff"
						veilStyle={leftVeil}
						checkStyle={leftCheck}
						greenStyle={leftGreen}
					/>
				</Animated.View>
				<View style={[styles.door, styles.doorRight]}>
					<Door
						side={card.right}
						tone="tradeoffAlt"
						veilStyle={rightVeil}
						checkStyle={rightCheck}
						greenStyle={rightGreen}
					/>
				</View>
			</View>

			{/* The seam and its `or`, both riding the split. */}
			<Animated.View style={[styles.seam, splitStyle]} pointerEvents="none" />
			<Animated.View style={[styles.orNode, splitStyle]} pointerEvents="none">
				<Text style={styles.orLabel}>or</Text>
			</Animated.View>

			{/* Top scrim — the question has to hold on a bright sky frame. */}
			<LinearGradient
				colors={["rgba(0,0,0,0.46)", "transparent"]}
				locations={[0, 1]}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
				style={styles.topScrim}
				pointerEvents="none"
			/>

			<View style={styles.badgeSlot} pointerEvents="none">
				<View style={styles.badge}>
					<Text style={styles.badgeLabel}>TRADE-OFF</Text>
				</View>
			</View>

			<Text style={styles.ask}>What matters more to you?</Text>
			<Text style={styles.hint}>swipe either way</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: colors.cardPlainTo, overflow: "hidden" },
	doors: { flex: 1, flexDirection: "row" },
	/** `overflow: hidden` keeps each photo inside its own half as the split moves. */
	door: { overflow: "hidden" },
	/** The right door takes whatever the animated left one leaves. */
	doorRight: { flex: 1 },

	scrim: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
	veil: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(9,8,7,1)",
		zIndex: 3,
	},
	greenWash: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
	/**
	 * The unlit field's glyph, bled off the door's right edge — a watermark, not
	 * an illustration: at 0.085 it gives the field a subject without competing
	 * with the label, which on this card IS the content.
	 */
	watermark: {
		position: "absolute",
		right: -WATERMARK / 3,
		top: "38%",
		opacity: 0.085,
	},

	/** 18pt gutters, and clear of the `swipe either way` line at the foot. */
	foot: {
		position: "absolute",
		left: 18,
		right: 18,
		bottom: 38,
		zIndex: 4,
		gap: 9,
	},
	labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	/**
	 * Serif 21/23 — the community name's family one step down, because two of
	 * these share the width one name gets.
	 */
	label: {
		...redlineText.place,
		fontSize: 21,
		lineHeight: 23,
		letterSpacing: -0.3,
		color: redline.onPhoto,
		flexShrink: 1,
		minWidth: 0,
	},
	check: {
		width: CHECK_DISC,
		height: CHECK_DISC,
		borderRadius: radii.pill,
		backgroundColor: redline.accent,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	support: {
		...redlineText.subtext,
		fontSize: 11.5,
		lineHeight: 15,
		color: "rgba(255,255,255,0.72)",
	},

	seam: {
		position: "absolute",
		top: 0,
		bottom: 0,
		width: StyleSheet.hairlineWidth * 2,
		marginLeft: -StyleSheet.hairlineWidth,
		backgroundColor: "rgba(255,255,255,0.26)",
		zIndex: 5,
	},
	orNode: {
		position: "absolute",
		top: "50%",
		width: OR_NODE,
		height: OR_NODE,
		marginLeft: -OR_NODE / 2,
		marginTop: -OR_NODE / 2,
		borderRadius: radii.pill,
		backgroundColor: "rgba(18,16,14,0.78)",
		borderWidth: StyleSheet.hairlineWidth * 2,
		borderColor: "rgba(255,255,255,0.34)",
		alignItems: "center",
		justifyContent: "center",
		zIndex: 6,
	},
	orLabel: { ...redlineText.nano, fontSize: 10, color: redline.onPhotoDim },

	topScrim: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		height: 148,
		zIndex: 5,
	},
	badgeSlot: { position: "absolute", top: 12, left: 12, zIndex: 7 },
	/** The LISTING / COMMUNITY badge verbatim, relabelled. */
	badge: {
		alignSelf: "flex-start",
		backgroundColor: "rgba(255,255,255,0.92)",
		borderRadius: redlineRadii.badge,
		paddingVertical: 7,
		paddingHorizontal: 10,
		overflow: "hidden",
	},
	badgeLabel: { ...redlineText.listingCard.badge, color: "#181B18" },

	/**
	 * The question, on the top scrim. 27/29 — the community name's size, not the
	 * redline's 32: it has to clear the badge above it and leave the doors their
	 * own headline room below.
	 */
	ask: {
		position: "absolute",
		top: 48,
		left: 22,
		right: 22,
		zIndex: 7,
		...redlineText.question,
		fontSize: 27,
		lineHeight: 29,
		color: redline.onPhoto,
	},
	hint: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 13,
		zIndex: 7,
		...redlineText.micro,
		fontSize: 10.5,
		color: "rgba(255,255,255,0.6)",
		textAlign: "center",
	},
});
