/**
 * CommunityFace (§1.4) — the community (subdivision) front face, REBUILT to the
 * owner's "Percho Swipe Cards" redline (2026-07-30, 「全按redline覆盖」).
 *
 * ── What changed ─────────────────────────────────────────────────────────────
 *
 * Previously this face reused `CardFoot` (the shared dark gradient foot with
 * price / address / specs / pills). The redline gives the community card its own
 * composition, so `CardFoot` is no longer used HERE — it is still the foot for
 * other faces and is not deleted.
 *
 * The redline's structure, verbatim:
 *
 *   image        occupies the FULL card (not a 54% hero — this is the one
 *                image-led card of the four)
 *   scrim        180deg, transparent 32% → rgba(7,12,9,.18) 48% → .88 100%
 *   name         serif 38, white, line-height 1
 *   tagline      14 / 1.45, white 86%, margin-top 8
 *   three tiles  84pt tall, radius 18, rgba(255,255,255,.13), 1px .15 border,
 *                a centred 17pt line icon over a 10px label
 *   CTA          full-width 47pt WHITE pill with green text,
 *                "Why people love it →"
 *
 * ── Data, not sample copy ────────────────────────────────────────────────────
 *
 * The redline's mock card is Roswell / "Where quiet mornings meet vibrant
 * weekends." / Family Friendly · Walkable · Great Schools. This face renders the
 * real card instead: `card.name`, `card.city`/`state`, and the community's own
 * `dims` (falling back to its authored `pills`) mapped to the three tiles.
 *
 * There is no authored tagline field on `CommunityCardV3`, so the subtitle slot
 * shows the real "City, ST" line rather than an invented lifestyle sentence.
 * Writing "Where quiet mornings meet vibrant weekends" under an arbitrary
 * subdivision would be fabricated editorial copy about a real place.
 *
 * ── Video untouched (owner: 「视频部分不用改」) ──────────────────────────────
 *
 * `CardVideo` keeps its default `fit` (contain) exactly as before — this card
 * was always full-bleed, so the orientation logic that prop drives is unchanged.
 */
