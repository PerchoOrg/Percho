/**
 * The background for a card face that has no photograph.
 *
 * §0.3 says the card face is always dark, and every media-backed face gets that
 * for free: a photo with `cardGradTo` over its lower ~45%. Faces with no media
 * source (trade-off, challenge, insight, milestone, the data back face — plus a
 * geo or ask card whose real hero photo is missing) have no such treatment
 * named in the spec, and every attempt to stand in for one so far has read on
 * device as a broken card: first flat `ink`, then a single shared brown ramp
 * ("不能黑屏", owner 2026-07-27).
 *
 * This is the designed treatment. Three layers, each cheap:
 *
 *   1. a diagonal two-stop ramp in the VARIANT's own hue (see `cardSurfaces`) —
 *      so a trade-off does not look like an insight does not look like a
 *      milestone. A run of media-less cards must not read as one card stuck.
 *   2. a corner wash from the same hue's `glow`, ending transparent — the same
 *      top-left light direction the photo faces imply with their downward foot
 *      gradient.
 *   3. three concentric hairline rings anchored off the card's own corner. This
 *      is the only figurative element, and it is deliberately geometric rather
 *      than pictorial: a fake illustration would compete with the copy, which
 *      on these cards IS the content.
 *
 * No blur, no noise, no mesh, no image: media-less cards are the majority of
 * stage 0's deck, and a full-card offscreen pass on every one of them is not
 * worth a texture. The rings are plain `View`s with a border radius.
 *
 * Every variant stays in the dark family, so `onCard`, `onCardDim`, `glass`,
 * `pos` and `neg` all keep the contrast they were AA-checked against in §0.3.
 */
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import {
	type CardSurfaceVariant,
	cardSurfaces,
	colors,
} from "../../theme/tokens";

/**
 * Diagonal, top-left to bottom-right — the same light direction as the photo
 * faces, whose foot gradient darkens downward.
 */
const RAMP_START = { x: 0, y: 0 } as const;
const RAMP_END = { x: 1, y: 1 } as const;

/** The corner wash: strongest at the light source, gone by just past halfway. */
const GLOW_END = { x: 0.85, y: 0.85 } as const;
const GLOW_STOPS = [0, 0.55] as const;

/**
 * Ring geometry, in points. Anchored so the rings' shared centre sits off the
 * bottom-right corner: on screen you see three arcs sweeping the lower half,
 * never a bullseye.
 */
const RINGS = [420, 620, 840] as const;
const RING_INSET = -180;

interface CardSurfaceProps {
	/**
	 * Which hue to wear. Required — there is no default, because a shared
	 * fallback is exactly how all five faces ended up identical.
	 */
	variant: CardSurfaceVariant;
	/**
	 * Suppress the ring motif. Used by the trade-off face, where two surfaces sit
	 * side by side and one shared set of arcs across the split would fight the
	 * dashed rule.
	 */
	plain?: boolean;
}

export function CardSurface({ variant, plain = false }: CardSurfaceProps) {
	const surface = cardSurfaces[variant];

	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="none">
			<LinearGradient
				colors={[surface.from, surface.to]}
				start={RAMP_START}
				end={RAMP_END}
				style={StyleSheet.absoluteFill}
			/>
			{!plain &&
				RINGS.map((size) => (
					<View
						key={size}
						style={[
							styles.ring,
							{
								width: size,
								height: size,
								borderRadius: size / 2,
								right: RING_INSET - size / 4,
								bottom: RING_INSET - size / 4,
							},
						]}
					/>
				))}
			<LinearGradient
				colors={[surface.glow, "transparent"]}
				locations={[...GLOW_STOPS]}
				start={RAMP_START}
				end={GLOW_END}
				style={StyleSheet.absoluteFill}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	ring: {
		position: "absolute",
		borderWidth: StyleSheet.hairlineWidth * 2,
		borderColor: colors.cardPlainRing,
	},
});
