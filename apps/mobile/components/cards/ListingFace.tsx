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
 */
import { DIMS } from "@percho/shared";
import { StyleSheet, Text, View } from "react-native";
import type { ListingCardV3 } from "../../lib/feed/card-types";
import { colors, radii } from "../../theme/tokens";
import { priceStyle, textStyles } from "../../theme/typography";
import { CardMap } from "../CardMap";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { ExploreButton } from "../ExploreButton";
import { KindChip } from "../KindChip";
import { MatchBadge } from "../MatchBadge";

const MAX_PILLS = 3;

interface ListingFaceProps {
	card: ListingCardV3;
	stage: number;
	isTop: boolean;
	onExplore?: () => void;
	/** Flip to the data face — wired to the FOMO badge's "See why →". */
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
	const pills = (card.dims ?? []).map((d) => DIMS[d].label);
	const hasGeo = card.lat != null && card.lng != null;

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
					{!!card.bedBathSqft && (
						<Text style={styles.specs} numberOfLines={1}>
							{card.bedBathSqft}
						</Text>
					)}
					{pills.length > 0 && (
						<View style={styles.pillRow}>
							{pills.slice(0, MAX_PILLS).map((p) => (
								<Text key={p} style={styles.pill}>
									{p}
								</Text>
							))}
						</View>
					)}
					{!!onExplore && (
						<View style={styles.exploreRow}>
							<ExploreButton onPress={onExplore} />
						</View>
					)}
				</View>
				{hasGeo && (
					<CardMap lat={card.lat as number} lng={card.lng as number} />
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: colors.cardPlainTo },
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
	price: { ...priceStyle, color: colors.onCard },
	address: { ...textStyles.footnote, color: colors.onCard, marginTop: 2 },
	specs: { ...textStyles.footnote, color: colors.onCardDim, marginTop: 4 },
	pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
	pill: {
		...textStyles.caption,
		color: colors.ink,
		backgroundColor: colors.glass,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
		overflow: "hidden",
	},
	exploreRow: { marginTop: 14 },
});