import type { DimKey } from "@percho/shared";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import type { CommunityCardV3 } from "../../lib/feed/card-types";
import { colors, redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import {
	RedlineCta,
	RedlineHeart,
	RedlineIcon,
	type RedlineIconName,
	RedlinePill,
} from "./redline/RedlineChrome";

/** The redline's three lifestyle blocks. More would not fit the row. */
const MAX_TILES = 3;
/** "Icon 17px" inside an 84pt tile. */
const TILE_ICON = 17;
/** The scrim's stops, from the redline's `linear-gradient(180deg, …)`. */
const SCRIM_STOPS = [0.32, 0.48, 1] as const;

/**
 * One glyph per dim — TOTAL, not partial.
 *
 * The community pool now sends real `dims` derived from the Nextdoor seed (see
 * `apps/web/lib/feed/community-highlights.ts`), and all 11 dims can arrive. When
 * this map was partial every unmapped dim fell through to a default `walk`
 * glyph, so a tile reading "Cultural Scene" showed a walking figure. Typing it
 * as a full `Record` makes an unmapped dim a compile error instead.
 *
 * `quiet` deliberately does NOT reuse the two-heads `family` art it used to
 * borrow: on a tile labelled "Quiet Streets" that glyph reads as "family".
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

/** Short, tile-sized labels. `DIMS[].label` is prose and wraps to 3 lines at 10px. */
const TILE_LABEL: Record<DimKey, string> = {
	outdoors: "Outdoor\nSpace",
	walkable: "Walkable",
	schools: "Great\nSchools",
	quiet: "Quiet\nStreets",
	hip: "Cultural\nScene",
	entertaining: "Great for\nHosting",
	trails: "Trails\nNearby",
	nightlife: "Nightlife",
	family: "Family\nFriendly",
	move_in: "Move-in\nReady",
	space: "Spacious",
};

interface CommunityFaceProps {
	card: CommunityCardV3;
	isTop: boolean;
	onExplore?: () => void;
	onSave?: () => void;
}

export function CommunityFace({
	card,
	isTop,
	onExplore,
	onSave,
}: CommunityFaceProps) {
	/**
	 * Prefer the community's real dims (which carry an icon); fall back to its
	 * authored pill strings, which have no dim key and so render label-only.
	 */
	const dims = (card.dims ?? []).slice(0, MAX_TILES);
	const fallbackPills =
		dims.length === 0 ? (card.pills ?? []).slice(0, MAX_TILES) : [];

	return (
		<View style={styles.face}>
			{card.videoUrl ? (
				<CardVideo url={card.videoUrl} poster={card.heroUrl} isTop={isTop} />
			) : (
				<CardPhoto url={card.heroUrl} />
			)}
			<LinearGradient
				colors={[
					redline.communityScrimFrom,
					redline.communityScrimMid,
					redline.communityScrimTo,
				]}
				locations={[...SCRIM_STOPS]}
				style={StyleSheet.absoluteFill}
				pointerEvents="none"
			/>
			<View style={styles.pillSlot}>
				<RedlinePill label="COMMUNITY" />
			</View>
			<View style={styles.heartSlot}>
				<RedlineHeart onPress={onSave} />
			</View>

			<View style={styles.body}>
				<Text style={styles.name}>{card.name}</Text>
				<Text style={styles.tagline}>
					{card.city}, {card.state}
				</Text>
				{(dims.length > 0 || fallbackPills.length > 0) && (
					<View style={styles.tiles}>
						{dims.map((dim) => (
							<View key={dim} style={styles.tile}>
								<RedlineIcon
									name={DIM_ICON[dim]}
									size={TILE_ICON}
									color={redline.onPhoto}
								/>
								<Text style={styles.tileLabel}>{TILE_LABEL[dim]}</Text>
							</View>
						))}
						{fallbackPills.map((p) => (
							<View key={p} style={styles.tile}>
								<Text style={styles.tileLabel} numberOfLines={3}>
									{p}
								</Text>
							</View>
						))}
					</View>
				)}
				{!!onExplore && (
					<View style={styles.ctaSlot}>
						<RedlineCta
							label="Why people love it →"
							onPress={onExplore}
							tone="light"
						/>
					</View>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	/**
	 * Base fill stays the dark `cardPlainTo` rather than the redline's light
	 * `--card`: this face is a full-bleed photo, and a near-white backing flashes
	 * white for a frame on every card mount (the reason `ListingFace`'s media box
	 * keeps a dark backing too).
	 */
	face: { flex: 1, backgroundColor: colors.cardPlainTo },
	pillSlot: { position: "absolute", top: 15, left: 15, zIndex: 3 },
	heartSlot: { position: "absolute", top: 15, right: 15, zIndex: 3 },
	/** Content sits at the bottom of the card, over the scrim's dark end. */
	body: {
		flex: 1,
		justifyContent: "flex-end",
		padding: 18,
		zIndex: 2,
	},
	name: { ...redlineText.place, color: redline.onPhoto },
	tagline: { ...redlineText.subtitle, color: redline.onPhotoDim, marginTop: 8 },
	tiles: { flexDirection: "row", gap: 8, marginTop: 16 },
	tile: {
		flex: 1,
		height: 84,
		borderRadius: redlineRadii.tile,
		backgroundColor: redline.glassTile,
		borderWidth: 1,
		borderColor: redline.glassTileBorder,
		alignItems: "center",
		justifyContent: "center",
		gap: 9,
		paddingHorizontal: 4,
	},
	tileLabel: {
		...redlineText.tile,
		color: redline.onPhoto,
		textAlign: "center",
	},
	ctaSlot: { marginTop: 12 },
});
