import { LinearGradient } from "expo-linear-gradient";
import { Fragment } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { abbreviateAddress } from "../../lib/feed/abbreviate-address";
import type { ListingCardV3 } from "../../lib/feed/card-types";
import { SOUND_TAP_TARGET, type TapSlot } from "../../lib/gesture/tap-slot";
import { useSavedStore } from "../../state/saved";
import { useSoundStore } from "../../state/sound";
import { redline } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { CardCorner } from "./CardCorner";

/**
 * ListingFace (§1.4) — the listing front face.
 *
 * ── 2026-08-18 rebuild: immersive full-bleed, the ONE card system ───────────
 *
 * Owner (Tia, 2026-08-18): every card is the same box with a different content
 * type. City / Community / Listing share ONE immersive full-image face —
 * media fills the ENTIRE card, price/specs/address sit on a bottom scrim,
 * and the white text block under the media is GONE (「不要给 Listing 单独加
 * 白色 information container」). The listing card is no longer media + white
 * panel; it is a photo with the facts on it, exactly like the CITY card.
 *
 *   · top-left EMPTY since phase174. It held a LISTING pill, and the owner
 *     took it off: "remove the listing tag from top left of the card, since it
 *     is obvious" (2026-09-05). A photo of a house priced in dollars with a bed
 *     and bath count is not mistakable for anything else in this deck, and the
 *     pill was the only chrome competing with the photograph up there.
 *   · bookmark disc top-right — the CITY card's 40px translucent white disc
 *     + dark bookmark (was a 32px dark disc).
 *   · bottom scrim — `LinearGradient` transparent → rgba(0,0,0,0.5),
 *     locations [0.55, 1], the CITY card's scrim verbatim.
 *   · bottom info on the photo, 30pt gutters (the CITY card's):
 *       a. price (serif 28/600 white) + specs on ONE baseline row
 *       b. address — one muted white line
 *       c. `Explore →` right-aligned, white 15/500 — the same CTA as CITY
 *          and COMMUNITY (「Explore」, not 「Explore home」).
 *   · `CARD_FRAME_RATIO` 0.73 keeps this card the same rectangle as every
 *     other kind; the frame is decided by `SwipeStack`, never here.
 *
 * The three fixed elements — type label / save / explore — are now identical
 * across City / Community / Listing (asserted in
 * `theme/listing-layout.test.ts`).
 *
 * ── What is NOT invented ────────────────────────────────────────────────────
 *
 * The card renders the card's real fields: `priceLabel`, `bedBathSqft` and the
 * merged address row. Nothing on this card is generated to fill the redline's
 * shape.
 */

/**
 * Which line icon stands for which preference dimension.
 *
 * A full `Record`, not `Partial` — the community card had exactly this bug: with
 * a partial map plus a `?? "walk"` fallback, every unmapped dim silently drew a
 * walking figure, so a chip reading "Move-in Ready" showed a pedestrian. Typing
 * it as a complete `Record` makes an unmapped dim a compile error instead.
 *
 * The tag pills that used to carry these icons are gone (2026-08-13 dropped
 * the icons, 2026-08-17 the pills, 2026-08-18 the white block itself), but the
 */

/**
 * Above this many characters the price drops a step (28 → 26pt). Row 1 seats
 * the price and the specs on one line with a 16pt minimum gap; a full
 * eight-figure label ("$120,000,000" = 13) at 28pt leaves the specs nothing to
 * sit in, while "$550,000" (8) has room to spare. Counted in characters rather
 * than measured because this module cannot measure text.
 */
const PRICE_LONG_CHARS = 12;

/** The bookmark disc's target id, written into `tapSlot` on touch start. */
export const SAVE_TAP_TARGET = "save";
/** The explore link's target id, written into `tapSlot` on touch start. */
export const EXPLORE_TAP_TARGET = "explore";

/**
 * Split the server's `"4 bd · 3 ba · 2,853 sqft"` into its three parts so the
 * card can render them as a divided row (`4 bd | 3 ba | 2,853 sqft`, owner
 * 2026-08-19). The separator is the server's middle dot — see
 * `formatBedBathSqft` in apps/web/app/api/mobile/feed/route.ts.
 */
