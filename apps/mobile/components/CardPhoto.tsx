/**
 * CardPhoto — a still hero that obeys the same fit rule as `CardVideo`.
 *
 * Owner's rule (2026-07-27): media fills the card's WIDTH, is never stretched
 * vertically, and is never zoomed in. `resizeMode="contain"` is that rule for
 * every aspect ratio: a landscape photo ends up full-width with bands above and
 * below, a portrait photo fills, and nothing is ever cropped or magnified.
 *
 * Every card face previously rendered a bare `<Image style={absoluteFill} />`,
 * which defaults to `cover` — it FILLS by cropping, so a 16:9 house exterior in a
 * ~9:16 card lost most of its width and upscaled the remainder.
 *
 * No `Image.getSize` call: an earlier version measured the photo to choose
 * between fit modes, which was both slower (an extra network round trip per
 * card) and pointless, since `contain` already satisfies the rule at every ratio.
 */
import { Image, StyleSheet, View } from "react-native";
import { colors } from "../theme/tokens";

interface CardPhotoProps {
	url: string;
}

export function CardPhoto({ url }: CardPhotoProps) {
	return (
		<View style={styles.frame}>
			{/* Blurred, dimmed copy of the same photo behind the bands, so the
			    letterbox area still belongs to this card. */}
			<Image
				source={{ uri: url }}
				style={StyleSheet.absoluteFill}
				resizeMode="cover"
				blurRadius={16}
			/>
			<View style={styles.scrim} />
			<Image
				source={{ uri: url }}
				style={StyleSheet.absoluteFill}
				resizeMode="contain"
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	frame: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.cardPlainTo,
	},
	scrim: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: colors.cardPlainTo,
		opacity: 0.55,
	},
});
