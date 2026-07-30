/**
 * ListingFace (§1.4) — the listing front face.
 *
 * ── 2026-07-28 structure change (owner-directed) ─────────────────────────────
 *
 * Three parts, top to bottom, replacing the old full-bleed media + overlaid foot:
 *
 *   1. a 1:1 INLINE video/photo block (not full-bleed),
 *   2. bottom-left: price / address / specs / pills,
 *   3. bottom-right: a locality map thumbnail.
 *
 * Why inline-square instead of filling the card:
 *
 *   FMLS source photos are 1024x686. Filling a 393x852 card (1179x2556 physical)
 *   needs a 2.80x upscale — that is the "占满整个card 像素很差" the owner reported,
 *   and it is arithmetic, not a rendering bug. A 1:1 block at card width is
 *   1035x1035 physical → 1.57x, the least-upscaling shape available. The video is
 *   RENDERED 1080x1080 (see supabase migration 20260728090000 + the render
 *   worker's square variant), so on-device it is a 1:1 source in a 1:1 box:
 *   nothing cropped, nothing stretched, no letterbox.
 *
 *   Ken Burns motion is baked into the render, not animated here. The renderer
 *   pans left/right only, which preserves 100% of each source photo's HEIGHT —
 *   the owner's explicit constraint ("如果pan 视频能不能保持原本照片的高度 只做
 *   左右剪裁"). A client-side transform would have to crop to move.
 *
 * The old design put price/address in `CardFoot`, an absolutely-positioned
 * gradient over the media. With the media no longer full-bleed there is nothing
 * to overlay, so the text sits on the card surface and `CardFoot` is not used
 * here anymore (it is still used by other faces).
 *
 * `MatchBadge` self-gates to `stage === 4 && score >= 60`, so `stage` is passed
 * straight through and NO extra gating is added here — with one exception the
 * spec requires: a tease (Stage 1–2) or preview (Stage 3) listing must not show
 * a score at all (§1.7 "match badge 不显"), so the badge is not rendered for
 * those. That is suppression of an untrustworthy number, not a second copy of
 * the stage rule.
 *
 * ── 2026-07-30 info-block change (owner picked demo variant "C") ─────────────
 *
 * The bottom half is unchanged in LAYOUT — media on top, info left, map right,
 * because the owner's words were 「这个格局不错」 and the previous attempt to
 * restructure it was reverted. Only the contents of the left column and the
 * shape of the right one changed:
 *
 *   · the dim pills are gone, replaced by the four-dimension neighborhood score
 *     panel (Safety / Schools / Convenience / Potential);
 *   · city+beds+baths+sqft collapse into ONE line, and $/sqft is removed —
 *     both explicit owner instructions ("房子的信息可以简单点 不要每平米的价格");
 *   · the map is a CIRCLE inside a fixed-width slot, with Explore directly
 *     beneath it, so the right column reads as one unit and the dead space the
 *     owner flagged under the CTA is gone.
 *
 * MAP_SLOT vs the circle's own diameter matters: the slot is what reserves the
 * column, so shrinking the circle (150 → 132) leaves the column width — and
 * therefore the circle's CENTRE — exactly where it was. That was a literal
 * requirement: 「地图稍微小一点 圆心不动」.
 *
 * ── The face is LIGHT, and that was the whole point of variant C ──────────────
 *
 * First pass got this wrong: the geometry of C was transcribed onto the old dark
 * `cardPlainTo` face with white text, and the owner's verdict was 「你完全没有
 * 按照我们选定的方案C实现」. Correct — C's defining property is not the ring, it
 * is 「纯白 + 浅灰为基底，柔和渐变与微阴影，色彩克制，仅用点缀色突出核心操作」.
 * So:
 *
 *   · the info area sits on `scoreTokens.face` (#FFFDFB), not a brown panel;
 *   · text is ink on light (`scoreTokens.ink` / `ink2` / `ink3`), never white;
 *   · the ONE accent (amber) is spent on the ring arc, the map pin and the
 *     Explore fill — "仅用点缀色突出核心操作";
 *   · Explore is a solid amber pill with white text, matching the demo's `.go`;
 *     the old translucent `glass` pill was invisible on a white card.
 *
 * The media block keeps its dark backing (`cardPlainTo`) — that is behind a
 * photo or video, so it is never seen; a white backing would flash white on
 * every card mount.
 */
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import type { ListingCardV3 } from "../../lib/feed/card-types";
import { colors, radii, scoreTokens } from "../../theme/tokens";
import { priceStyle, textStyles } from "../../theme/typography";
import { CardMap } from "../CardMap";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { ExploreButton } from "../ExploreButton";
import { KindChip } from "../KindChip";
import { MatchBadge } from "../MatchBadge";
import { NeighborhoodScore } from "../NeighborhoodScore";