function specsParts(bedBathSqft: string): string[] {
	return bedBathSqft
		.split(" · ")
		.map((p) => p.trim())
		.filter(Boolean);
}

interface ListingFaceProps {
	card: ListingCardV3;
	isTop: boolean;
	/** The feed screen is not in front (see `CardVideoProps.suspended`). */
	suspended?: boolean;
	onExplore?: () => void;
	/**
	 * The stack's tap slots (see `lib/gesture/tap-slot.ts`). Interactive
	 * targets on this face write their id into `tapSlot` on touch start; the
	 * pan's `onEnd` reads it to decide whether the release was a tap. Absent
	 * when the face renders outside the feed stack (dev-foundation), where
	 * nothing can be tapped.
	 */
	tapSlot?: SharedValue<TapSlot>;
}

export function ListingFace({
	card,
	isTop,
	suspended,
	onExplore,
	tapSlot,
}: ListingFaceProps) {
	/** Row 2: "355 Morgans Creek Ct · Kennesaw, GA 30144". */
	const place = [abbreviateAddress(card.address), card.locality, card.zip]
		.filter(Boolean)
		.join(" · ");

	const saved = useSavedStore((s) => s.isSaved(card.id));
	const toggleSaved = useSavedStore((s) => s.toggle);
	const soundOn = useSoundStore((s) => s.soundOn);
	const toggleSound = useSoundStore((s) => s.toggle);

	/**
	 * Touch-start handler shared by the two interactive targets. Writes the
	 * target id into `tapSlot` so the pan's `onEnd` can recognise the release
	 * as a tap on it. No gate here: at touch-down `tapStatus.active` is still
	 * false (the tap gesture's `onTouchesDown` fires after React's
	 * `onTouchStart`), so checking it would never arm. The swipe-vs-tap
	 * decision is made at RELEASE in the pan's `onEnd` (`isTapEnd`), which is
	 * where `tapStatus` actually matters.
	 */
	const arm = (target: string) => () => {
		if (!tapSlot) return;
		tapSlot.value = { target };
	};

	return (
		<View style={styles.face}>
			{/* Media — fills the ENTIRE card (owner 2026-08-18: full-image) */}
			{card.videoUrl ? (
				<CardVideo
					url={card.videoUrl}
					poster={card.heroUrl}
					isTop={isTop}
					suspended={suspended}
					fit="cover"
				/>
			) : (
				<CardPhoto url={card.heroUrl} fit="cover" />
			)}

			{/*
			 * Top-right control (phase140, owner pick "G2"): ONE capsule holding
			 * the mute and the bookmark, split by a hairline. Two separate discs
			 * were the owner's objection — 「右上两个 button 很奇怪」 — and the
			 * feed had had no mute at all since phase119 deleted the explore
			 * hero's. A photo-only listing passes no `sound`, so it keeps the
			 * plain 40pt bookmark disc this replaced.
			 */}
			<CardCorner
				{...(card.videoUrl
					? {
							sound: {
								on: soundOn,
								onPress: toggleSound,
								...(tapSlot ? { onTouchStart: arm(SOUND_TAP_TARGET) } : {}),
							},
						}
					: {})}
				save={{
					saved,
					onPress: () => toggleSaved(card.id, "listing"),
					...(tapSlot ? { onTouchStart: arm(SAVE_TAP_TARGET) } : {}),
				}}
			/>

			{/* Bottom scrim — transparent until ~55% down, then darkening to a
			    deep 0.92 at the bottom (owner 2026-08-19: 底部渐变 + 信息文字条,
			    like the reference photo — the bottom is near-black so the white
			    price/specs/address bar reads clearly). */}
			<LinearGradient
				colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.92)"]}
				locations={[0.55, 0.78, 1]}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
				style={styles.scrim}
				pointerEvents="none"
			/>

			{/* Bottom info — on the photo, stepped hierarchy (no white container).
			    Price is the anchor, specs secondary, address the muted line. */}
			<View style={styles.info}>
				<Text
					style={
						card.priceLabel.length > PRICE_LONG_CHARS
							? styles.priceLong
							: styles.price
					}
					numberOfLines={1}
				>
					{card.priceLabel}
				</Text>
				{!!place && (
					<Text style={styles.address} numberOfLines={1}>
						{place}
					</Text>
				)}
				<View style={styles.bottomRow}>
					{/* Specs bar — split into 3 columns with vertical dividers
					    (owner 2026-08-19: 「4 bd | 3 ba | 2,853 sqft」 on the
					    left 2/3, like the reference photo). */}
					{!!card.bedBathSqft && (
						<View style={styles.specsBar}>
							{specsParts(card.bedBathSqft).map((part, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: spec parts repeat (e.g. "2" bd / "2" ba), so the index is what makes the key unique
								<Fragment key={i}>
									{i > 0 && <View style={styles.specDivider} />}
									<Text style={styles.spec} numberOfLines={1}>
										{part}
									</Text>
								</Fragment>
							))}
						</View>
					)}
					{/* Explore → — right-aligned text + arrow, the CITY card's CTA shape. */}
					{!!onExplore && (
						<View style={styles.ctaRow}>
							<Pressable
								onTouchStart={arm(EXPLORE_TAP_TARGET)}
								onPress={tapSlot ? undefined : onExplore}
								accessibilityRole="link"
								accessibilityLabel="Explore home"
								hitSlop={12}
								style={({ pressed }) => [
									styles.ctaLink,
									pressed && styles.ctaPressed,
								]}
							>
								<Text style={styles.ctaLabel} numberOfLines={1}>
									Explore
								</Text>
								<ArrowRightIcon />
							</Pressable>
						</View>
					)}
				</View>
			</View>
		</View>
	);
}

