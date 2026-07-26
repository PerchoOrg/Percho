/**
 * CommunityFace (§1.4) — the community (subdivision) front face. Same
 * composition as `ListingFace`; the serif line is the community name rather than
 * a price, because a community has no single price.
 *
 * `CommunityCardV3` has no `matchScore`, so there is no `MatchBadge` here —
 * §1.4's badge rule is a listing rule and inventing a community score would
 * fabricate a number.
 *
 * The specs row is assembled only from fields that are actually present: a
 * community without a price band and without a home count shows no specs row.
 * Pills prefer the card's authored `pills` and fall back to its real `dims`.
 */
import { DIMS } from "@percho/shared";
import { Image, StyleSheet, View } from "react-native";
import type { CommunityCardV3 } from "../../lib/feed/card-types";
import { colors } from "../../theme/tokens";
import { CardFoot } from "../CardFoot";
import { CardVideo } from "../CardVideo";
import { KindChip } from "../KindChip";

interface CommunityFaceProps {
	card: CommunityCardV3;
	isTop: boolean;
	onExplore?: () => void;
}

function specsLine(card: CommunityCardV3): string | undefined {
	const parts: string[] = [];
	if (card.priceLabel) parts.push(card.priceLabel);
	if (card.homes !== undefined) {
		parts.push(card.homes === 1 ? "1 home" : `${card.homes} homes`);
	}
	return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function CommunityFace({ card, isTop, onExplore }: CommunityFaceProps) {
	const pills =
		card.pills && card.pills.length > 0
			? [...card.pills]
			: (card.dims ?? []).map((d) => DIMS[d].label);

	return (
		<View style={styles.face}>
			{card.videoUrl ? (
				<CardVideo url={card.videoUrl} poster={card.heroUrl} isTop={isTop} />
			) : (
				<Image source={{ uri: card.heroUrl }} style={StyleSheet.absoluteFill} />
			)}
			<View style={styles.head}>
				<KindChip label="COMMUNITY" />
			</View>
			<View style={styles.footSlot}>
				<CardFoot
					price={card.name}
					address={`${card.city}, ${card.state}`}
					specs={specsLine(card)}
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
	footSlot: { flex: 1, justifyContent: "flex-end" },
});
