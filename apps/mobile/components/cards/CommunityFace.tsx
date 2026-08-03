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
/**
 * Tile glyph. 15, not the redline's 17: the tile is a single-line row now, not
 * an 84pt stack, and 17 crowded the label.
 *
 * `TILE_H_WITH_FACT` (96) is gone with the stacked tile — the sub-fact line does
 * not fit a 188pt panel next to a 44pt CTA (see the row budget in the component)
 * and now lives on the CTA's destination screen instead.
 */
const TILE_ICON = 15;
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

	return (
		<View style={styles.face}>
			{/*
			 * HERO — `HERO_RATIO`, the SAME constant `ListingFace` uses (owner,
			 * 2026-08-02: 「C 跟listing card 的视频大小保持一致」). Measured 61.80%
			 * against the listing card's 61.80% in the demo.
			 */}
			<View style={styles.hero}>
				{card.videoUrl ? (
					<CardVideo
						url={card.videoUrl}
						poster={card.heroUrl}
						isTop={isTop}
						/*
						 * `cover`, unconditionally. NOT the measured `frameAspect` path.
						 *
						 * The owner reported black bars four times; the video artifact was
						 * never the problem. `frameAspect` makes the fit a RUNTIME
						 * DECISION, and `mediaFit` returns `contain` for any source wider
						 * than the frame — which uncovers `CardVideo`'s blurred-poster
						 * backdrop, i.e. the "black gap". One stale `generated_videos` row
						 * was enough to bring it back, and `created_at desc` picks that
						 * row, not this component.
						 *
						 * ponytail: a landscape row served here is cropped, not
						 * letterboxed. Deliberate, FOR THIS FACE ONLY — `ListingFace` and
						 * `AreaFace` still letterbox landscape sources. The fix if it ever
						 * matters is re-rendering that row, not re-deriving the fit.
						 */
						fit="cover"
					/>
				) : (
					/*
					 * Same rule for the photo path. Only 1 of 8,679 communities has a
					 * video, so ~every community card renders through HERE — a
					 * video-only fix would have left the bars on all the others.
					 */
					<CardPhoto url={card.heroUrl} fit="cover" />
				)}
				{/*
				 * Scrim and pill live INSIDE the hero box. They used to be
				 * `absoluteFill` over the whole card, which would now darken the light
				 * panel too. Same tokens, same stop list — only the box changed.
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
				 * No heart (owner, 2026-08-02: 「去掉右上角的心」) — scoped to THIS face.
				 * Trade-off and insight keep theirs. `onSave` went with it: the feed
				 * never passed one, so the button had always been inert.
				 */}
			</View>

			{/*
			 * PANEL — the card's own light surface, so text legibility no longer
			 * depends on which video frame is playing (owner: 「现在文字和视频内容重叠
			 * 很乱 看不清楚」).
			 *
			 * MEASURED row budget, because the first attempt overflowed silently.
			 * The panel is 38.2% = 188pt on the smallest card, and
			 * name + 2-line blurb + 84pt tiles + 44pt CTA + gaps needs 254pt. Nothing
			 * errored: the CTA yielded and rendered at 16pt, 29pt BELOW the card.
			 *   name 26 + one-line tiles 38 + CTA 44 + 2 gaps + padding = 161pt
			 * So the tiles are single-line and the blurb does not ship here. The CTA
			 * is fixed-height with `marginTop: 'auto'` so it can never be the thing
			 * that shrinks, and it sits on the panel floor.
			 */}
			<View style={styles.panel}>
				<Text style={styles.name} numberOfLines={1}>
					{card.name}
				</Text>
				{hasTiles && (
					<View style={styles.tiles}>
						{reasons.map((r) => (
							<View key={r.label} style={styles.tile}>
								<RedlineIcon
									name={r.icon}
									size={TILE_ICON}
									color={redline.accent}
								/>
								{/*
								 * `numberOfLines={1}` and no sub-fact: the tiles are a
								 * single-line row now (see the budget above). The facts are
								 * not lost — they are the first thing the CTA's destination
								 * shows (`app/community/[slug].tsx`).
								 */}
								<Text style={styles.tileLabel} numberOfLines={1}>
									{r.label}
								</Text>
							</View>
						))}
						{dims.map((dim) => (
							<View key={dim} style={styles.tile}>
								<RedlineIcon
									name={DIM_ICON[dim]}
									size={TILE_ICON}
									color={redline.accent}
								/>
								<Text style={styles.tileLabel} numberOfLines={1}>
									{TILE_LABEL[dim].replace("\n", " ")}
								</Text>
							</View>
						))}
						{fallbackPills.map((p) => (
							<View key={p} style={styles.tile}>
								<Text style={styles.tileLabel} numberOfLines={1}>
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
							 * `solid`, not `light`: the CTA is on the light panel now, and a
							 * white pill on near-white is invisible.
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
	 * Hero + panel, matching `ListingFace` (owner 2026-08-02: 「C 跟listing card 的
	 * 视频大小保持一致」). Base fill is the redline's light `--card` because the panel
	 * is now the majority of what a viewer sees at rest.
	 */
	face: { flex: 1, backgroundColor: redline.card },
	/**
	 * `HERO_RATIO` — the same constant, not a copied number. Dark backing rather
	 * than `redline.card`: a near-white box flashes white for a frame on every
	 * card mount (same reason `ListingFace`'s media box is dark).
	 *
	 * Square bottom corners where the panel meets the media; the top two inherit
	 * the card radius via the parent's clip, exactly as `ListingFace.hero` does.
	 */
	hero: {
		flex: HERO_RATIO,
		backgroundColor: colors.cardPlainTo,
		overflow: "hidden",
	},
	pillSlot: { position: "absolute", top: 15, left: 15, zIndex: 3 },
	/**
	 * The content panel — the card's remaining 38.2%.
	 *
	 * Padding copied from `listingGeometry.panel` so the two faces agree. See the
	 * row-budget comment in the component: this panel is 188pt on the smallest
	 * card and every row here is sized against that, not chosen by eye.
	 */
	panel: {
		flex: 1 - HERO_RATIO,
		paddingHorizontal: 18,
		paddingTop: 14,
		paddingBottom: 15,
	},
	/** Serif place name. `place` (38) is the full-bleed size; 26 fits the panel. */
	name: {
		...redlineText.place,
		fontSize: 26,
		lineHeight: 28,
		color: redline.ink,
	},
	tiles: { flexDirection: "row", gap: 8, marginTop: 11 },
	/**
	 * SINGLE-LINE tiles: icon and label side by side, no sub-fact.
	 *
	 * The 84pt stacked tile does not fit a 188pt panel alongside a 44pt CTA — see
	 * the budget. `flexShrink: 1` lets a long label compress rather than push the
	 * row wider, which is what keeps the three-up row from wrapping.
	 */
	tile: {
		flex: 1,
		minWidth: 0,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 5,
		paddingVertical: 9,
		paddingHorizontal: 6,
		borderRadius: redlineRadii.tile,
		backgroundColor: redline.surface,
		borderWidth: 1,
		borderColor: redline.border,
	},
	tileLabel: {
		...redlineText.tile,
		color: redline.ink,
		flexShrink: 1,
	},
	/**
	 * `marginTop: 'auto'` pins the CTA to the panel FLOOR — owner: 「最底下还是要有
	 * 一个Why people love it按钮」. Without it the panel's spare space pooled below
	 * the button and it floated 46pt above the card's bottom edge (measured in the
	 * demo).
	 */
	ctaSlot: { marginTop: "auto" },
});