/**
 * Width of the right-hand column. The map circle is smaller than this (see
 * `CardMap`'s default) and centres inside it, which is what keeps the circle's
 * centre fixed when its diameter changes.
 */
const MAP_SLOT = 150;

interface ListingFaceProps {
	card: ListingCardV3;
	stage: number;
	isTop: boolean;
	onExplore?: () => void;
	/**
	 * Handler for the FOMO badge's "See why →". Used to flip to the data face;
	 * the flip is gone (2026-07-30) and the feed passes nothing, so the badge
	 * renders as a plain label until a new destination exists.
	 */
	onSeeWhy?: () => void;
}

export function ListingFace({
	card,
	stage,
	isTop,
	onExplore,
	onSeeWhy,
}: ListingFaceProps) {
	const scoreShown = card.tease || card.preview ? undefined : card.matchScore;
	/**
	 * "Peachtree Corners, GA · 4 bd · 4 ba · 3,302 sqft" — locality and specs on
	 * one line. Both halves are optional, and the separator only appears when
	 * both exist, so a listing missing either never renders a dangling "·".
	 */
	const specLine = [card.locality, card.bedBathSqft]
		.filter((s): s is string => !!s && s.trim().length > 0)
		.join(" · ");

	return (
		<View style={styles.face}>
			{/* 1 — inline square media block */}
			<View style={styles.media}>
				{card.videoUrl ? (
					<CardVideo
						url={card.videoUrl}
						poster={card.heroUrl}
						isTop={isTop}
						// The square render matches this box exactly; see CardVideo's `fit`.
						fit="cover"
					/>
				) : (
					<CardPhoto url={card.heroUrl} />
				)}
				<View style={styles.head}>
					<KindChip label="LISTING" />
				</View>
				{scoreShown !== undefined && (
					<View style={styles.badge}>
						<MatchBadge score={scoreShown} stage={stage} onSeeWhy={onSeeWhy} />
					</View>
				)}
			</View>

			{/* 2 + 3 — info left, map right */}
			<View style={styles.info}>
				<View style={styles.infoText}>
					<Text style={styles.price}>{card.priceLabel}</Text>
					{!!card.address && (
						<Text style={styles.address} numberOfLines={1}>
							{card.address}
						</Text>
					)}
					{/*
					 * One spec line, not two (2026-07-30). "City, ST · 4 bd · 4 ba ·
					 * 3,302 sqft" reads as a single fact about the house; splitting it
					 * cost ~22pt of card height that the photo needs, and the owner's
					 * instruction was to SIMPLIFY the property info. No $/sqft — he
					 * explicitly cut it.
					 */}
					{!!specLine && (
						<Text style={styles.specs} numberOfLines={1}>
							{specLine}
						</Text>
					)}
					{/*
					 * The score panel replaces the dim pills. Pills restated match dims
					 * the badge already covers; the four scores are new information.
					 * Suppressed for tease/preview listings for the same reason the match
					 * badge is (§1.7): pre-stage-4 we don't stand behind the numbers.
					 */}
					{!!card.scores && !card.tease && !card.preview && (
						<NeighborhoodScore scores={card.scores} />
					)}
				</View>
				{card.mapUrl && (
					<View style={styles.mapCol}>
						<CardMap
							url={card.mapUrl}
							onPress={() => router.push(`/listing/nearby?id=${card.id}`)}
						/>
						{!!onExplore && (
							<ExploreButton
								onPress={onExplore}
								width={MAP_SLOT}
								tone="solid"
							/>
						)}
					</View>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	/** Light face — demo C's `.C .card{background:#FFFDFB}`. */
	face: { flex: 1, backgroundColor: scoreTokens.face },
	/**
	 * `aspectRatio: 1` makes the block's height follow the card's width, so the
	 * 1:1 render lands 1:1 on every device size with no measurement.
	 */
	media: {
		width: "100%",
		aspectRatio: 1,
		borderRadius: radii.card - 4,
		overflow: "hidden",
		backgroundColor: colors.cardPlainTo,
	},
	head: { position: "absolute", top: 12, left: 12, zIndex: 2 },
	badge: { position: "absolute", top: 12, right: 12, zIndex: 2 },
	info: {
		flex: 1,
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 14,
		paddingBottom: 16,
	},
	infoText: { flex: 1, minWidth: 0 },
	/**
	 * Fixed width so the map circle's centre never moves, and `space-between` so
	 * any slack in the row is absorbed BETWEEN the circle and the button instead
	 * of piling up under the button — that pile-up was the 「底下空的太多」 the
	 * owner reported on the previous round.
	 */
	mapCol: {
		width: MAP_SLOT,
		alignSelf: "stretch",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
	},
	price: { ...priceStyle, color: scoreTokens.ink },
	address: { ...textStyles.footnote, color: scoreTokens.ink, marginTop: 2 },
	specs: { ...textStyles.footnote, color: scoreTokens.ink2, marginTop: 4 },
});