/**
 * ── Outline icon art (owner, 2026-08-14) ────────────────────────────────────
 *
 * The two icons on this card are Lucide-style OUTLINES: a thin arrow after
 * "Explore" and a dark bookmark on the save disc. Neither can come from the
 * icon font — the Phosphor subset this project ships carries FILL weights only
 * (see `redline/icon-font.ts`), and `react-native-svg` red-screens in Expo Go
 * on this project (DEVLOG 2026-07-30 04:55).
 *
 * So they are composed from bordered `View`s, the way `RedlineChrome`'s
 * `HeartIcon` has always been. The numbers below are Lucide's own 24-grid
 * geometry scaled to the target size rather than eyeballed:
 *
 *   arrow-right  shaft (5,12)→(19,12), head corners (12,5)-(19,12)-(12,19)
 *   bookmark     body x 5..19, y 3..21, notch tip (12,16)
 *
 * A 45°-rotated square with only its top and right borders IS the arrowhead —
 * the same trick the heart's tail uses. Both icons are single-size and
 * single-colour, so the geometry lives in the StyleSheet below as constants
 * rather than as props.
 */
const OUTLINE_STROKE = 1.75;

const ARROW_SIZE = 16;
const ARROW_K = ARROW_SIZE / 24;
/** Side of the rotated square whose top+right borders draw the arrowhead. */
const ARROW_HEAD = 7 * ARROW_K * Math.SQRT2;

/** The arrow after "Explore". 16pt, 1.75 stroke, white. */
function ArrowRightIcon() {
	return (
		<View style={styles.arrowBox}>
			<View style={styles.arrowShaft} />
			<View style={styles.arrowHead} />
		</View>
	);
}

