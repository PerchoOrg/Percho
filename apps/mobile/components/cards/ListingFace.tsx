/**
 * ListingFace (§1.4) — the listing front face.
 *
 * ── 2026-07-28 structure change (owner-directed) ─────────────────────────────
 *
 * Three parts, top to bottom, replacing the old full-bleed media + overlaid foot:
 *
 *   1. a 1:1 INLINE video/photo block (not full-bleed),
 *   2. the info block,
 *   3. a locality map.
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
 * ── 2026-07-29 redesign (owner review of the above) ──────────────────────────
 *
 * Four complaints, verbatim, and what each one changed here:
 *
 *   「左下角信息太单薄 不够吸引人」
 *      The info block was price / address / bed-bath, three lines in a large
 *      panel. It now leads with price + locality, carries the specs as discrete
 *      chips, and then runs the agent's OWN listing prose — real body copy, not
 *      filler. That copy is also what makes the block adaptive: see `descLines`.
 *
 *   「右下角地图不好看」+「整体看下面有很多空的位置不够匀称」
 *      The map was a 104pt dark square wedged to the right of the text, which
 *      left a dead column under it (the exact shape of the "空的位置"). It is now
 *      a full-width strip pinned to the card's bottom edge, rendered LIGHT
 *      (`STYLE_VERSION = v2light` in scripts/backfill_listing_maps.py) at the
 *      aspect it is displayed at, with the Explore-area affordance on it. A
 *      full-width element is what makes the bottom of the card read as finished.
 *
 *   「以纯白 + 浅灰为基底，搭配柔和渐变与微阴影……色彩克制，仅用点缀色突出核心操作」
 *      The chassis is now the LIGHT card family (`cardLightFrom/To` + the two
 *      `cardShadow` layers), overriding §0.3's "card face is always dark" for
 *      this face only. §0.3's invariant was free while the media was full-bleed;
 *      once the media became a 1:1 inset, "dark card" meant a flat chocolate
 *      panel, which is what read as 单薄. The media block keeps its own dark
 *      treatment because it IS a photograph. `accent` appears exactly once, on
 *      Explore — everything else is ink on paper, per 色彩克制.
 *
 *   「因为内嵌的视频卡不大 字幕占了很多空间影响画面」
 *      Not fixable here: those captions are burned into the video pixels by the
 *      render pipeline. Fixed in scripts/caption-render/overlay.html's new
 *      `body.square` rules (band 49% → 16.5% of the frame, measured).
 *
 * `MatchBadge` self-gates to `stage === 4 && score >= 60`, so `stage` is passed
 * straight through and NO extra gating is added here — with one exception the
 * spec requires: a tease (Stage 1–2) or preview (Stage 3) listing must not show
 * a score at all (§1.7 "match badge 不显"), so the badge is not rendered for
 * those. That is suppression of an untrustworthy number, not a second copy of
 * the stage rule.
 */
import { DIMS } from "@percho/shared";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import type { ListingCardV3 } from "../../lib/feed/card-types";
import { cardShadow, colors, radii } from "../../theme/tokens";
import { priceStyle, textStyles } from "../../theme/typography";
import { CardMap } from "../CardMap";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { KindChip } from "../KindChip";
import { MatchBadge } from "../MatchBadge";

const MAX_PILLS = 3;
/** Line height of the description, in points. Used to convert space → lines. */
const DESC_LINE_HEIGHT = 19;
/** Never render a 1-line orphan; below this the paragraph is dropped entirely. */
const MIN_DESC_LINES = 2;

export interface ListingFaceProps {
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
	/**
	 * How many lines of prose actually fit, measured rather than guessed.
	 *
	 * The leftover height under a 1:1 media block depends on the device: a 393pt
	 * card leaves ~250pt, a 320pt card ~190pt, and the fixed rows above the
	 * paragraph (price / address / chips) do not shrink. A hardcoded
	 * `numberOfLines` therefore either clips on the small phone or leaves the
	 * dead space the owner flagged on the large one.
	 *
	 * `null` until the first layout pass, which renders nothing — one frame with
	 * no paragraph is invisible, whereas rendering an unbounded paragraph first
	 * would push the map strip off the card and flash it.
	 */
	const [descLines, setDescLines] = useState<number | null>(null);
	const description = card.description?.join("  ") ?? "";

