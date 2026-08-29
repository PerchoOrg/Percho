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
 * ── The photograph is a DETAIL, never a hero (owner, 2026-08-29) ────────────
 *
 * The first version borrowed each door's picture from a pool row's `heroUrl`,
 * and on device that said nothing: a listing hero is a front-elevation shot,
 * and no front elevation depicts "move-in ready". 「it doesnt make sense to put
 * some home tour hero pic into one of the trade off … use the actual detailed
 * photos instead」.
 *
 * So the door shows INTERIOR room photos the server matched to the dimension —
 * kitchens for `move_in`, living rooms for `space`. Place dims (`schools`,
 * `walkable`, `trails`, `hip`, `nightlife`) have no room inside a house that
 * shows them, so those doors take a single community tour poster instead — a
 * real photograph of the neighbourhood.
 *
 * ── Three plates, not one photograph ────────────────────────────────────────
 *
 * Owner, 2026-08-29: 「can we put multiple similar photos on each side? so the
 * tradeoff is high confidence, not based on one specific style」. One kitchen
 * makes the door a question about THAT kitchen's cabinets; three kitchens, from
 * three different homes, make it a question about kitchens. The server picks
 * them (`dim-photos.ts`); this file stacks them.
 *
 * ── Why a plate and not a full-bleed fill ───────────────────────────────────
 *
 * Owner, same day: 「half pic only show very narrow part, and quality is bad」.
 * Both were one geometry problem. A door is 180.5 × 531pt — aspect 0.34 — and a
 * listing photo is 1.51. Filling it with `cover` kept the height and threw away
 * 77% of the WIDTH (the white cabinetry, the island, the appliances the caption
 * named), then upscaled the remaining strip 3× to reach a 3x screen's 1593
 * device pixels.
 *
 * A plate is the photo at its own aspect inside the door, so nothing is cropped
 * and — at ~152pt wide against a 1600px enhanced source — it is a 0.29×
 * DOWNSAMPLE. Downsampling is always sharp. The plates are `flex: 1` rather
 * than a fixed aspect so three of them fit an iPhone SE's shorter card as well
 * as a Pro Max's; on a short card they crop a little off the top and bottom,
 * which costs nothing a room needs.
 *
 * `generate-feed.ts`'s `lightSide` owns which photos. A dim with none leaves
 * the door on its unlit field below, which is the honest answer.
 *
 * ── The last line ──────────────────────────────────────────────────────────
 *
 * How many homes in the loaded pool claim this dimension and what they cost
 * ("18 homes · median $342,000"). The plates say what the choice LOOKS like;
 * this says what it COSTS. The median is suppressed under three homes — below
 * that it is noise, not a fact about the market.
 *
 * The tagger's sentence renders only when the door shows exactly ONE photo. Set
 * under three plates it reads as describing all of them, and it does not: it is
 * trustworthy precisely because it describes one frame.
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
import { LinearGradient } from "expo-linear-gradient";
import { Image, StyleSheet, Text, View, type ViewStyle } from "react-native";
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

/**
 * The glyph an unlit door wears.
 *
 * The v2 bank (2026-08-29) names its own icon per side, because most of its 32
 * questions are not about one of the eleven lifestyle dims — "One level / Two
 * stories" has no dim to derive a glyph from. `walk` is the last resort for a
 * side that names neither.
 */
function glyphFor(side: TradeoffSideV3): RedlineIconName {
	return (side.icon as RedlineIconName | undefined) ?? "walk";
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
	const photos = side.photos ?? [];
	/** Only a lone plate may carry a sentence — see the header. */
	const caption =
		photos.length === 1 ? (photos[0]?.caption ?? side.support) : undefined;

	return (
		<>
			{/*
			 * The FIELD, always — the plates sit on it rather than replacing it.
			 * Before 2026-08-29 a photo filled the whole door; see the header for
			 * why that had to stop.
			 */}
			{
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
					{photos.length === 0 && (
						<View style={styles.watermark} pointerEvents="none">
							<RedlineIcon
								name={glyph}
								size={WATERMARK}
								color={redline.onPhoto}
								weight="outline"
							/>
						</View>
					)}
				</>
			}

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
				colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.72)"]}
				locations={[0.45, 0.78, 1]}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
				style={styles.scrim}
				pointerEvents="none"
			/>

			<Animated.View style={[styles.veil, veilStyle]} pointerEvents="none" />

			<View style={styles.foot} pointerEvents="none">
				{photos.length > 0 && (
					<View style={styles.plates}>
						{photos.map((photo) => (
							<View key={photo.url} style={styles.plate}>
								<Image
									source={{ uri: photo.url }}
									style={StyleSheet.absoluteFill}
									resizeMode="cover"
								/>
							</View>
						))}
					</View>
				)}

				{/* The glyph is the door's only mark when there is no photograph;
				    over real room photos the plates carry it, so it is dropped
				    rather than stamped on someone's kitchen. */}
				{photos.length === 0 && (
					<RedlineIcon
						name={glyph}
						size={DOOR_ICON}
						color={redline.onPhoto}
						weight="outline"
					/>
				)}

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

				{/*
				 * One photo → its own sentence. Three → the plates already say
				 * "kitchens" and a single caption would be claiming to describe
				 * all three. No photo → the authored support line.
				 */}
				{/*
				 * One photo → its own tagger sentence. Three → the plates already
				 * say "kitchens" and a single caption would claim to describe all
				 * three. No photo → the authored support line, which is the whole
				 * of what an ungrounded question has to offer.
				 */}
				<Text style={styles.support} numberOfLines={3}>
					{caption ?? side.support}
				</Text>
				{side.homes !== undefined && (
					<Text style={styles.meta}>
						{side.homes} {side.homes === 1 ? "home" : "homes"}
						{side.medianLabel === undefined
							? ""
							: ` · median ${side.medianLabel}`}
					</Text>
				)}
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

			{/* The question's own headline. A single fixed prompt was fine for
			    seven questions; with 32 it wastes the one line a buyer reads. */}
			<Text style={styles.ask} numberOfLines={3}>
				{card.prompt}
			</Text>
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

	/**
	 * The door's whole content column, not just a caption block: it starts under
	 * the question and runs to just above the `swipe either way` line, so the
	 * plates can take every point of height that is left.
	 *
	 * `top` clears the badge (12+~26) and the two-line question below it.
	 */
	foot: {
		position: "absolute",
		top: 118,
		left: 14,
		right: 14,
		bottom: 34,
		zIndex: 4,
		gap: 7,
		justifyContent: "flex-end",
	},
	/**
	 * `flex: 1` on the stack AND on each plate: the three split whatever height
	 * the label and meta rows leave, so the same code fits an SE's shorter card
	 * and a Pro Max's taller one. A fixed 3:2 would overflow the SE.
	 */
	plates: {
		flex: 1,
		gap: 6,
		marginBottom: 3,
	},
	plate: {
		flex: 1,
		borderRadius: 12,
		overflow: "hidden",
		backgroundColor: "rgba(0,0,0,0.35)",
		borderWidth: StyleSheet.hairlineWidth * 2,
		borderColor: "rgba(255,255,255,0.18)",
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
		lineHeight: 15.5,
		color: "rgba(255,255,255,0.78)",
	},
	/**
	 * The count/median line. Deliberately quieter than the caption above it —
	 * it is the footnote to the picture, not a second headline.
	 */
	meta: {
		...redlineText.nano,
		fontSize: 10.5,
		lineHeight: 13,
		color: "rgba(255,255,255,0.5)",
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
