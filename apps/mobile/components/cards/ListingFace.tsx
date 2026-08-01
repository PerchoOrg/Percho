import type { DimKey } from "@percho/shared";
/**
 * ListingFace (§1.4) — the listing front face, REBUILT to the owner's
 * "Percho Swipe Cards" redline (2026-07-30, 「全按redline覆盖」).
 *
 * ── What this replaced, and why it is gone ───────────────────────────────────
 *
 * The previous face was demo variant "C" (picked 2026-07-30 earlier the same
 * day): a 1:1 inline media block, a left info column, and a right column with a
 * circular locality map + the four-dimension neighborhood score ring, all in
 * amber. The redline specifies a different card and the owner chose it
 * explicitly over keeping C's layout, so:
 *
 *   · the circular `CardMap` is gone from this face — the redline says
 *     "Do not add maps";
 *   · the `NeighborhoodScore` ring is gone — "Do not add score bars", and its
 *     four dimensions are not in the redline's content list;
 *   · amber is gone — "Forest green is the only accent".
 *
 * `CardMap` and `NeighborhoodScore` are NOT deleted: both are still reachable
 * from the listing detail page / nearby view, and deleting a working component
 * because one caller stopped using it is out of scope for a card redesign.
 *
 * ── The redline's structure, verbatim ────────────────────────────────────────
 *
 *   hero image        61.8% of card height, full bleed, top corners = card radius
 *     LISTING pill    top-left 15/15
 *     heart           top-right 15/15
 *   content panel     38.2%, padding 18 / 14 / 15
 *     price           serif 27
 *     address         14 semibold, margin-top 6
 *     locality        12 muted, margin-top 3
 *     story           13 / 1.45, margin-top 11, #57534D, up to 2 lines
 *     chips           21pt tall, #F1F1EC, green line icons
 *     CTA             full-width 44pt pill, #0E6B57, "Explore Home →"
 *
 * The hero was 54% and the panel's type was larger in the redline; the owner
 * raised the hero to the golden ratio on 2026-08-01 (「视频占卡片比例改成0.618」)
 * and the panel's metrics are that same redline scaled by `PANEL_SCALE`. Read
 * `theme/listing-geometry.ts` before changing any of these — the numbers are
 * derived from a measured device-fit table, not picked to look right.
 *
 * Those two overlays are the ONLY things on the hero. The redline also drew a
 * bottom-left "⊕ 18 Photos" counter; it was removed 2026-08-01 on the owner's
 * immersion call ("不够沉浸") along with all burned-in video captions. Photos and
 * their captions now live behind the CTA, in Explore. The match-score badge that
 * used to sit at top-right/60 was ours, never the redline's, and is also gone —
 * the score still reaches the buyer on the detail screen.
 *
 * ── Video is untouched (owner: 「视频部分不用改」) ───────────────────────────
 *
 * `CardVideo` still receives `fit="cover"`, still keys off `isTop`, and the
 * square-render reasoning behind that prop is unchanged — the only difference is
 * the box it sits in is now 54% of the card rather than 1:1. A 1080x1080 render
 * in a 270x302-shaped box crops the sides rather than letterboxing, which is
 * what `cover` is for and what the redline's "full bleed / object-fit: cover"
 * asks for by name.
 *
 * ── What is NOT invented ────────────────────────────────────────────────────
 *
 * The redline's mock text ("Modern family home with…", "18 Photos", the three
 * chips) is SAMPLE copy. This face renders the card's real fields:
 * `description[0]` for the story, `photoCount` for the counter, `dims` mapped
 * through the shared `DIMS` vocabulary for the chips. A listing with no
 * description renders no story line; a listing with no dims renders no chips.
 * Nothing on this card is generated to fill the redline's shape.
 */
import { StyleSheet, Text, View } from "react-native";
import type { ListingCardV3 } from "../../lib/feed/card-types";
import { radii, redline } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import {
	RedlineCta,
	RedlineIcon,
	type RedlineIconName,
	RedlinePill,
} from "./redline/RedlineChrome";

/**
 * Geometry lives in `theme/listing-geometry.ts` as plain data so
 * `theme/redline-listing-geometry.test.ts` can assert it without importing
 * react-native. Read that file for the redline quotes behind each number, and for
 * why they must not be re-derived from the prototype HTML.
 */
import {
	CHIP_ICON,
	HERO_RATIO,
	MAX_CHIPS,
	listingGeometry as geo,
} from "../../theme/listing-geometry";

/**
 * Which line icon stands for which preference dimension.
 *
 * A full `Record`, not `Partial` — the community card had exactly this bug: with
 * a partial map plus a `?? "walk"` fallback, every unmapped dim silently drew a
 * walking figure, so a chip reading "Move-in Ready" showed a pedestrian. Typing
 * it as a complete `Record` makes an unmapped dim a compile error instead.
 *
 * Kept identical to `CommunityFace`'s map on purpose: the same dim must not have
 * one glyph on a listing card and a different one on a community card two swipes
 * later. `quiet` therefore uses `moon`, not the two-heads `family` art it used to
 * borrow (which read as "family" under the label "Quiet Streets").
 */