const styles = StyleSheet.create({
	/** `overflow: hidden` clips the scrim and the media to the card's radius. */
	face: { flex: 1, backgroundColor: redline.card, overflow: "hidden" },
	/**
	 * Bottom scrim — `overflow: hidden` on `face` clips it to the card's
	 * rounded corner. Same as the CITY card's.
	 */
	scrim: {
		...StyleSheet.absoluteFill,
		zIndex: 1,
	},
	info: {
		position: "absolute",
		left: 30,
		right: 30,
		bottom: 30,
		zIndex: 2,
	},
	/**
	 * Row 1 — the price on its own line (owner 2026-08-19: specs moved to the
	 * bottom divided bar, price stays the anchor above the address).
	 */
	price: {
		...redlineText.listingCard.price,
		fontWeight: "600",
		color: "#FFFFFF",
	},
	/**
	 * The long form — same serif 600, one step down to 26pt. Applied when the
	 * label passes `PRICE_LONG_CHARS`, so an eight-figure price keeps its 16pt
	 * gap to the specs on one line instead of squeezing them out.
	 */
	priceLong: {
		...redlineText.listingCard.price,
		fontSize: 26,
		lineHeight: 26,
		fontWeight: "600",
		color: "#FFFFFF",
	},
	/**
	 * Bottom row — specs bar (left ~2/3, split by dividers) + Explore (right).
	 * Owner 2026-08-19: 「把房间和面积信息放到最下面一层的左边三分之二处,
	 * 用分割线来展示」.
	 */
	bottomRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		marginTop: 12,
	},
	/**
	 * The specs bar: `4 bd | 3 ba | 2,853 sqft` — three parts separated by
	 * vertical hairlines. `flex: 2` + the CTA's `flex: 1` gives the bar
	 * roughly the left two-thirds.
	 */
	specsBar: {
		flex: 2,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minWidth: 0,
	},
	spec: {
		...redlineText.listingCard.specs,
		color: "rgba(255,255,255,0.92)",
	},
	/** The 1px hairline between specs. */
	specDivider: {
		width: 1,
		height: 14,
		backgroundColor: "rgba(255,255,255,0.35)",
	},
	/** Row 2 — "355 Morgans Creek Ct · Kennesaw, GA 30144", muted white. */
	address: {
		...redlineText.listingCard.address,
		color: "rgba(255,255,255,0.72)",
		marginTop: 6,
	},
	/**
	 * Explore link row — right-aligned, bottom of the overlay. The owner's
	 * 2026-08-13 revision dropped the giant 46pt green pill for a quiet link;
	 * 2026-08-18 unified it with the CITY/COMMUNITY CTA (white 15/500);
	 * 2026-08-19 it shares the bottom row with the specs bar (`flex: 1` of the
	 * bottom row's 2:1 split).
	 * Tap-detected via `tapSlot`, not Pressable.
	 */
	ctaRow: {
		flex: 1,
		flexDirection: "row",
		justifyContent: "flex-end",
		alignItems: "center",
	},
	ctaLink: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 6,
		minHeight: 32, // §0.5 touch floor
		paddingHorizontal: 2,
	},
	ctaPressed: { opacity: 0.7 },
	ctaLabel: {
		...redlineText.listingCard.cta,
		fontSize: 15,
		fontWeight: "500",
		color: "rgba(255,255,255,0.92)",
	},

	// ─── Outline icon art (see the block above `ArrowRightIcon`) ──────────
	arrowBox: { width: ARROW_SIZE, height: ARROW_SIZE },
	arrowShaft: {
		position: "absolute",
		left: 5 * ARROW_K,
		width: 14 * ARROW_K,
		top: (ARROW_SIZE - OUTLINE_STROKE) / 2,
		height: OUTLINE_STROKE,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: "#FFFFFF",
	},
	/**
	 * Lucide's head is the (12,5)-(19,12)-(12,19) corner, i.e. a square centred
	 * in the box, rotated 45°, wearing only its top and right borders.
	 */
	arrowHead: {
		position: "absolute",
		left: (ARROW_SIZE - ARROW_HEAD) / 2,
		top: (ARROW_SIZE - ARROW_HEAD) / 2,
		width: ARROW_HEAD,
		height: ARROW_HEAD,
		borderTopWidth: OUTLINE_STROKE,
		borderRightWidth: OUTLINE_STROKE,
		borderColor: "#FFFFFF",
		borderTopRightRadius: OUTLINE_STROKE,
		transform: [{ rotate: "45deg" }],
	},
});