	const onDescLayout = (e: LayoutChangeEvent) => {
		const h = e.nativeEvent.layout.height;
		// A pre-layout read (0) must not collapse the paragraph to the floor.
		if (h < DESC_LINE_HEIGHT) return;
		const fits = Math.floor(h / DESC_LINE_HEIGHT);
		setDescLines((prev) => (prev === fits ? prev : fits));
	};

	return (
		// The face is ONE view, not a shadow sandwich: `SwipeStack`'s card clips its
		// children (`overflow: "hidden"`), so an inner wrapper's shadow is thrown
		// away. The card's lift therefore lives on the stack card itself — see
		// `cardShadow.ambient` in SwipeStack.tsx. What stays here is the chassis
		// ramp (纯白 → 浅灰) and the hairline edge.
		<LinearGradient
			colors={[colors.cardLightFrom, colors.cardLightTo]}
			style={styles.face}
		>
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

			{/* 2 — info block. `flex: 1` so it absorbs whatever the media leaves. */}
			<View style={styles.info}>
				<View style={styles.priceRow}>
					<Text style={styles.price}>{card.priceLabel}</Text>
					{!!card.bedBathSqft && (
						<Text style={styles.specs} numberOfLines={1}>
							{card.bedBathSqft}
						</Text>
					)}
				</View>
				<Text style={styles.address} numberOfLines={1}>
					{card.address}
				</Text>
				{!!card.locality && (
					<Text style={styles.locality} numberOfLines={1}>
						{card.locality}
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
				{/*
				 * The measured slot. It always claims the leftover height (so the
				 * card bottoms out flush at the map strip) and the paragraph inside
				 * it is clamped to the lines that fit.
				 */}
				<View style={styles.descSlot} onLayout={onDescLayout}>
					{!!description &&
						descLines !== null &&
						descLines >= MIN_DESC_LINES && (
							<Text style={styles.desc} numberOfLines={descLines}>
								{description}
							</Text>
						)}
				</View>
			</View>

			{/* 3 — full-width locality strip, flush to the card's bottom edge. */}
			{card.mapUrl && (
				<CardMap
					url={card.mapUrl}
					onPress={() => router.push(`/listing/nearby?id=${card.id}`)}
					onExplore={onExplore}
				/>
			)}
		</LinearGradient>
	);
}

const styles = StyleSheet.create({
	face: {
		flex: 1,
		borderRadius: radii.card,
		overflow: "hidden",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: colors.cardLightEdge,
	},
	/**
	 * `aspectRatio: 1` makes the block's height follow the card's width, so the
	 * 1:1 render lands 1:1 on every device size with no measurement.
	 */
	media: {
		width: "100%",
		aspectRatio: 1,
		// Square top corners, rounded bottom: the block meets the card's own
		// rounded top edge (the parent clips it), and its lower corners curve back
		// into the light chassis so the photo reads as inset rather than pasted on.
		borderBottomLeftRadius: radii.tile,
		borderBottomRightRadius: radii.tile,
		overflow: "hidden",
		backgroundColor: colors.cardPlainTo,
	},
	head: { position: "absolute", top: 12, left: 12, zIndex: 2 },
	badge: { position: "absolute", top: 12, right: 12, zIndex: 2 },
	info: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 12 },
	// Price and bed/bath on one line: they are read together, and pairing them
	// buys a whole line back for the paragraph below.
	priceRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
		gap: 10,
	},
	price: { ...priceStyle, color: colors.ink },
	specs: { ...textStyles.footnote, color: colors.ink2, flexShrink: 1 },
	address: { ...textStyles.headline, color: colors.ink, marginTop: 4 },
	locality: { ...textStyles.footnote, color: colors.ink2, marginTop: 1 },
	pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
	pill: {
		...textStyles.caption,
		color: colors.ink2,
		backgroundColor: colors.cardLightChip,
		paddingHorizontal: 9,
		paddingVertical: 4,
		borderRadius: radii.pill,
		overflow: "hidden",
	},
	descSlot: { flex: 1, minHeight: 0, marginTop: 10, overflow: "hidden" },
	desc: {
		...textStyles.footnote,
		lineHeight: DESC_LINE_HEIGHT,
		color: colors.ink2,
	},
});
