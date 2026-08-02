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
 * real card instead: `card.name` for the place, `card.blurb` for the subtitle,
 * and the community's own `dims` (falling back to its authored `pills`) mapped to
 * the three tiles.
 *
 * The subtitle used to print "City, ST" on a note here claiming
 * `CommunityCardV3` had no tagline field. It did not — but the API response
 * always carried one: `PoolCommunityDTO.blurb` (from `communities.description`,
 * authored prose, present on 12/12 live communities). The mobile card type simply
 * never declared it, so nothing parsed it. Clamped to the redline's two lines;
 * "City, ST" remains the fallback for a community with no prose, which is a real
 * fact rather than an invented lifestyle sentence.
 *
 * ── Video fills the card face (owner: 「视频宽度不够 没有占满card 有黑色空隙」) ──
 *
 * `CardVideo` now receives `frameAspect` (the card's real width/height) and
 * derives its fit from the video's MEASURED track size: a source narrower than
 * the card fills it, a source wider than the card still letterboxes rather than
 * cropping its width (the owner's older standing rule). The community cover is
 * 1080×1920 in a 2:3 card — narrower — so it fills. See `lib/media/fit.ts`.
 *
 * ── 2026-08-02: the tiles now carry resident REASONS (layout E) ──────────────
 *
 * Owner reviewed four full-bleed variants at `demo.percho.co/community-card` and
 * picked 「A的布局 + B的信息量」 — A's composition, B's information. The
 * composition below is therefore unchanged: name → blurb → ONE row of glass
 * tiles → white CTA. What changed is what a tile SAYS.
 *
 *   before   `dims` → TILE_LABEL → "Cultural Scene" · "Outdoor Space" · "Walkable"
 *   after    `reasons` → "Convenient" · "Dog Friendly" · "Safe", each with an
 *            optional factual sub-line ("35% owner-occupied")
 *
 * A dim label is Percho's name for a category, one abstraction away from anybody.
 * A reason is the word residents themselves left on Nextdoor, rendered verbatim —
 * which is what makes the card's own CTA ("Why people love it →") a promise the
 * tiles above it actually keep. Server side: `lib/feed/community-reasons.ts`.
 *
 * `dims` is NOT deleted. It is the fallback for the 9.4% of communities whose
 * attributes yield no reason, and `pills` remains the fallback after that. Three
 * sources, one row, in confidence order.
 *
 * The tile grew 84 → 96pt to seat a third text line. Nothing else moved; the
 * scrim, the name, the CTA and the 18pt padding are the redline's.
 */
import type { DimKey } from "@percho/shared";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import type { CommunityCardV3 } from "../../lib/feed/card-types";
import { HERO_RATIO } from "../../theme/listing-geometry";
import { colors, redline, redlineRadii } from "../../theme/tokens";
import { redlineText } from "../../theme/typography";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import {
	RedlineCta,
	RedlineIcon,
	type RedlineIconName,
	RedlinePill,
} from "./redline/RedlineChrome";

/** The redline's three lifestyle blocks. More would not fit the row. */
const MAX_TILES = 3;
/** "Icon 17px" inside an 84pt tile. */
const TILE_ICON = 17;
/**
 * Tile height with a sub-fact line present.
 *
 * The redline's tile is 84 for icon + one label. A reason tile can carry a third
 * line ("35% owner-occupied"), which needs 12 more points — measured, not
 * guessed: 17 icon + 6 + 13 label + 2 + 12 fact + 2×12 padding = 96.
 *
 * Applied per ROW, not per tile: `factRow` below is true when ANY of the three
 * has a fact, so all three grow together. Tiles of two different heights in one
 * row read as a layout bug, and only 42.8% of communities have a fact on even
 * one tile — so a mixed row is the COMMON case, not an edge case.
 */
const TILE_H_WITH_FACT = 96;
/**
 * The scrim's stops.
 *
 * The redline's own three (`0.32 / 0.48 / 1`) are the last three, unchanged —
 * that ramp still owns the foot where the tiles and CTA live. Two were prepended
 * for the top block (owner moved the name + blurb up, 2026-08-02):
 *
 *   0     dark   — behind the name
 *   0.18  fading — released by the time the blurb's second line ends
 *   0.32  clear  ← the redline's first stop, unmoved
 *
 * So the photo still breathes across its middle; both ends are just anchored.
 */
const SCRIM_STOPS = [0, 0.18, 0.32, 0.48, 1] as const;

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
	/**
	 * The card's REAL `width / height`, threaded to `CardVideo` so the video's
	 * fit is derived from its measured track size instead of pinned to
	 * `contain`.
	 *
	 * Owner, 2026-08-02: 「视频宽度不够 没有占满card 有黑色空隙」 — the 1080×1920
	 * cover is NARROWER than this 2:3 card, so `contain` pillarboxed it. See
	 * `lib/media/fit.ts`.
	 */
	cardAspect?: number;
	/*
	 * No `onSave`. The heart went with the owner's 2026-08-02 redline
	 * (「去掉右上角的心」) and the feed never passed a handler for it, so the button
	 * had always been inert. Left absent rather than optional-and-dead.
	 */
}

export function CommunityFace({
	card,
	isTop,
	onExplore,
	cardAspect,
}: CommunityFaceProps) {
	/**
	 * Three sources for the one tile row, in descending confidence:
	 *
	 *   1. `reasons` — what residents said, verbatim (88.6% of communities).
	 *   2. `dims`    — Percho's category labels, for the 9.4% whose attributes map
	 *                  to a dim but not to a whitelisted reason.
	 *   3. `pills`   — authored strings, label-only, no glyph.
	 *
	 * Exactly one path renders. Mixing a reason tile with a dim tile would put two
	 * different registers of claim in one row, and the reader has no way to tell
	 * which words are the neighbours' and which are ours.
	 */
	const reasons = (card.reasons ?? []).slice(0, MAX_TILES);
	const dims =
		reasons.length === 0 ? (card.dims ?? []).slice(0, MAX_TILES) : [];
	const fallbackPills =
		reasons.length === 0 && dims.length === 0
			? (card.pills ?? []).slice(0, MAX_TILES)
			: [];
	const hasTiles =
		reasons.length > 0 || dims.length > 0 || fallbackPills.length > 0;
	/**
	 * One height for the whole row — see `TILE_H_WITH_FACT`. A row where one tile
	 * has a sub-fact and two do not is the majority case (42.8% of communities
	 * resolve exactly one fact), so this is the normal path, not a guard.
	 */
	const factRow = reasons.some((r) => !!r.fact);

	return (
		<View style={styles.face}>
			<View style={styles.hero}>
				{card.videoUrl ? (
					<CardVideo
						url={card.videoUrl}
						poster={card.heroUrl}
						isTop={isTop}
						/*
						 * The HERO BOX's aspect, not the card's.
						 *
						 * The cover is rendered `1080x1000` = exactly `1 / (1.5 × 0.618)`
						 * (1.0800 vs 1.0787, 0.1% off), so it fills this box edge to edge
						 * with nothing cropped and nothing letterboxed. Owner, 2026-08-02:
						 * 「不要留模糊带 横图要截取完全占据视频区域 也就是卡片的0.618高度」.
						 */
						frameAspect={
							cardAspect == null ? undefined : cardAspect / HERO_RATIO
						}
						/*
						 * Fill from frame ONE, do not wait for a measurement.
						 *
						 * The owner reported black gaps twice, the second time after the
						 * measured fix shipped (「视频黑色空隙 还在!」). A measured fix fails
						 * silently: `availableVideoTracks` on an iOS HLS source only
						 * populates when the manifest exposes them, so the card can sit on
						 * the `contain` fallback indefinitely with nothing in any log.
						 *
						 * A measured size still overrides this, so a legacy row that is
						 * really 1920×1080 (2 of the 5 ready rows are, while the DB's
						 * `aspect_ratio` claims 9:16 for all five — that column is a lie,
						 * see `percho-video-pipeline`) self-corrects to letterboxed after
						 * a few hundred ms rather than staying cropped.
						 */
						unknownFit="cover"
					/>
				) : (
					<CardPhoto url={card.heroUrl} />
				)}
				{/*
				 * Scrim + chrome live INSIDE the hero box now.
				 *
				 * They used to be `absoluteFill` over the whole card because the media
				 * was full-bleed. The media is now the top 61.8% (owner: 「横图要截取完全
				 * 占据视频区域 也就是卡片的0.618高度」), so a card-sized scrim would darken
				 * the panel below it and the name would sit on solid colour rather than
				 * on footage. The stop LIST is unchanged — same tokens, same ramp, just
				 * measured against the box the copy actually sits in.
				 */}
				<LinearGradient
					colors={[
						redline.communityScrimTop,
						redline.communityScrimTopFade,
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
				{/*
				 * No heart. Owner, 2026-08-02: 「去掉右上角的心」 — scoped to THIS face.
				 * The trade-off and insight faces keep theirs; the redline drew it on
				 * all four and dropping it there is a decision nobody has made.
				 *
				 * `onSave` went with it: the feed never passed one, so the button had
				 * always been inert.
				 */}

				{/* Who this is, over the footage of the place itself. */}
				<View style={styles.head}>
					<Text style={styles.name}>{card.name}</Text>
					<Text style={styles.tagline} numberOfLines={2}>
						{card.blurb ?? `${card.city}, ${card.state}`}
					</Text>
				</View>
			</View>

			{/* Why residents love it, then the way in. */}
			<View style={styles.panel}>
				{hasTiles && (
					<View style={styles.tiles}>
						{reasons.map((r) => (
							<View
								key={r.label}
								style={[styles.tile, factRow && styles.tileTall]}
							>
								<RedlineIcon
									name={r.icon}
									size={TILE_ICON}
									color={redline.accent}
								/>
								{/*
								 * `numberOfLines={2}` not 1: "Well Maintained" and
								 * "Family Friendly" are two words at 10px in a third-of-a-card
								 * tile and WILL wrap. Truncating a resident's word to
								 * "Well Maintai…" is worse than a second line, and the tile
								 * has the height for it.
								 */}
								<Text style={styles.tileLabel} numberOfLines={2}>
									{r.label}
								</Text>
								{!!r.fact && (
									<Text style={styles.tileFact} numberOfLines={1}>
										{r.fact}
									</Text>
								)}
							</View>
						))}
						{dims.map((dim) => (
							<View key={dim} style={styles.tile}>
								<RedlineIcon
									name={DIM_ICON[dim]}
									size={TILE_ICON}
									color={redline.accent}
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
							/*
							 * `solid` now, not `light`: the CTA moved off the photo and onto
							 * the light panel, where a white pill on near-white is invisible.
							 * Same accent fill the listing card's CTA uses on the same panel.
							 */
							tone="solid"
						/>
					</View>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	/**
	 * The card is now hero + panel, like `ListingFace`, instead of one full-bleed
	 * photo (owner 2026-08-02: 「横图要截取完全占据视频区域 也就是卡片的0.618高度」).
	 * So the base fill is the redline's light `--card`: the panel is the majority
	 * of what a viewer sees at rest and it is a light surface.
	 */
	face: { flex: 1, backgroundColor: redline.card },
	/**
	 * The media box — HERO_RATIO of the card, the same constant `ListingFace`
	 * uses. The cover is rendered `1080x1000` to match it exactly, so nothing is
	 * cropped and there is no blur letterbox.
	 *
	 * Dark backing, not `redline.card`: a near-white box flashes white for a
	 * frame on every card mount (same reason `ListingFace`'s media box is dark).
	 */
	hero: {
		flex: HERO_RATIO,
		backgroundColor: colors.cardPlainTo,
		overflow: "hidden",
	},
	pillSlot: { position: "absolute", top: 15, left: 15, zIndex: 3 },
	/**
	 * The name + blurb, inside the hero box, over the footage.
	 *
	 * `top: 56` clears the 15pt-inset COMMUNITY pill rather than guessing: pill
	 * top 15 + its ~23pt box + 18 of air = 56. `right: 18` is the card's own
	 * padding — it was 64 to clear the heart's touch target, and the heart is
	 * gone.
	 */
	head: {
		position: "absolute",
		top: 56,
		left: 18,
		right: 18,
		zIndex: 2,
	},
	/**
	 * The content panel — the card's remaining 38.2%.
	 *
	 * Padding copied from `listingGeometry.panel` so the two faces agree; the
	 * panel only has to seat the tile row and the CTA (the name and blurb moved
	 * into the hero on 2026-08-02), so there is no `marginTop: auto` slack
	 * problem to split here.
	 */
	panel: {
		flex: 1 - HERO_RATIO,
		paddingHorizontal: 18,
		paddingTop: 14,
		paddingBottom: 15,
		justifyContent: "space-between",
	},
	name: { ...redlineText.place, color: redline.onPhoto },
	tagline: { ...redlineText.subtitle, color: redline.onPhotoDim, marginTop: 8 },
	tiles: { flexDirection: "row", gap: 8 },
	/**
	 * The tiles sit on the LIGHT panel now, not on the photo, so the glass fill
	 * and white type would be invisible. `surface` + `border` + `ink` is the same
	 * recipe the listing card's chips use on the same panel.
	 */
	tile: {
		flex: 1,
		height: 84,
		borderRadius: redlineRadii.tile,
		backgroundColor: redline.surface,
		borderWidth: 1,
		borderColor: redline.border,
		alignItems: "center",
		justifyContent: "center",
		gap: 9,
		paddingHorizontal: 4,
	},
	/**
	 * The reason row's height when any tile carries a sub-fact.
	 *
	 * `gap` drops 9 → 6 because there are three children instead of two, and two
	 * 9pt gaps plus three text runs overflowed 96.
	 */
	tileTall: { height: TILE_H_WITH_FACT, gap: 6 },
	tileLabel: {
		...redlineText.tile,
		color: redline.ink,
		textAlign: "center",
	},
	/**
	 * The factual sub-line under a reason.
	 *
	 * `nano` (9.5px) rather than a new type size, and `ink3` rather than `ink`:
	 * the reason is the claim and the number is its footnote, so equal weight
	 * would make the tile read as two competing lines.
	 */
	tileFact: {
		...redlineText.nano,
		color: redline.ink3,
		textAlign: "center",
	},
	ctaSlot: { marginTop: 12 },
});
