import type { DimKey } from "@percho/shared";
/**
 * CommunityFace (§1.4) — the community (subdivision) front face.
 *
 * ── 2026-08-16 redesign: immersive full-bleed, same as the CITY card ─────────
 *
 * The owner's ask: the community card becomes an EXPERIENCE card like
 * `AreaFace` — media fills the ENTIRE card, text sits on a bottom scrim, and
 * the white text block under the media is gone. Deliberately NOT
 * `ListingFace`'s layout (media + white block below).
 *
 *   · COMMUNITY pill top-left (kept — the frosted badge, relabelled).
 *   · bookmark disc top-right — the CITY card's translucent white disc +
 *     dark bookmark (owner: 保留 bookmark).
 *   · bottom scrim — `LinearGradient` transparent → rgba(0,0,0,0.5),
 *     exactly the CITY card's scrim (locations [0.55, 1]).
 *   · bottom info, 3 layers (24pt gutters):
 *       a. name (serif 24/600 white — same class as the CITY name)
 *       b. chips — up to TWO lifestyle signal pills (signals → reasons →
 *          dims → pills; no chip row when none exist). White-on-scrim pills.
 *          Three until 2026-08-17 — see `MAX_COMMUNITY_PILLS`.
 *       c. `Explore →` right-aligned (owner: CTA → "Explore →"; the old
 *          "Why people love it" text link is gone with the white block).
 *     No white bottom information container; no hairline; no place line —
 *     the subdivision's key info is the name + signals, on the photo.
 *
 * ── Data, not sample copy ────────────────────────────────────────────────────
 *
 * Three sources for the chip row, in descending confidence, exactly one of
 * which renders:
 *
 *   1. `signals` — the server's per-community lifestyle signals ("Mature
 *      trees", "3 parks nearby"), computed in `apps/web/lib/feed/community-
 *      signals.ts`
 *   2. `reasons` — what residents said, verbatim
 *   3. `dims`    — Percho's category labels, for the 9.4% with no reason
 *   4. `pills`   — authored strings
 *
 * Mixing them would put two registers of claim in one row. A community with
 * none of the four renders NO chip row — fewer chips is the correct answer,
 * never a placeholder.
 *
 * The facts are not lost — `app/community/[slug]` renders every reason with
 * its evidence, and that screen is where the CTA goes.
 */
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { CommunityCardV3 } from "../../lib/feed/card-types";
import { placeStats } from "../../lib/feed/place-stats";
import type { TapSlot } from "../../lib/gesture/tap-slot";
import { useSavedStore } from "../../state/saved";
import { redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { EXPLORE_TAP_TARGET, SAVE_TAP_TARGET } from "./ListingFace";
import { StatBar } from "./StatBar";

/**
 * Chip copy for the `dims` fallback. One line each — a 20pt white pill does
 * not wrap. A full `Record`, not `Partial`: with a partial map an unmapped
 * dim would fall through to a default and mislabel the chip. Deliberately NOT
 * `ListingFace`'s `CHIP_LABEL` — that one is written about a house
 * ("Private Backyard"), and a subdivision does not have one.
 */
const CHIP_LABEL: Record<DimKey, string> = {
	outdoors: "Outdoor Space",
	walkable: "Walkable",
	schools: "Great Schools",
	quiet: "Quiet Streets",
	hip: "Cultural Scene",
	entertaining: "Great for Hosting",
	trails: "Trails Nearby",
	nightlife: "Nightlife",
	family: "Family Friendly",
	move_in: "Move-in Ready",
	space: "Spacious",
};

/**
 * How many lifestyle pills the chip row seats. TWO (owner 2026-08-17, was 3):
 * the row shares one line with a 24pt name and the Explore link on a frame
 * that just lost ~6% of its height, and three pills at 10.5pt were the row
 * that made the block read as crowded.
 *
 * Local rather than imported: the listing card's tag pills were deleted in the
 * 2026-08-17: the tag pills and the hairline are gone from this card, and
 * `theme/listing-layout.ts` (the listing card's layout arithmetic) is gone
 * entirely — the 2026-08-18 full-bleed rebuild deleted the file.
 */
const MAX_COMMUNITY_PILLS = 2;

/** Chip pill height — vertical padding (×2) + the 10.5pt label. */
const PILL_HEIGHT = 21;

/**
 * The chip row's labels — `signals` first (the server's per-community
 * lifestyle signals), else reasons, else dims, else pills, at most
 * `MAX_COMMUNITY_PILLS`. See `chipLabels` below.
 */
function chipLabels(card: CommunityCardV3): string[] {
	const signals = card.signals ?? [];
	if (signals.length > 0) return signals.slice(0, MAX_COMMUNITY_PILLS);
	const reasons = card.reasons ?? [];
	if (reasons.length > 0)
		return reasons.slice(0, MAX_COMMUNITY_PILLS).map((r) => r.label);
	const dims = card.dims ?? [];
	if (dims.length > 0)
		return dims.slice(0, MAX_COMMUNITY_PILLS).map((d) => CHIP_LABEL[d]);
	return (card.pills ?? []).slice(0, MAX_COMMUNITY_PILLS);
}

interface CommunityFaceProps {
	card: CommunityCardV3;
	isTop: boolean;
	onExplore?: () => void;
	/**
	 * The stack's tap slots (see `lib/gesture/tap-slot.ts`), same contract as
	 * `ListingFace`: the CTA writes its id into `tapSlot` on touch start and
	 * the pan's `onEnd` decides whether the release was a tap. A `Pressable`
	 * inside the pan gesture area silently stops firing (RNGH #3172), which is
	 * why the link cannot just use `onPress` in the feed. Absent outside the
	 * stack (dev-foundation), where `onExplore` runs through `onPress` instead.
	 */
	tapSlot?: SharedValue<TapSlot>;
}

export function CommunityFace({
	card,
	isTop,
	onExplore,
	tapSlot,
}: CommunityFaceProps) {
	const chips = chipLabels(card);
	const saved = useSavedStore((s) => s.isSaved(card.id));
	const toggleSaved = useSavedStore((s) => s.toggle);

	/** See `ListingFace.arm` — no gate here; the tap decision happens at release. */
	const arm = (target: string) => () => {
		if (!tapSlot) return;
		tapSlot.value = { target };
	};

	return (
		<View style={styles.face}>
			{/* Media — fills the ENTIRE card (owner 2026-08-16: full-image style) */}
			{card.videoUrl ? (
				<CardVideo
					url={card.videoUrl}
					poster={card.heroUrl}
					isTop={isTop}
					/*
					 * `cover`, unconditionally. NOT the measured `frameAspect` path:
					 * that makes the fit a RUNTIME decision, and `mediaFit` returns
					 * `contain` for any source wider than the frame — which uncovers
					 * `CardVideo`'s blurred-poster backdrop, i.e. the "black gap" the
					 * owner reported four times. A landscape source is cropped here,
					 * deliberately; the fix if it ever matters is re-rendering that
					 * row, not re-deriving the fit.
					 */
					fit="cover"
				/>
			) : (
				/*
				 * Same rule for the photo path. Only 1 of 8,679 communities has a
				 * video, so ~every community card renders through HERE.
				 */
				<CardPhoto url={card.heroUrl} fit="cover" />
			)}

			{/* COMMUNITY pill — the frosted badge, kept (owner: 保留 label). */}
			<View style={styles.badgeSlot}>
				<View style={styles.badge}>
					<Text style={styles.badgeLabel}>COMMUNITY</Text>
				</View>
			</View>

			{/* Bookmark — the CITY card's translucent white disc + dark bookmark
			    (owner 2026-08-16: 保留 bookmark). Saved fills the body. */}
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

			{/* Bottom info — on the photo, stepped hierarchy (no white container). */}
			<View style={styles.info}>
				<Text style={styles.name} numberOfLines={1}>
					{card.name}
				</Text>
				{chips.length > 0 && (
					<View style={styles.chips}>
						{chips.map((label) => (
							<View key={label} style={styles.chip}>
								<Text style={styles.chipLabel} numberOfLines={1}>
									{label}
								</Text>
							</View>
						))}
					</View>
				)}
				{/* Bottom row — stat bar (left ~2/3) + Explore (right), the
				    listing card's divided-info layout (owner 2026-08-19). */}
				<View style={styles.bottomRow}>
					<StatBar cells={placeStats(card.id, "community")} />
					{!!onExplore && (
						<View style={styles.ctaRow}>
							<Pressable
								onTouchStart={arm(EXPLORE_TAP_TARGET)}
								onPress={tapSlot ? undefined : onExplore}
								accessibilityRole="link"
								accessibilityLabel={`Explore ${card.name}`}
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
 * The arrow after the CTA label — `ListingFace`'s art, at the same size and
 * colour, so the two cards' links are the same link.
 *
 * Copied rather than imported: `ListingFace` does not export it and this pass
 * may not edit that file. It cannot come from the icon font (the Phosphor
 * subset ships FILL weights only, which is what made the old arrow a thick
 * wedge) and `react-native-svg` red-screens in Expo Go on this project (DEVLOG
 * 2026-07-30 04:55), so it is composed from bordered `View`s on Lucide's own
 * 24-grid geometry: shaft (5,12)→(19,12), head corners (12,5)-(19,12)-(12,19),
 * i.e. a 45°-rotated square wearing only its top and right borders.
 */
const OUTLINE_STROKE = 1.75;
const ARROW_SIZE = 16;
const ARROW_K = ARROW_SIZE / 24;
/** Side of the rotated square whose top+right borders draw the arrowhead. */
const ARROW_HEAD = 7 * ARROW_K * Math.SQRT2;

function ArrowRightIcon() {
	return (
		<View style={styles.arrowBox}>
			<View style={styles.arrowShaft} />
			<View style={styles.arrowHead} />
		</View>
	);
}

/** The listing card's bookmark, recoloured dark like the CITY card's (saved
 * state fills the body). */
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
/** Same dark ink as the COMMUNITY pill label. */
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

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: redline.card, overflow: "hidden" },
	badgeSlot: { position: "absolute", top: 12, left: 12, zIndex: 2 },
	/** Frosted COMMUNITY badge — the listing card's badge, relabelled. */
	badge: {
		alignSelf: "flex-start",
		backgroundColor: "rgba(255,255,255,0.92)",
		borderRadius: redlineRadii.badge,
		paddingVertical: 7,
		paddingHorizontal: 10,
		overflow: "hidden",
	},
	/** Neutral ink, not green — green is reserved for interactive state. */
	badgeLabel: { ...redlineText.listingCard.badge, color: "#181B18" },
	saveSlot: { position: "absolute", top: 12, right: 12, zIndex: 2 },
	/** The CITY card's save disc: 40px translucent white, dark bookmark. */
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
	 * rounded corner. Same as the CITY card's.
	 */
	scrim: {
		...StyleSheet.absoluteFillObject,
		zIndex: 1,
	},
	info: {
		position: "absolute",
		left: 24,
		right: 24,
		bottom: 24,
		zIndex: 2,
	},
	/** Community name — serif 24/600 white, the CITY name's family. */
	name: {
		...redlineText.place,
		fontSize: 24,
		lineHeight: 26,
		fontWeight: "600",
		color: "#FFFFFF",
	},
	/** Chip row — white pills over the scrim. */
	chips: {
		flexDirection: "row",
		flexWrap: "nowrap",
		gap: 6,
		marginTop: 8,
	},
	/** Radius 9 on translucent white: light chips, not capsule candy. */
	chip: {
		height: PILL_HEIGHT,
		paddingHorizontal: 9,
		borderRadius: 9,
		backgroundColor: "rgba(255,255,255,0.22)",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 1,
	},
	chipLabel: {
		...redlineText.listingCard.tag,
		color: "rgba(255,255,255,0.92)",
	},
	/**
	 * Bottom row — stat bar (left ~2/3) + Explore (right), the listing card's
	 * divided-info layout (owner 2026-08-19).
	 */
	bottomRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		marginTop: 12,
	},
	/** Explore → row — right-aligned, bottom of the info block. */
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

	// ─── Arrow art (see the block above) ──────────────────────────────────
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
});
