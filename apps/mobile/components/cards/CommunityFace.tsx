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
 * Tile glyph. 13, not the redline's 17.
 *
 * The tile is still the redline's STACK (glyph / label / statistic) — the owner
 * kept every row (「所有信息都需要保留 title description highlights with
 * statistics and button」) — but at 52pt rather than 84, because that is what a
 * 188pt panel affords alongside a 2-line description and a 44pt CTA. Everything
 * scaled together; nothing was dropped.
 */
const TILE_ICON = 13;
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
				{/*
				 * Description is BACK (owner, 2026-08-02: 「可以按比例缩小文字 但是所有
				 * 信息都需要保留 title description highlights with statistics and
				 * button」). It fits because the type scaled, not because a row went.
				 */}
				<Text style={styles.blurb} numberOfLines={2}>
					{card.blurb ?? `${card.city}, ${card.state}`}
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
								<Text style={styles.tileLabel} numberOfLines={1}>
									{r.label}
								</Text>
								{/*
								 * The STATISTIC, on its own line — owner: 「highlights with
								 * statistics」. Not every reason resolves one (only 42.8% of
								 * communities get a fact on even one tile), and an absent
								 * fact renders nothing rather than a placeholder.
								 */}
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
		paddingHorizontal: 14,
		paddingTop: 10,
		paddingBottom: 11,
		gap: 6,
	},
	/**
	 * Serif place name. `place` is 38 for the full-bleed face; 20/22 is what a
	 * 188pt panel affords once the description, the statistic line and a 44pt CTA
	 * all have to fit (owner: 「可以按比例缩小文字 但是所有信息都需要保留」).
	 */
	name: {
		...redlineText.place,
		fontSize: 20,
		lineHeight: 22,
		color: redline.ink,
	},
	/**
	 * Description at 11.5/13, down from `subtitle`'s 14/20. Two lines cost 26pt
	 * here against 40 at the token size — that 14pt is most of what paid for the
	 * statistic line below.
	 */
	blurb: {
		...redlineText.subtitle,
		fontSize: 11.5,
		lineHeight: 13,
		color: redline.ink2,
	},
	/**
	 * `flexGrow: 1` — the tile row absorbs the panel's spare height so it is not
	 * pooled into one gap above the CTA (see `ctaSlot`). On a taller phone the
	 * tiles get taller; on an SE there is 3.5pt to share and nothing moves.
	 */
	tiles: { flexDirection: "row", gap: 6, marginTop: 4, flexGrow: 1 },
	/**
	 * STACKED tile — glyph, label, statistic. 52pt, not the redline's 84: the
	 * scale-down is what let the statistic line survive inside a 188pt panel.
	 * `paddingVertical: 5` and `gap: 2` are the measured values, not taste.
	 */
	tile: {
		flex: 1,
		minWidth: 0,
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
		paddingVertical: 5,
		paddingHorizontal: 4,
		borderRadius: redlineRadii.tile,
		backgroundColor: redline.surface,
		borderWidth: 1,
		borderColor: redline.border,
	},
	/**
	 * `numberOfLines={1}` at 9.5/12. "Well Maintained" is the longest real label
	 * and measured 78pt in a 93pt box in the demo, so it fits without wrapping —
	 * and a second label line would cost 12pt the panel does not have.
	 */
	tileLabel: {
		...redlineText.tile,
		fontSize: 9.5,
		lineHeight: 12,
		color: redline.ink,
		textAlign: "center",
	},
	/**
	 * The statistic. 8.5/11, and `ink2` NOT `ink3`: measured 2.76:1 for ink3 on
	 * this tile fill in the demo, a WCAG AA fail at this size. ink2 is 4.67:1 and
	 * still reads a step below the label.
	 */
	tileFact: {
		...redlineText.nano,
		fontSize: 8.5,
		lineHeight: 11,
		color: redline.ink2,
		textAlign: "center",
	},
	/**
	 * The CTA sits on the panel floor, but WITHOUT `marginTop: 'auto'`.
	 *
	 * Owner, 2026-08-02: 「三个tile下方的空白太大了 卡片下方整体要协调」. `auto`
	 * pins the button down by dumping ALL of the panel's slack into this one gap —
	 * measured 3.5pt on an SE but **43.1pt on a 16 Pro Max**, because the panel
	 * grows with the card while the rows do not. That single pooled gap is the
	 * hole under the tiles.
	 *
	 * Instead the TILE ROW takes the slack (`flexGrow: 1` on `tiles`), so extra
	 * height goes into the thing that can use it and every gap stays at 6. The
	 * button still ends up flush against the bottom padding.
	 */
	ctaSlot: { flexShrink: 0 },
});
