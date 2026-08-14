/**
 * AreaFace (§1.3) — the Stage 1–2 geographic probe. ONE component for all three
 * granularities (area / city / zip); the `KindChip` marks which level, per
 * §1.3 #1.
 *
 * ── 2026-08-15 rebuild: immersive full-bleed city card ───────────────────────
 *
 * The owner's ask: the city card is an EXPERIENCE CARD, not a listing card.
 * Media fills the ENTIRE card (no white text block underneath), UI recedes,
 * and the text sits on a subtle bottom scrim so it stays readable over any
 * video. Deliberately NOT `ListingFace`'s layout (media + white block below).
 *
 *   · CITY pill top-left — the LISTING / COMMUNITY frosted badge, relabelled.
 *   · bookmark disc top-right — translucent white disc + dark bookmark icon,
 *     the CITY pill's visual family (owner 2026-08-15).
 *   · bottom scrim — `LinearGradient` over the lower ~34% of the card:
 *     transparent → rgba(0,0,0,0.58), so white text reads on any frame
 *     without painting a black footer.
 *   · bottom info, 3 layers (30pt gutters):
 *       a. name (serif, largest)
 *       b. vibe (secondary, one line; deterministic fallback hook until the
 *          real vibe field ships)
 *       c. stats left · `Explore {city} →` right (text + arrow, no pill)
 *     Hierarchy: City → vibe → metadata / Explore CTA.
 *   · stats are low-contrast white and hide when meaningless (homes only when
 *     >1 — never `1 home`).
 *   · deleted: address/street pills, `AREA · CITY`, the old `CardFoot` panel.
 *   · height: the feed pins the area card to ~87% of the container (8–12%
 *     shorter than listing/community), width/radius/shadow/margins unchanged.
 *
 * Media follows §0.7 / PLAN B8: the real `videoUrl` when a unit has one (only 4
 * `community_videos` rows exist today), otherwise the real `heroUrl` as a
 * first-class static state with no missing-media affordance.
 *
 * With NEITHER — the common case for a derived city/zip unit, which has no
 * photo source at all — the face wears the `area` `CardSurface` rather than a
 * black screen. The scrim stays: over a media-less surface it reads as a
 * deeper foot to the gradient, which is exactly where the white text sits.
 */
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { AreaCardV3 } from "../../lib/feed/card-types";
import type { TapSlot } from "../../lib/gesture/tap-slot";
import { useSavedStore } from "../../state/saved";
import { redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { CardSurface } from "./CardSurface";
import { SAVE_TAP_TARGET } from "./ListingFace";

/** The circular arrow CTA's tap target id (feed.tsx `onTapTarget`). */
export const CITY_EXPLORE_TAP_TARGET = "city-explore";

interface AreaFaceProps {
	card: AreaCardV3;
	isTop: boolean;
	tapSlot?: SharedValue<TapSlot>;
	onExplore?: () => void;
}

/** `8 communities · 124 homes` — dynamic, no placeholders. Homes only when
 * meaningful (>1): a single active listing is noise on a city card. */
function statsLine(card: AreaCardV3): string | undefined {
	const { unit } = card;
	const parts: string[] = [];
	if (unit.communityCount > 0) {
		parts.push(
			unit.communityCount === 1
				? "1 community"
				: `${unit.communityCount} communities`,
		);
	}
	const active = unit.stats.activeListings;
	if (active !== undefined && active > 1) {
		parts.push(`${active} homes`);
	}
	return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Fallback hooks until the real vibe field ships (server `GeoUnitDTO` has no
 * vibe column today — owner approved dummy copy, 2026-08-15). Deterministic
 * per unit so a city reads the same hook every swipe.
 * ponytail: placeholder hooks, swap for authored copy when the field lands.
 */
const VIBE_FALLBACKS = [
	"Sunbelt pace, Southern charm, red-dirt sunsets.",
	"College-town energy without the Friday traffic.",
	"Ranch houses, lake breeze, and a farmers market every Saturday.",
	"Deep-dish loyalties and a quick train to the Loop.",
	"Trailheads out the back door, quiet streets up front.",
	"Coastal light, palm-lined blocks, salt in the air.",
	"Porch-sitting weather from March to November.",
	"Riverwalk mornings, game-day crowds, river views.",
	"Small-town downtown with big-city jobs an hour away.",
	"Wind, wheat fields, and a town square that still runs on handshakes.",
] as const;

function vibeText(card: AreaCardV3): string {
	if (card.vibe) return card.vibe;
	let h = 0;
	for (let i = 0; i < card.unit.id.length; i++) {
		h = (h * 31 + card.unit.id.charCodeAt(i)) | 0;
	}
	return VIBE_FALLBACKS[Math.abs(h) % VIBE_FALLBACKS.length]!;
}

export function AreaFace({
	card,
	isTop,
	tapSlot,
	onExplore,
}: AreaFaceProps) {
	const { unit } = card;
	const saved = useSavedStore((s) => s.isSaved(card.id));
	const toggleSaved = useSavedStore((s) => s.toggle);

	const arm = (target: string) => () => {
		if (!tapSlot) return;
		tapSlot.value = { target };
	};

	return (
		<View style={styles.face}>
			{unit.videoUrl ? (
				<CardVideo
					url={unit.videoUrl}
					poster={unit.heroUrl}
					isTop={isTop}
					fit="cover"
				/>
			) : unit.heroUrl ? (
				<CardPhoto url={unit.heroUrl} fit="cover" />
			) : (
				<CardSurface variant="area" />
			)}

			{/* CITY pill — the LISTING / COMMUNITY frosted badge, relabelled. */}
			<View style={styles.badgeSlot}>
				<View style={styles.badge}>
					<Text style={styles.badgeLabel}>CITY</Text>
				</View>
			</View>

			{/* Bookmark — translucent white disc + blur (owner 2026-08-15: 70–80% white + backdrop blur). */}
			<View style={styles.saveSlot}>
				<Pressable
					onTouchStart={arm(SAVE_TAP_TARGET)}
					onPress={tapSlot ? undefined : () => toggleSaved(card.id)}
					accessibilityRole="button"
					accessibilityLabel={saved ? "Saved" : "Save"}
					hitSlop={12}
					style={({ pressed }) => [
						styles.saveDisc,
						pressed && styles.savePressed,
					]}
				>
					<BookmarkIcon saved={saved} />
				</Pressable>
			</View>

			{/* Bottom scrim — transparent until ~55% down, then darkening to 0.5
			    at the bottom (owner 2026-08-15: adaptive, starts 55–60% up). */}
			<LinearGradient
				colors={["transparent", "rgba(0,0,0,0.5)"]}
				locations={[0.55, 1]}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
				style={styles.scrim}
				pointerEvents="none"
			/>

			{/* Bottom-left info block — white, stepped hierarchy. */}

			<View style={styles.info}>
				<Text style={styles.name} numberOfLines={1}>
					{unit.name}, {unit.state}
				</Text>
				<Text style={styles.vibe} numberOfLines={1}>
					{vibeText(card)}
				</Text>
				{(() => {
					const stats = statsLine(card);
					if (!stats) {
						return (
							<View style={styles.ctaBottomRow}>
								<Pressable
									onTouchStart={arm(CITY_EXPLORE_TAP_TARGET)}
									onPress={tapSlot ? undefined : onExplore}
									accessibilityRole="link"
									accessibilityLabel={`Explore ${unit.name}`}
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
						);
					}
					return (
						<View style={styles.bottomRow}>
							<Text style={styles.stats} numberOfLines={1}>
								{stats}
							</Text>
							<Pressable
								onTouchStart={arm(CITY_EXPLORE_TAP_TARGET)}
								onPress={tapSlot ? undefined : onExplore}
								accessibilityRole="link"
								accessibilityLabel={`Explore ${unit.name}`}
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
					);
				})()}
			</View>
		</View>
	);
}

/** The listing card's bookmark, recoloured dark (saved state fills the body). */
const OUTLINE_STROKE = 1.75;
const BOOKMARK_SIZE = 16;
const BOOKMARK_K = BOOKMARK_SIZE / 24;
const BM_LEFT = 5 * BOOKMARK_K;
const BM_WIDTH = 14 * BOOKMARK_K;
const BM_TOP = 3 * BOOKMARK_K;
const BM_BOTTOM = 21 * BOOKMARK_K;
const BM_NOTCH = 16 * BOOKMARK_K;
const BM_RUN = BM_WIDTH / 2;
const BM_RISE = BM_BOTTOM - BM_NOTCH;
const BM_DIAG = Math.hypot(BM_RUN, BM_RISE);
const BM_ANGLE = (Math.atan2(BM_RISE, BM_RUN) * 180) / Math.PI;
/** Same dark ink as the CITY pill label. */
const BOOKMARK_INK = "#181B18";

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

/** The listing card's outline arrow art, recoloured white (Lucide 24-grid:
 * shaft (5,12)→(19,12), head corners (12,5)-(19,12)-(12,19)). */
const ARROW_SIZE = 16;
const ARROW_K = ARROW_SIZE / 24;
const ARROW_HEAD = 7 * ARROW_K * Math.SQRT2;

function ArrowRightIcon() {
	return (
		<View style={styles.arrowBox}>
			<View style={styles.arrowShaft} />
			<View style={styles.arrowHead} />
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: redline.card, overflow: "hidden" },
	badgeSlot: { position: "absolute", top: 12, left: 12, zIndex: 2 },
	/** Frosted CITY badge — the listing card's badge, relabelled. */
	badge: {
		alignSelf: "flex-start",
		backgroundColor: "rgba(255,255,255,0.92)",
		borderRadius: redlineRadii.badge,
		paddingVertical: 7,
		paddingHorizontal: 10,
		overflow: "hidden",
	},
	/** Neutral ink, not green — same rule as the LISTING badge. */
	badgeLabel: { ...redlineText.listingCard.badge, color: "#181B18" },
	saveSlot: { position: "absolute", top: 12, right: 12, zIndex: 2 },
	/**
	 * Translucent white disc + dark bookmark — 40px (owner 2026-08-15: shrink
	 * the ~48px disc to 40–42). 75% white keeps it floating over the media.
	 * NOTE: backdrop blur (expo-blur) was tried here and red-screened Expo Go
	 * with a React 19 `use` dispatcher error, so it is plain translucency.
	 * The listing card's dark disc stays untouched.
	 */
	saveDisc: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(255,255,255,0.75)",
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	savePressed: { opacity: 0.7 },
	/**
	 * Bottom scrim — `overflow: hidden` on `face` clips it to the card's
	 * rounded corner. Over a `CardSurface` (no media) it reads as a deeper
	 * foot to that gradient; over a photo it is the text's readability layer.
	 */
	scrim: {
		...StyleSheet.absoluteFillObject,
		zIndex: 1,
	},
	info: {
		position: "absolute",
		left: 30,
		right: 30,
		bottom: 30,
		zIndex: 2,
	},
	/** City name — largest, serif. 27/600 keeps long names on one line. */
	name: {
		...redlineText.place,
		fontSize: 27,
		lineHeight: 29,
		fontWeight: "600",
		color: "#FFFFFF",
	},
	/** Vibe — one line, secondary. */
	vibe: {
		...redlineText.listingCard.address,
		fontSize: 13,
		color: "rgba(255,255,255,0.92)",
		marginTop: 2,
	},
	/** Stats — smallest. */
	stats: {
		...redlineText.listingCard.specs,
		fontSize: 11,
		fontWeight: "500",
		color: "rgba(255,255,255,0.72)",
		marginTop: 3,
	},
	/**
	 * Row 3 — stats left, `Explore {city} →` right. The CTA is text + arrow
	 * only (no pill, no background); `Explore` sits clearly below the title.
	 */
	bottomRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		marginTop: 10,
	},
	/** Same row, CTA alone — when stats are empty the link is right-aligned. */
	ctaBottomRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
		marginTop: 10,
	},
	/** CTA link — text + arrow, no pill, no background. */
	ctaLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 32, // §0.5 touch floor
		paddingHorizontal: 2,
	},
	ctaLabel: {
		...redlineText.listingCard.cta,
		fontSize: 13,
		fontWeight: "500",
		color: "rgba(255,255,255,0.92)",
	},
	ctaPressed: { opacity: 0.7 },

	// ─── Outline icon art (see the components above) ──────────────────
	bookmarkBox: { width: BOOKMARK_SIZE, height: BOOKMARK_SIZE },
	bookmarkFill: {
		position: "absolute",
		left: BM_LEFT + OUTLINE_STROKE,
		top: BM_TOP + OUTLINE_STROKE,
		width: BM_WIDTH - OUTLINE_STROKE * 2,
		height: BM_NOTCH - BM_TOP - OUTLINE_STROKE,
		backgroundColor: BOOKMARK_INK,
	},
	bookmarkTop: {
		position: "absolute",
		left: BM_LEFT,
		top: BM_TOP,
		width: BM_WIDTH,
		height: OUTLINE_STROKE,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: BOOKMARK_INK,
	},
	bookmarkSide: {
		position: "absolute",
		top: BM_TOP,
		width: OUTLINE_STROKE,
		height: BM_BOTTOM - BM_TOP,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: BOOKMARK_INK,
	},
	bookmarkSideLeft: { left: BM_LEFT },
	bookmarkSideRight: { left: BM_LEFT + BM_WIDTH - OUTLINE_STROKE },
	bookmarkDiag: {
		position: "absolute",
		top: (BM_BOTTOM + BM_NOTCH) / 2 - OUTLINE_STROKE / 2,
		width: BM_DIAG,
		height: OUTLINE_STROKE,
		borderRadius: OUTLINE_STROKE / 2,
		backgroundColor: BOOKMARK_INK,
	},
	bookmarkDiagLeft: {
		left: BM_LEFT + BM_RUN / 2 - BM_DIAG / 2,
		transform: [{ rotate: `${-BM_ANGLE}deg` }],
	},
	bookmarkDiagRight: {
		left: BM_LEFT + BM_WIDTH - BM_RUN / 2 - BM_DIAG / 2,
		transform: [{ rotate: `${BM_ANGLE}deg` }],
	},
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
