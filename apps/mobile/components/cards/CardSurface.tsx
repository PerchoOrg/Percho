/**
 * The card surface under a face that has no photograph.
 *
 * §0.3 says the card face is always dark, and every media-backed face gets that
 * for free: a photo with `cardGradTo` over its lower ~45%. But five faces have no
 * media source at all by design — trade-off, challenge, insight, milestone, and
 * the data faces. They were each filling with flat `colors.ink`, which is the
 * PRIMARY TEXT token (#2B2116), so a trade-off card rendered as a full screen of
 * near-black. On device, with stage 0's mix putting a trade-off in 3 of every 10
 * slots, the owner read it as "连着看到纯黑的 tradeoff card".
 *
 * Flat ink is not in §0.3 as a card treatment; it was the absence of one. This is
 * that treatment: a warm dark base with a soft top-left highlight, so a
 * media-less card reads as an intentional surface rather than a card whose image
 * failed to load. It stays firmly in the dark family, so every on-card token
 * (`onCard`, `onCardDim`, `glass`, `pos`/`neg`) keeps the contrast it was
 * AA-checked against.
 *
 * Two colours, no image, no blur: a mesh or noise texture would cost a full-card
 * offscreen pass on every one of these cards, and they are the majority of stage
 * 0's deck.
 */
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";
import { colors } from "../../theme/tokens";

/**
 * Diagonal, top-left to bottom-right — the same light direction as the photo
 * faces, whose foot gradient darkens downward.
 */
const START = { x: 0, y: 0 } as const;
const END = { x: 1, y: 1 } as const;

export function CardSurface() {
	return (
		<LinearGradient
			colors={[colors.cardPlainFrom, colors.cardPlainTo]}
			start={START}
			end={END}
			style={StyleSheet.absoluteFill}
		/>
	);
}
