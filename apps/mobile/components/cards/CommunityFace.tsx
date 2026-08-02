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
	/*
	 * No `cardAspect`. It existed to derive the media fit from the measured
	 * track size, and that derivation is exactly what kept putting bars back on
	 * this face (see the `fit="cover"` comment below). This face is
	 * unconditionally full bleed, so there is nothing to derive and the prop is
	 * deleted rather than left dangling for someone to re-wire.
	 */
	/*
	 * No `onSave`. The heart went with the owner's 2026-08-02 redline
	 * (「去掉右上角的心」) and the feed never passed a handler for it, so the button
	 * had always been inert. Left absent rather than optional-and-dead.
	 */
}

export function CommunityFace({ card, isTop, onExplore }: CommunityFaceProps) {
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
			{card.videoUrl ? (
				<CardVideo
					url={card.videoUrl}
					poster={card.heroUrl}
					isTop={isTop}
					/*
					 * `cover`, unconditionally. NOT the measured `frameAspect` path.
					 *
					 * Owner has now reported this three times, the last one after the
					 * cover was re-rendered at the card's exact 2:3
					 * (「视频还是没有占据整个卡片」). The video artifact was never the
					 * problem — 1080x1620 with clean edges on every sampled frame. The
					 * CARD was, because `frameAspect` makes the fit a RUNTIME DECISION:
					 * `mediaFit` returns `contain` for any source wider than the frame,
					 * and `contain` on this face exposes `CardVideo`'s blurred-poster +
					 * 0.55 scrim backdrop — which IS the "black gap" being reported.
					 *
					 * Measured: with `frameAspect` supplied, the old 1080x1000 row
					 * (1.0800) and any legacy 1920x1080 row (1.7778) letterbox on EVERY
					 * device, because both are wider than the card's 0.6667. So as long
					 * as the fit is derived, one stale row anywhere in
					 * `generated_videos` puts the bars back — and `created_at desc`
					 * decides which row that is, not this component.
					 *
					 * 「full bleed 占据整个卡面」 is unconditional, so the fit is too. This
					 * is a deliberate override of the standing "landscape letterboxes"
					 * rule FOR THIS FACE ONLY: `ListingFace` and `AreaFace` are
					 * untouched and still letterbox landscape sources.
					 *
					 * ponytail: a landscape row served here will be cropped, not
					 * letterboxed. That is the owner's stated preference for this
					 * surface; the fix if it ever matters is re-rendering that row at
					 * 2:3, not re-deriving the fit.
					 */
					fit="cover"
				/>
			) : (
				/*
				 * Same full-bleed rule as the video. This is the path ~every community
				 * card actually takes — only 1 of 8,679 communities has a video — so a
				 * video-only fix would have left the bars on all the others.
				 */
				<CardPhoto url={card.heroUrl} fit="cover" />
			)}
			{/*
			 * Scrim darkened at BOTH ends (2026-08-02).
			 *
			 * The redline's three stops ramp one way — clear at 32%, dark at the
			 * foot — because all the copy used to sit at the foot. The name and
			 * blurb now sit at the TOP (owner: 「把底部的文字移到顶部避免重复」), so
			 * the top needs its own dark end or the serif name lands on open sky:
			 * measured 2.00:1 white-on-photo at the top of the real cover, i.e.
			 * already failing before the move.
			 *
			 * `communityScrim*` tokens are untouched — this is a stop LIST change,
			 * so the card's colours are still the redline's.
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
			 * No heart. Owner, 2026-08-02: 「去掉右上角的心」 — scoped to THIS face,
			 * exactly as the listing card's heart was removed on 2026-08-01. The
			 * trade-off and insight faces keep theirs; the redline drew it on all
			 * four and dropping it there is a design decision nobody has made.
			 *
			 * `onSave` went with it: the feed never passed one, so the button had
			 * always been inert. A dormant `onSave?: () => void` is a hook that
			 * gets "restored" by accident.
			 */}

			{/*
			 * TOP: who this is. The video below it is the neighbourhood itself, so
			 * the name and the prose no longer compete with the footage for the
			 * same corner of the card.
			 */}
			<View style={styles.head}>
				<Text style={styles.name}>{card.name}</Text>
				<Text style={styles.tagline} numberOfLines={2}>
					{card.blurb ?? `${card.city}, ${card.state}`}
				</Text>
			</View>

			{/* BOTTOM: why residents love it, then the way in. */}
			<View style={styles.body}>
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
									color={redline.onPhoto}
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
	/**
	 * The name + blurb, at the TOP.
	 *
	 * `top: 56` clears the 15pt-inset COMMUNITY pill rather than guessing: pill
	 * top 15 + its ~23pt box + 18 of air = 56. Absolutely positioned like the
	 * other chrome slots, so the `body` block below keeps its own `flex: 1`
	 * bottom alignment and neither has to know about the other.
	 *
	 * `right: 18` — the card's own padding. It was 64 to clear the heart's 44pt
	 * touch target; with the heart gone (2026-08-02) a long community name gets
	 * the full width back instead of wrapping early against nothing.
	 */
	head: {
		position: "absolute",
		top: 56,
		left: 18,
		right: 18,
		zIndex: 2,
	},
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
	/**
	 * The reason row's height when any tile carries a sub-fact.
	 *
	 * `gap` drops 9 → 6 because there are now up to three children instead of two,
	 * and two 9pt gaps plus three text runs overflowed 96. The icon-to-label
	 * relationship still reads at 6 — it is the same optical spacing the listing
	 * chip uses.
	 */
	tileTall: { height: TILE_H_WITH_FACT, gap: 6 },
	tileLabel: {
		...redlineText.tile,
		color: redline.onPhoto,
		textAlign: "center",
	},
	/**
	 * The factual sub-line under a reason.
	 *
	 * `nano` (9.5px) rather than a new token: it is the redline's existing
	 * smallest size and it is already what the insight card's caption uses, so no
	 * new type size enters the scale. White at 62% puts it a clear step below the
	 * label — the reason is the claim, the number is its footnote, and equal weight
	 * would make the tile read as two competing lines.
	 */
	tileFact: {
		...redlineText.nano,
		color: "rgba(255,255,255,0.62)",
		textAlign: "center",
	},
	ctaSlot: { marginTop: 12 },
});
