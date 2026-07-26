/**
 * AreaFace (§1.3) — the Stage 1–2 geographic probe. ONE component for all three
 * granularities (area / city / zip); the `KindChip` marks which level, per
 * §1.3 #1.
 *
 * Media follows §0.7 / PLAN B8: the real `videoUrl` when a unit has one (only 4
 * `community_videos` rows exist today), otherwise the real `heroUrl` as a
 * first-class static state with no missing-media affordance.
 *
 * `CardFoot` gets only real strings:
 *   price  → the unit's own name (the serif line on this card is the place)
 *   address→ `vibe`, and only if a human wrote one
 *   specs  → assembled from POPULATED `GeoStats` entries only
 *   pills  → real `sampleCommunityNames`
 * A unit with no median price and no listing count shows no specs row at all —
 * no "—", no "N/A", no estimated number (PLAN §3).
 */
import { Image, StyleSheet, View } from "react-native";
import type { AreaCardV3 } from "../../lib/feed/card-types";
import { colors } from "../../theme/tokens";
import { CardFoot } from "../CardFoot";
import { CardVideo } from "../CardVideo";
import { KindChip } from "../KindChip";

interface AreaFaceProps {
	card: AreaCardV3;
	isTop: boolean;
}

/** Populated stats only, in §1.3's reading order. Empty = render no row. */
function statsLine(card: AreaCardV3): string | undefined {
	const parts: string[] = [];
	const median = card.unit.stats.medianListPrice;
	if (median) parts.push(`Median $${Math.round(median.value / 1000)}K`);
	const active = card.unit.stats.activeListings;
	if (active !== undefined) parts.push(`${active} active listings`);
	if (card.unit.communityCount > 0) {
		parts.push(
			card.unit.communityCount === 1
				? "1 community"
				: `${card.unit.communityCount} communities`,
		);
	}
	return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function AreaFace({ card, isTop }: AreaFaceProps) {
	const { unit } = card;

	return (
		<View style={styles.face}>
			{unit.videoUrl ? (
				<CardVideo url={unit.videoUrl} poster={unit.heroUrl} isTop={isTop} />
			) : (
				!!unit.heroUrl && (
					<Image
						source={{ uri: unit.heroUrl }}
						style={StyleSheet.absoluteFill}
					/>
				)
			)}
			<View style={styles.head}>
				<KindChip label={`AREA · ${unit.level}`} />
			</View>
			<View style={styles.footSlot}>
				<CardFoot
					price={`${unit.name}, ${unit.state}`}
					address={card.vibe}
					specs={statsLine(card)}
					pills={[...unit.sampleCommunityNames]}
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
