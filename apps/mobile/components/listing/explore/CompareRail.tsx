/**
 * CompareRail (phase119 spec §3.9) — "Next to what you've saved".
 *
 * The current home first (brand outline), then the buyer's SAVED homes —
 * never recommendations. Every card's sub-line shows the same comparable
 * dimension; commute times don't exist yet (P1), so the shared dimension is
 * the locality, which is the axis the saves already differ on.
 */
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { compactUsd } from "../../../lib/listing/fit";
import type { ListingSummaryDTO } from "../../../lib/listing/summaries";
import { explore, exploreRadii, fonts } from "../../../theme/tokens";

export interface CompareRailProps {
	current: { price?: number; city: string; thumbUrl?: string };
	saves: readonly ListingSummaryDTO[];
}

function Card({
	price,
	sub,
	thumbUrl,
	isCurrent,
}: {
	price?: number;
	sub: string;
	thumbUrl?: string;
	isCurrent?: boolean;
}) {
	return (
		<View style={[styles.card, isCurrent && styles.cardCurrent]}>
			<View style={styles.thumb}>
				{thumbUrl ? (
					<Image source={{ uri: thumbUrl }} style={styles.thumbImg} />
				) : null}
			</View>
			<View style={styles.body}>
				<Text style={styles.price}>
					{price !== undefined ? compactUsd(price) : "—"}
				</Text>
				<Text style={styles.sub} numberOfLines={1}>
					{sub}
				</Text>
			</View>
		</View>
	);
}

export function CompareRail({ current, saves }: CompareRailProps) {
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			style={styles.bleed}
			contentContainerStyle={styles.row}
		>
			<Card
				{...(current.price !== undefined ? { price: current.price } : {})}
				sub={`This one · ${current.city}`}
				{...(current.thumbUrl ? { thumbUrl: current.thumbUrl } : {})}
				isCurrent
			/>
			{saves.map((s) => (
				<Card
					key={s.id}
					{...(s.price !== undefined ? { price: s.price } : {})}
					sub={s.city}
					{...(s.thumbUrl ? { thumbUrl: s.thumbUrl } : {})}
				/>
			))}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	bleed: { marginHorizontal: -18 },
	row: { paddingHorizontal: 18, gap: 9 },
	card: {
		width: 116,
		borderRadius: exploreRadii.sm,
		overflow: "hidden",
		backgroundColor: explore.surface,
	},
	cardCurrent: {
		borderWidth: 1.5,
		borderColor: explore.brand,
	},
	thumb: { height: 70, backgroundColor: explore.chip },
	thumbImg: { width: "100%", height: "100%" },
	body: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 11 },
	price: {
		fontSize: 14,
		fontWeight: "700",
		letterSpacing: -0.3,
		color: explore.ink,
		fontFamily: fonts.ui,
		fontVariant: ["tabular-nums"],
	},
	sub: {
		fontSize: 10.5,
		color: explore.muted,
		marginTop: 3,
		fontFamily: fonts.ui,
	},
});
