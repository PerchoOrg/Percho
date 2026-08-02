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
	/**
	 * `"contain"` (default) keeps the owner's 2026-07-27 rule: fill the width,
	 * letterbox vertically, never crop.
	 *
	 * `"cover"` is for a face that must be FULL BLEED regardless of source shape
	 * (`CommunityFace`, owner 2026-08-02: 「community视频要full bleed!占据整个卡面」).
	 * It matters here because only ONE community has a video — every other
	 * community card renders through THIS component, so fixing the video path
	 * alone would have left the bars on ~all of them.
	 */
	fit?: "contain" | "cover";
}

export function CardPhoto({ url, fit = "contain" }: CardPhotoProps) {
	return (
		<View style={styles.frame}>
			{/* Blurred, dimmed copy of the same photo behind the bands, so the
			    letterbox area still belongs to this card. Invisible under `cover`. */}
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
				resizeMode={fit}
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