const DIM_ICON: Record<DimKey, RedlineIconName> = {
	family: "family",
	walkable: "walk",
	schools: "school",
	outdoors: "tree",
	trails: "path",
	quiet: "moon",
	hip: "shop",
	entertaining: "cup",
	move_in: "check",
	space: "expand",
	nightlife: "cup",
};

interface ListingFaceProps {
	card: ListingCardV3;
	isTop: boolean;
	onExplore?: () => void;
	/*
	 * No `onSave`. The heart that consumed it was removed 2026-08-01 (owner:
	 * 「去掉右上角的爱心标志」) and the feed never passed a handler, so keeping the
	 * prop would leave an argument no element can reach — the kind of dormant
	 * hook that gets "restored" by accident later.
	 */
}

export function ListingFace({ card, isTop, onExplore }: ListingFaceProps) {
	/** First paragraph only — the panel's story slot is at most two lines. */
	const story = card.description?.[0];
	const chips = (card.dims ?? []).slice(0, MAX_CHIPS);

	return (
		<View style={styles.face}>
			{/* Hero — 54%, full bleed */}
			<View style={styles.hero}>
				{card.videoUrl ? (
					<CardVideo
						url={card.videoUrl}
						poster={card.heroUrl}
						isTop={isTop}
						fit="cover"
					/>
				) : (
					<CardPhoto url={card.heroUrl} />
				)}
				<View style={styles.pillSlot}>
					<RedlinePill label="LISTING" />
				</View>
				{/*
				 * The hero carries exactly ONE overlay now: the LISTING pill.
				 *
				 * The heart went 2026-08-01 (owner: 「去掉右上角的爱心标志」). It had
				 * always been inert on this face — the feed never passed `onSave` —
				 * so removing it costs no working behaviour, and the top-right
				 * corner of the video is now clean.
				 *
				 * The redline's third — a bottom-left "⊕ 18 Photos" counter — was
				 * removed 2026-08-01. The owner's reason is immersion: the video
				 * fills this box, and a chrome pill sitting on top of moving
				 * footage announces "this is a UI element with N assets behind it"
				 * at exactly the moment the card is trying to be a window into a
				 * house. The count was also the weakest thing the pixel could say
				 * — it is a number about the LISTING PAGE, not about the home.
				 *
				 * The information is not lost: Explore now opens on the full photo
				 * gallery (including every photo the video's 8-14 clips skipped),
				 * where the count is implicit in the strip and each photo carries
				 * its caption. `photoCount` stays on the DTO for that screen.
				 *
				 * The match badge that once sat at top-right/60 was never a
				 * redline element and is likewise gone.
				 */}
			</View>

			{/* Content panel — 46% */}
			<View style={styles.panel}>
				<Text style={styles.price}>{card.priceLabel}</Text>
				{!!card.address && (
					<Text style={styles.address} numberOfLines={1}>
						{card.address}
					</Text>
				)}
				{!!card.locality && (
					<Text style={styles.locality} numberOfLines={1}>
						{card.locality}
					</Text>
				)}
				{/*
				 * Two lines where they fit, one where they don't.
				 *
				 * Restored 2026-08-01 (owner: 「可以把底下的两行描述加回来吗」) once the
				 * hero settled at 0.618. `flexShrink: 1` on the style is the load-
				 * bearing part, not decoration: the panel is 188pt on a 375×667 SE and
				 * two lines need 202, so without the shrink the overflow would push
				 * the CTA off the bottom edge (`chips` is `marginTop: auto`). With it,
				 * the story is the thing that yields a line and the CTA never moves.
				 *
				 * See `PANEL_SCALE` for which devices get two lines (390pt-wide and up)
				 * and which get one (SE / 13 mini).
				 */}
				{!!story && (
					<Text style={styles.story} numberOfLines={2}>
						{story}
					</Text>
				)}
				{chips.length > 0 && (
					<View style={styles.chips}>
						{chips.map((dim) => (
							<View key={dim} style={styles.chip}>
								<RedlineIcon
									name={DIM_ICON[dim]}
									size={CHIP_ICON}
									color={redline.accent}
								/>
								<Text style={styles.chipLabel} numberOfLines={1}>
									{CHIP_LABEL[dim]}
								</Text>
							</View>
						))}
					</View>
				)}
				{!!onExplore && (
					<View style={styles.ctaSlot}>
						<RedlineCta label="Explore Home →" onPress={onExplore} compact />
					</View>
				)}
			</View>
		</View>
	);
}

