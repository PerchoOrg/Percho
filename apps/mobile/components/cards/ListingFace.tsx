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
 *   hero image        54% of card height, full bleed, top corners = card radius
 *   content panel     46%, padding 18 / 18 / 20
 *     price           serif 35
 *     address         14 semibold, margin-top 8
 *     locality        12 muted, margin-top 4
 *     story           13 / 1.45, margin-top 15, #57534D
 *     chips           27pt tall, #F1F1EC, green line icons
 *     CTA             full-width 48pt pill, #0E6B57, "Explore Home →"
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
import { MatchBadge } from "../MatchBadge";
import {
	RedlineCta,
	RedlineHeart,
	RedlineIcon,
	type RedlineIconName,
	RedlinePill,
} from "./redline/RedlineChrome";

/** The redline's "Hero image: 54% of card height". */
const HERO_RATIO = 0.54;
/** "Chips ... Height 27px", icon 10pt to sit inside it. */
const CHIP_ICON = 10;
/** The redline shows three chips; a fourth would wrap and break the row. */
const MAX_CHIPS = 3;

/**
 * Which line icon stands for which preference dimension.
 *
 * The redline's sample chips are Top Schools / Private Backyard / Walkable Park,
 * which map onto three real `DimKey`s. Dims with no obvious glyph fall back to
 * the walk mark rather than rendering an empty chip — the LABEL is the content,
 * the icon is decoration.
 */
const DIM_ICON: Partial<Record<DimKey, RedlineIconName>> = {
	schools: "school",
	outdoors: "tree",
	trails: "tree",
	walkable: "walk",
	quiet: "family",
};

interface ListingFaceProps {
	card: ListingCardV3;
	stage: number;
	isTop: boolean;
	onExplore?: () => void;
	onSeeWhy?: () => void;
	/** Favourite. Optional — the heart renders inert when absent. */
	onSave?: () => void;
}

export function ListingFace({
	card,
	stage,
	isTop,
	onExplore,
	onSeeWhy,
	onSave,
}: ListingFaceProps) {
	const scoreShown = card.tease || card.preview ? undefined : card.matchScore;
	/** First paragraph only — the redline's story slot is two lines. */
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
				<View style={styles.heartSlot}>
					<RedlineHeart onPress={onSave} />
				</View>
				{/*
				 * The match badge keeps its §1.7 suppression for tease/preview cards.
				 * It sits BELOW the heart rather than replacing it, because the
				 * redline's top-right slot is the heart's.
				 */}
				{scoreShown !== undefined && (
					<View style={styles.badgeSlot}>
						<MatchBadge score={scoreShown} stage={stage} onSeeWhy={onSeeWhy} />
					</View>
				)}
				{/*
				 * The redline draws a "⊕ 18 Photos" counter here. `ListingCardV3`
				 * carries NO photo count — the feed DTO selects one `heroUrl`, not the
				 * gallery — so there is no number to print. Rendering "18" (the
				 * redline's sample value) would be a fabricated fact on a real
				 * listing, and deriving it would need a new server-side count.
				 * The pill is therefore absent, not faked. See the note in the reply
				 * to the owner: this is the one redline element with no data behind it.
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
									name={DIM_ICON[dim] ?? "walk"}
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
						<RedlineCta label="Explore Home →" onPress={onExplore} />
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
 */
const CHIP_LABEL: Record<DimKey, string> = {
	outdoors: "Outdoor Space",
	walkable: "Walkable",
	schools: "Top Schools",
	quiet: "Quiet Streets",
	hip: "Cultural Scene",
	entertaining: "Entertaining",
	trails: "Trails",
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
	pillSlot: { position: "absolute", top: 15, left: 15, zIndex: 2 },
	heartSlot: { position: "absolute", top: 15, right: 15, zIndex: 2 },
	badgeSlot: { position: "absolute", top: 60, right: 15, zIndex: 2 },
	panel: {
		flex: 1 - HERO_RATIO,
		paddingHorizontal: 18,
		paddingTop: 18,
		paddingBottom: 20,
	},
	price: { ...redlineText.price, color: redline.ink },
	address: { ...redlineText.address, color: redline.ink, marginTop: 8 },
	locality: { ...redlineText.locality, color: redline.ink3, marginTop: 4 },
	story: { ...redlineText.story, color: redline.inkStory, marginTop: 15 },
	/**
	 * `marginTop: auto` pins the chip row + CTA to the bottom of the panel, so a
	 * listing with a short description does not leave the CTA floating in the
	 * middle of the card.
	 */
	chips: {
		marginTop: "auto",
		flexDirection: "row",
		flexWrap: "nowrap",
		gap: 5,
	},
	chip: {
		height: 27,
		flexShrink: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 7,
		borderRadius: radii.pill,
		backgroundColor: redline.surface,
	},
	chipLabel: { ...redlineText.chip, color: redline.inkStory, flexShrink: 1 },
	ctaSlot: { marginTop: 14 },
});
