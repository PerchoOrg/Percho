import type { DimKey } from "@percho/shared";
/**
 * CommunityFace (§1.4) — the community (subdivision) front face.
 *
 * ── 2026-08-14 rebuild: same design system as the listing card ───────────────
 *
 * The owner's ask is parity: the community card and the listing card must be
 * the same width, the same total height, and — the part that kept slipping —
 * carry the SAME VIDEO HEIGHT. The old face split the card 61.8/38.2 with
 * `HERO_RATIO` and then capped the panel at 190pt, which meant the media got
 * "whatever 61.8% happens to be" while the listing card's media got "every
 * point the text block does not use". Those are not the same number on any
 * device.
 *
 * So this face now has `ListingFace`'s layout, not an approximation of it:
 *
 *   media   `flex: 1, minHeight: 0` + `mediaGeo` (12 top / 16 sides / r14)
 *   block   natural height, `geo.block` padding, target ≤ 190pt
 *
 * Both faces import the same `theme/listing-layout` data, so the media boxes
 * cannot drift. `HERO_RATIO` is no longer used here (it stays in
 * `theme/listing-geometry.ts` — other tests still assert it).
 *
 * ── The block's rows, mirroring the listing card ─────────────────────────────
 *
 *   1. name + "City, ST" on ONE baseline row      (listing: price + specs)
 *   2. up to 2-3 distinctive lifestyle signal pills (listing: the dim pills)
 *      hairline divider
 *   3. "Why people love it →", right-aligned link  (listing: "Explore home →")
 *
 * 2026-08-15 (owner): the authored blurb/description row is GONE — the card
 * shows no paragraph, and the text block is that much tighter. What replaced
 * it is the pill row's new content: not generic category words
 * (Restaurants / Walkability / Trees) but 2-3 distinctive lifestyle signals
 * ("Mature trees", "3 parks nearby", "Quiet streets") computed per community
 * by `apps/web/lib/feed/community-signals.ts` and sent over the wire as
 * `signals`. A community with no usable signal renders NO pill row — fewer
 * chips is the correct answer, never a placeholder.
 *
 * The old composition — 38pt white name over the video, a scrim carrying it,
 * and three 52pt glass tiles with a glyph and a statistic — is gone. The owner
 * asked for the listing card's compact chips in its place (「不要大的 glass
 * tile」), so the statistic sub-line has no home on this card any more: a chip
 * is one line of 10.5pt type. The facts are not lost — `app/community/[slug]`
 * renders every reason with its evidence, and that screen is where the CTA
 * goes.
 *
 * ── Data, not sample copy ────────────────────────────────────────────────────
 *
 * Three sources for the chip row, in descending confidence, exactly one of
 * which renders:
 *
 *   1. `reasons` — what residents said, verbatim (88.6% of communities)
 *   2. `dims`    — Percho's category labels, for the 9.4% with no reason
 *   3. `pills`   — authored strings
 *
 * Mixing them would put two registers of claim in one row with no way to tell
 * which words are the neighbours' and which are ours. A community with none of
 * the three renders NO chip row — fewer chips is the correct answer, never a
 * placeholder.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { CommunityCardV3 } from "../../lib/feed/card-types";
import type { TapSlot } from "../../lib/gesture/tap-slot";
import {
	DIVIDER_HEIGHT,
	MAX_TAGS,
	TAG_PILL_HEIGHT,
	textBlock as geo,
	media as mediaGeo,
} from "../../theme/listing-layout";
import { redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { EXPLORE_TAP_TARGET } from "./ListingFace";

/**
 * The card's ink scale — the same three steps as `ListingFace`'s local `INK`
 * (#181B18 / #535952 / #6E746F). Duplicated rather than imported because
 * `ListingFace` does not export it and this pass may not edit that file; the
 * values are the owner's 2026-08-14 scale, not new choices. If they ever move,
 * they move in both places.
 */
const INK = {
	/** Primary — the community name. */
	primary: "#181B18",
	/** Secondary — "City, ST" and the blurb. */
	secondary: "#535952",
} as const;