/**
 * Chip copy. `DIMS[dim].label` is written for prose ("outdoor space", "top
 * schools") and reads wrong in Title Case inside a 27pt chip, which the redline
 * sets in Title Case ("Top Schools"). These are the same dims, capitalised for
 * the chip — not new claims about the listing.
 *
 * The redline's three sample chips are Top Schools / Private Backyard / Walkable
 * Park. The first two are printed as-is because a dim backs each exactly
 * (`outdoors` requires the copy to describe a private/fenced/level yard). The
 * third is NOT: no dim establishes that a park is the thing within walking
 * distance, so `walkable` stays "Walkable" and `trails` says "Trails Nearby",
 * which is what the greenway/walking-trail phrasing actually supports. Sample
 * copy is a layout reference, not a claim we may print verbatim.
 */
const CHIP_LABEL: Record<DimKey, string> = {
	outdoors: "Private Backyard",
	walkable: "Walkable",
	schools: "Top Schools",
	quiet: "Quiet Streets",
	hip: "Cultural Scene",
	entertaining: "Great for Hosting",
	trails: "Trails Nearby",
	nightlife: "Nightlife",
	family: "Family Friendly",
	move_in: "Move-in Ready",
	space: "Spacious",
};

const styles = StyleSheet.create({
	/** `--card` (#FFFDF9), not the old `scoreTokens.face`. */
	face: { flex: 1, backgroundColor: redline.card },
	/**
	 * `flex` rather than a percentage height: the two children then split the
	 * card 54/46 at any device height with no measurement, and the panel's
	 * `flex: 1` absorbs the rounding so the CTA never gets pushed off the bottom
	 * edge (the exact overflow that had to be fixed twice on the HTML board).
	 */
	hero: {
		flex: HERO_RATIO,
		overflow: "hidden",
		// The top corners inherit the card radius via the parent's clip; the
		// bottom two must stay square where the panel meets the photo.
		borderTopLeftRadius: radii.card - 1,
		borderTopRightRadius: radii.card - 1,
	},
	pillSlot: { position: "absolute", ...geo.pillSlot, zIndex: 2 },
	panel: geo.panel,
	/**
	 * `marginTop: 'auto'` here is a SPACING fix, not decoration (owner
	 * 2026-08-01: 「描述和几个特点之间的空白明显比其他空白大」).
	 *
	 * The panel is a proportional slice of the card (38.2%), so on most devices
	 * it is a few points TALLER than its content needs. All of that slack used to
	 * land in one place — `chips`'s `marginTop: 'auto'` was the only auto margin
	 * in the column, so it collected 100% of it and the story→chips gap measured
	 * ~37pt against 8pt everywhere else. The reference board's rhythm is the
	 * opposite: the largest gap sits at the TOP of the panel and the steps get
	 * smaller downward, with the two section breaks (story→chips, chips→CTA)
	 * equal.
	 *
	 * Two auto margins split the free space equally (Yoga, like CSS flexbox), so
	 * half the slack now goes above the price — where it reads as panel padding
	 * under the photo — and half above the chips. Under pressure both resolve to
	 * 0 and the story's `flexShrink` still yields the line, so the CTA cannot be
	 * pushed off the card and the fit floor is unchanged.
	 */
	price: { ...redlineText.priceCompact, color: redline.ink, marginTop: "auto" },
	address: { ...redlineText.address, color: redline.ink, ...geo.address },
	locality: { ...redlineText.locality, color: redline.ink3, ...geo.locality },
	/**
	 * `flexShrink: 1` is what protects the CTA. Two lines need 202pt of a panel
	 * that is only 188pt on a 375×667 iPhone SE; letting THIS element yield a
	 * line is what keeps the overflow from travelling down to the CTA through
	 * `chips`'s `marginTop: auto`. Do not remove it to "fix" the story being
	 * short on small phones — that trades a shorter blurb for a clipped button.
	 */
	story: { ...redlineText.storyCompact, ...geo.story, flexShrink: 1 },
	/**
	 * `marginTop: auto` pins the chip row + CTA to the bottom of the panel, so a
	 * listing with a short description does not leave the CTA floating in the
	 * middle of the card.
	 */
	chips: {
		marginTop: "auto",
		flexDirection: "row",
		flexWrap: "nowrap",
		...geo.chips,
	},
	chip: {
		...geo.chip,
		// Shrinkable, deliberately: at 9.5px with 3 chips on a 270pt card the row
		// is near capacity, and "Private Backyard" is the widest redline label.
		// Letting the chip shrink keeps all three on ONE row (the redline's
		// nowrap) instead of pushing the third out.
		flexShrink: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 7,
		borderRadius: radii.pill,
		backgroundColor: redline.surface,
	},
	chipLabel: { ...redlineText.chip, color: redline.inkStory, flexShrink: 1 },
	ctaSlot: geo.ctaSlot,
});
