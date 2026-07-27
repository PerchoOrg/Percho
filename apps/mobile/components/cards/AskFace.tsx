/**
 * AskFace (§1.2) — the preference / geo-narrowing question card.
 *
 * Layer tag chip, the question in Display serif, an optional real sub-line, the
 * 58×58 geo thumb (geo layers only, §1.2 #2) and the one permitted piece of
 * on-card chrome: the "Skip this topic" underline link at a 44pt target
 * (§1.2 #4).
 *
 * NO BACK FACE (§1.2 #5) — an ask card is the reason `canFlipCard` exists. The
 * deck's `renderBack` returns null for this kind and `SwipeStack` gates the flip
 * on that result, so a tap is a genuine no-op.
 *
 * Content rule: every string here comes off the card. There is no fallback
 * question, no placeholder sub-line, no invented place name.
 *
 * Thumb caveat (judgment call, flagged for review): §1.2 asks for a static map
 * highlighting the question's geographic extent. Drawing the real
 * `communities.boundary` ring needs `react-native-svg`, which is NOT a
 * dependency of this app and task 1 may not add one. So the thumb renders the
 * one real datum available without a renderer — the geo LEVEL — as a tile. No
 * decorative fake map, no placeholder image.
 */
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
	type AskCardV3,
	LAYER_TAG,
	isGeoLayer,
} from "../../lib/feed/card-types";
import { colors, radii } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";
import { KindChip } from "../KindChip";

const THUMB = 58; // §1.2 #2

interface AskFaceProps {
	card: AskCardV3;
	onSkipTopic?: () => void;
}

export function AskFace({ card, onSkipTopic }: AskFaceProps) {
	const geo = isGeoLayer(card.layer) ? card.geo : undefined;

	return (
		<View style={styles.face}>
			{!!card.heroUrl && (
				<Image source={{ uri: card.heroUrl }} style={StyleSheet.absoluteFill} />
			)}
			<View style={styles.head}>
				<KindChip label={LAYER_TAG[card.layer]} />
			</View>
			<View style={styles.body}>
				{!!geo && (
					<View style={styles.thumb}>
						<Text style={styles.thumbLabel}>{geo.level}</Text>
					</View>
				)}
				<Text style={styles.q}>{card.q}</Text>
				{!!card.sub && <Text style={styles.sub}>{card.sub}</Text>}
				{!!onSkipTopic && (
					<Pressable
						hitSlop={8}
						onPress={onSkipTopic}
						style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
					>
						<Text style={styles.skipLabel}>Skip this topic</Text>
					</Pressable>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	face: { flex: 1, backgroundColor: colors.ink },
	head: { position: "absolute", top: 16, left: 16, zIndex: 2 },
	body: {
		flex: 1,
		justifyContent: "flex-end",
		paddingHorizontal: 20,
		paddingBottom: 24,
	},
	thumb: {
		width: THUMB,
		height: THUMB,
		borderRadius: radii.tile,
		backgroundColor: colors.glass,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 14,
	},
	thumbLabel: { ...textStyles.caption, color: colors.accent },
	q: { ...textStyles.display, color: colors.onCard },
	sub: { ...textStyles.body, color: colors.onCardDim, marginTop: 10 },
	// §1.2 #4: a low-emphasis underline link, vertically expanded to 44pt.
	skip: {
		minHeight: 44,
		justifyContent: "flex-end",
		alignSelf: "flex-start",
		marginTop: 12,
	},
	pressed: { opacity: 0.7 },
	skipLabel: {
		...textStyles.footnote,
		color: colors.onCardDim,
		textDecorationLine: "underline",
	},
});
