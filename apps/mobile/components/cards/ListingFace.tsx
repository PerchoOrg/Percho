/**
 * ListingFace (§1.4) — the listing front face. Composition only; the front-face
 * baseline is 00 §0.6 and is already expressed by `CardFoot`.
 *
 * `MatchBadge` self-gates to `stage === 4 && score >= 60`, so `stage` is passed
 * straight through and NO extra gating is added here — with one exception the
 * spec requires: a tease (Stage 1–2) or preview (Stage 3) listing must not show
 * a score at all (§1.7 "match badge 不显" — the score isn't trustworthy yet), so
 * the badge is not rendered for those. That is suppression of an untrustworthy
 * number, not a second copy of the stage rule.
 *
 * Pills are the listing's real `dims` rendered through the shared `DIMS`
 * vocabulary. A listing with no dims shows no pills.
 */
import { DIMS } from "@percho/shared";
import { Image, StyleSheet, View } from "react-native";
import type { ListingCardV3 } from "../../lib/feed/card-types";
import { colors } from "../../theme/tokens";
import { CardFoot } from "../CardFoot";
import { CardPhoto } from "../CardPhoto";
import { CardVideo } from "../CardVideo";
import { KindChip } from "../KindChip";
import { MatchBadge } from "../MatchBadge";

interface ListingFaceProps {
	card: ListingCardV3;
	stage: number;
	isTop: boolean;
	/**
	 * Card width / height. Threaded from `feed.tsx` so hero media can respect the
	 * source's orientation (owner, 2026-07-27: a landscape video/photo fills the
	 * WIDTH and letterboxes, rather than being cropped by `cover`).
	 */
	cardAspect: number;
	onExplore?: () => void;
	/** Flip to the data face — wired to the FOMO badge's "See why →". */
	onSeeWhy?: () => void;
}

export function ListingFace({
	card,
	stage,
	isTop,
	cardAspect,
	onExplore,
	onSeeWhy,
}: ListingFaceProps) {
	const scoreShown = card.tease || card.preview ? undefined : card.matchScore;
	const pills = (card.dims ?? []).map((d) => DIMS[d].label);

	return (
		<View style={styles.face}>
			{card.videoUrl ? (
				<CardVideo
					url={card.videoUrl}
					poster={card.heroUrl}
					isTop={isTop}
					cardAspect={cardAspect}
				/>
			) : (
				<CardPhoto url={card.heroUrl} cardAspect={cardAspect} />
			)}
			<View style={styles.head}>
				<KindChip label="LISTING" />
			</View>
			{scoreShown !== undefined && (
				<View style={styles.badge}>
					<MatchBadge score={scoreShown} stage={stage} onSeeWhy={onSeeWhy} />
				</View>
			)}
			<View style={styles.footSlot}>
				<CardFoot
					price={card.priceLabel}
					address={card.address}
					specs={card.bedBathSqft}
					pills={pills}
					onExplore={onExplore}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: colors.ink },
	head: { position: "absolute", top: 16, left: 16, zIndex: 2 },
	badge: { position: "absolute", top: 16, right: 16, zIndex: 2 },
	footSlot: { flex: 1, justifyContent: "flex-end" },
});