/**
 * Chip copy for the `dims` fallback. One line each — the old `TILE_LABEL`
 * carried "\n" because a 52pt glass tile wrapped its label over two lines; a
 * 21pt pill does not wrap.
 *
 * A full `Record`, not `Partial`: with a partial map an unmapped dim used to
 * fall through to a default and mislabel the chip. Deliberately NOT
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
 * The chip row's labels — `signals` first (the server's per-community
 * lifestyle signals), else reasons, else dims, else pills, at most `MAX_TAGS`.
 *
 * Label ONLY. The `signals` strings are already the specific phrasings the
 * owner asked for; a reason's `fact` ("33 restaurants") is real and is not
 * dropped from the product, but it does not fit a one-line 10.5pt pill and
 * there is no placeholder for the 57.2% of communities that resolve no fact.
 * The facts render on the community explore screen, which is where this card's
 * CTA goes.
 */
function chipLabels(card: CommunityCardV3): string[] {
	const signals = card.signals ?? [];
	if (signals.length > 0) return signals.slice(0, MAX_TAGS);
	const reasons = card.reasons ?? [];
	if (reasons.length > 0) return reasons.slice(0, MAX_TAGS).map((r) => r.label);
	const dims = card.dims ?? [];
	if (dims.length > 0) return dims.slice(0, MAX_TAGS).map((d) => CHIP_LABEL[d]);
	return (card.pills ?? []).slice(0, MAX_TAGS);
}

interface CommunityFaceProps {
	card: CommunityCardV3;
	isTop: boolean;
	onExplore?: () => void;
	/**
	 * The stack's tap slots (see `lib/gesture/tap-slot.ts`), same contract as
	 * `ListingFace`: the CTA writes its id into `tapSlot` on touch start and the
	 * pan's `onEnd` decides whether the release was a tap. A `Pressable` inside
	 * the pan gesture area silently stops firing (RNGH #3172), which is why the
	 * link cannot just use `onPress` in the feed. Absent outside the stack
	 * (dev-foundation), where `onExplore` runs through `onPress` instead.
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

	/** See `ListingFace.arm` — no gate here; the tap decision happens at release. */
	const arm = (target: string) => () => {
		if (!tapSlot) return;
		tapSlot.value = { target };
	};

