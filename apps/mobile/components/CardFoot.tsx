/**
 * CardFoot (§0.6 #4) — the bottom block on a card face. Price is New York serif
 * 25 bold; address / specs / pills / Explore sit under it, all pressed onto the
 * --card-grad gradient (§0.3). Pills truncate to the 3 strongest signals.
 *
 * The card face is always dark, so text here is on-card (light) — never a light
 * theme variant (§0.3 invariant).
 */
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme/tokens";
import { priceStyle, textStyles } from "../theme/typography";
import { ExploreButton } from "./ExploreButton";

const MAX_PILLS = 3;

interface CardFootProps {
	price: string;
	address?: string;
	specs?: string;
	pills?: string[];
	onExplore?: () => void;
}

export function CardFoot({
	price,
	address,
	specs,
	pills = [],
	onExplore,
}: CardFootProps) {
	return (
		<LinearGradient
			colors={[colors.cardGradFrom, colors.cardGradTo]}
			style={styles.grad}
		>
			<Text style={styles.price}>{price}</Text>
			{!!address && <Text style={styles.address}>{address}</Text>}
			{!!specs && <Text style={styles.specs}>{specs}</Text>}
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
		</LinearGradient>
	);
}

const styles = StyleSheet.create({
	grad: {
		paddingHorizontal: 16,
		paddingTop: 48,
		paddingBottom: 16,
	},
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
