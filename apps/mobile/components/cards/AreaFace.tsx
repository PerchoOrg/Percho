import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { AreaCardV3 } from "../../lib/feed/card-types";
import {
	SHARE_TAP_TARGET,
	SOUND_TAP_TARGET,
	type TapSlot,
} from "../../lib/gesture/tap-slot";
import { useSavedStore } from "../../state/saved";
import { useSoundStore } from "../../state/sound";
import { redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { CardCorner } from "./CardCorner";
import { CardSurface } from "./CardSurface";
import { EXPLORE_TAP_TARGET, SAVE_TAP_TARGET } from "./ListingFace";

interface AreaFaceProps {
	card: AreaCardV3;
	isTop: boolean;
	/** The feed screen is not in front (see `CardVideoProps.suspended`). */
	suspended?: boolean;
	tapSlot?: SharedValue<TapSlot>;
	onExplore?: () => void;
	/** Opens the share sheet (phase335); absent for a city with no page. */
	onShare?: () => void;
}

/**
 * `8 communities` — the card's ONE fact line (owner 2026-08-17: name, community
 * count, Explore, nothing else).
 *
 * The `N homes` half is gone with the vibe line: it counted active listings,
 * which is a number that moves week to week and says nothing about the city.
 * A city with no communities renders no line at all — never a placeholder.
 */
function communityLine(card: AreaCardV3): string | undefined {
	const { communityCount } = card.unit;
	if (communityCount <= 0) return undefined;
	return communityCount === 1 ? "1 community" : `${communityCount} communities`;
}

export function AreaFace({
	card,
	isTop,
	suspended,
	tapSlot,
	onExplore,
	onShare,
}: AreaFaceProps) {
	const { unit } = card;
	const saved = useSavedStore((s) => s.isSaved(card.id));
	const toggleSaved = useSavedStore((s) => s.toggle);
	const soundOn = useSoundStore((s) => s.soundOn);
	const toggleSound = useSoundStore((s) => s.toggle);

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
					suspended={suspended}
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

			{/* Top-right: the shared corner control, as on the listing and
			    community faces. This face drew its own save disc while it was
			    out of the deck; it is back with a narrated film (phase327), and
			    a film with a voice needs the mute the other two films have. A
			    city with no film passes no `sound` and gets the plain disc. */}
			<CardCorner
				{...(unit.videoUrl
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
					onPress: () => toggleSaved(card.id, "area"),
					...(tapSlot ? { onTouchStart: arm(SAVE_TAP_TARGET) } : {}),
				}}
				{...(onShare
					? {
							share: {
								onPress: onShare,
								...(tapSlot ? { onTouchStart: arm(SHARE_TAP_TARGET) } : {}),
							},
						}
					: {})}
			/>

			{/* Bottom scrim — transparent until ~55% down, then darkening to a
			    deep 0.92 at the bottom (owner 2026-08-19: 底部渐变 + 信息文字条,
			    same as the listing card). */}
			<LinearGradient
				colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.92)"]}
				locations={[0.55, 0.78, 1]}
				start={{ x: 0, y: 0 }}
				end={{ x: 0, y: 1 }}
				style={styles.scrim}
				pointerEvents="none"
			/>

			{/* Bottom-left info block — white, stepped hierarchy. */}

			<View style={styles.info}>
				{/* No `numberOfLines` — the owner's rule for this card is NO
				    truncated text anywhere, so a long name wraps to a second line
				    rather than ellipsizing. The block is bottom-anchored, so the
				    extra line grows UP into the scrim. */}
				<Text style={styles.name}>
					{unit.name}, {unit.state}
				</Text>
				{(() => {
					const stats = communityLine(card);
					return stats ? (
						<Text style={styles.stats} numberOfLines={1}>
							{stats}
						</Text>
					) : null;
				})()}
				{/* Bottom row — Explore on the right. The city stat bar that sat on
				    the left was `place-stats.ts` placeholder numbers and is gone
				    (phase129). */}
				<View style={styles.bottomRow}>
					{!!onExplore && (
						<View style={styles.ctaBottomRow}>
							<Pressable
								onTouchStart={arm(EXPLORE_TAP_TARGET)}
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
					)}
				</View>
			</View>
		</View>
	);
}

const OUTLINE_STROKE = 1.75;

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
	/**
	 * Bottom scrim — `overflow: hidden` on `face` clips it to the card's
	 * rounded corner. Over a `CardSurface` (no media) it reads as a deeper
	 * foot to that gradient; over a photo it is the text's readability layer.
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
	/** City name — largest, serif. 27/600 keeps long names on one line. */
	name: {
		...redlineText.place,
		fontSize: 27,
		lineHeight: 29,
		fontWeight: "600",
		color: "#FFFFFF",
	},
	/** Community count — the card's only fact line. */
	stats: {
		...redlineText.listingCard.specs,
		fontSize: 11,
		fontWeight: "500",
		color: "rgba(255,255,255,0.72)",
		marginTop: 3,
	},
	/** Bottom row — Explore, right-aligned. */
	bottomRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		marginTop: 10,
	},
	/** Explore column — right-aligned, takes the row's right third. */
	ctaBottomRow: {
		flex: 1,
		flexDirection: "row",
		justifyContent: "flex-end",
		alignItems: "center",
	},
	/** CTA link — text + arrow, no pill, no background. */
	ctaLink: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 6,
		minHeight: 32, // §0.5 touch floor
		paddingHorizontal: 2,
	},
	ctaLabel: {
		...redlineText.listingCard.cta,
		fontSize: 15,
		fontWeight: "500",
		color: "rgba(255,255,255,0.92)",
	},
	ctaPressed: { opacity: 0.7 },

	// ─── Outline icon art (see the components above) ──────────────────
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