	return (
		<View style={styles.face}>
			{/* Media — flex:1, the same box the listing card's media sits in */}
			<View style={styles.media}>
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
				<View style={styles.badgeSlot}>
					<View style={styles.badge}>
						<Text style={styles.badgeLabel}>COMMUNITY</Text>
					</View>
				</View>
			</View>

			{/* Text block — natural height, target ≤ 190pt (see the styles below) */}
			<View style={styles.block}>
				<View style={styles.row1}>
					<Text style={styles.name} numberOfLines={1}>
						{card.name}
					</Text>
					<Text style={styles.place} numberOfLines={1}>
						{`${card.city}, ${card.state}`}
					</Text>
				</View>
				{/* The blurb row is gone (owner, 2026-08-15) — the chips sit
				 * directly under row 1. `card.signals` is the server's
				 * per-community lifestyle signal row; absent → no row. */}
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
				{/* Hairline: separates the facts from the action, so it is gated on
				 * the CTA rather than on the chips. */}
				{!!onExplore && (
					<>
						<View style={styles.divider} />
						<View style={styles.ctaRow}>
							<Pressable
								onTouchStart={arm(EXPLORE_TAP_TARGET)}
								// In the feed the tap arrives via `tapSlot`; `onPress` is the
								// dev-foundation path, where there is no pan gesture to lose to.
								onPress={tapSlot ? undefined : onExplore}
								accessibilityRole="link"
								accessibilityLabel="Why people love it"
								hitSlop={12}
								style={({ pressed }) => [
									styles.exploreLink,
									pressed && styles.explorePressed,
								]}
							>
								<Text style={styles.exploreLabel}>Why people love it</Text>
								<ArrowRightIcon />
							</Pressable>
						</View>
					</>
				)}
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

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: redline.card },
	/**
	 * `flex: 1, minHeight: 0` — the media absorbs every point the text block
	 * does not use, which is the whole point of the rebuild: identical to
	 * `ListingFace.media`, spreading the same `mediaGeo`, so the two cards'
	 * videos are the same height on every device. `overflow: hidden` is what
	 * makes the 14pt radius clip the player and the scrim.
	 */
	media: { flex: 1, minHeight: 0, overflow: "hidden", ...mediaGeo },
	badgeSlot: { position: "absolute", top: 12, left: 12, zIndex: 2 },
	/** Frosted COMMUNITY badge — the listing card's badge, relabelled. */
	badge: {
		alignSelf: "flex-start",
		backgroundColor: "rgba(255,255,255,0.92)",
		borderRadius: redlineRadii.badge,
		paddingVertical: 5,
		paddingHorizontal: 11,
		overflow: "hidden",
	},
	/** Neutral ink, not green — green is reserved for interactive state. */
	badgeLabel: { ...redlineText.listingCard.badge, color: INK.primary },
	/**
	 * Text block — natural height. The ≤190pt budget, row by row (blurb row
	 * removed 2026-08-15, so the chips sit directly under row 1):
	 *
	 *   16 padTop + 22 name + 11 + 21 chip
	 *   + 12 + 1 divider + 2 + 44 CTA + 18 padBottom = 147 ≤ 190  ✓
	 *
	 * 28pt lighter than the listing card's 175 — all of it the two blurb lines
	 * that used to sit between the name and the chips. The media box grows by
	 * exactly that much, which is the point of the change.
	 */
	block: geo.block,
	/** Row 1 — name + "City, ST" on ONE baseline row (listing: price + specs). */
	row1: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "baseline",
		gap: 16,
	},
	/**
	 * Serif place name at 20/22. `redlineText.place` is 38 — that was the size
	 * for a name printed in white across the video; in the text block it is the
	 * card's anchor the way the listing's price is, at the size a 190pt block
	 * affords. `flexShrink` lets a long name yield to the locality rather than
	 * pushing it off the row.
	 */
	name: {
		...redlineText.place,
		fontSize: 20,
		lineHeight: 22,
		color: INK.primary,
		flexShrink: 1,
	},
	/** "Decatur, GA" — the listing card's specs slot, same 12.5/600. */
	place: {
		...redlineText.listingCard.specs,
		color: INK.secondary,
		flexShrink: 0,
	},
	/**
	 * The blurb style is gone with its row (2026-08-15). The chips now sit
	 * directly under row 1 via `geo.tags`' own margin — see the block comment.
	 */
	/** Chip row — `ListingFace`'s tag row: no icons, no wrap, no ellipsis. */
	chips: {
		flexDirection: "row",
		flexWrap: "nowrap",
		gap: 6,
		...geo.tags,
	},
	/** Radius 9 on #F4F2ED: light tinted rectangles, not capsule candy. */
	chip: {
		height: TAG_PILL_HEIGHT,
		paddingHorizontal: 9,
		borderRadius: 9,
		backgroundColor: "#F4F2ED",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 1,
	},
	chipLabel: { ...redlineText.listingCard.tag, color: "#3E4744" },
	divider: {
		height: DIVIDER_HEIGHT,
		backgroundColor: "rgba(24,27,24,0.08)",
		...geo.divider,
	},
	ctaRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
		alignItems: "center",
		...geo.ctaSlot,
	},
	exploreLink: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 44, // §0.5 touch floor
		paddingHorizontal: 4,
	},
	explorePressed: { opacity: 0.7 },
	exploreLabel: {
		...redlineText.listingCard.cta,
		color: redline.accent,
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
		backgroundColor: redline.accent,
	},
	arrowHead: {
		position: "absolute",
		left: (ARROW_SIZE - ARROW_HEAD) / 2,
		top: (ARROW_SIZE - ARROW_HEAD) / 2,
		width: ARROW_HEAD,
		height: ARROW_HEAD,
		borderTopWidth: OUTLINE_STROKE,
		borderRightWidth: OUTLINE_STROKE,
		borderColor: redline.accent,
		borderTopRightRadius: OUTLINE_STROKE,
		transform: [{ rotate: "45deg" }],
	},
});
