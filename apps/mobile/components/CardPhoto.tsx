/**
 * CardPhoto — a still hero that respects source orientation, the same way
 * `CardVideo` does.
 *
 * Every card face rendered its photo as a bare `<Image style={absoluteFill} />`,
 * which defaults to `resizeMode="cover"` — it FILLS by cropping. The owner's rule
 * covers photos as well as video (2026-07-27: "listing card 要能同时支持竖屏和
 * 横屏视频或者照片"), and in production the photos are landscape, so a 16:9 house
 * exterior in a ~9:16 card was losing most of its width.
 *
 * Same decision function as the video path (`lib/media/fit.ts`) so the two can
 * never diverge: portrait fills, landscape gets full width with dark bands, and a
 * blurred copy of the photo sits behind those bands so the card never shows a
 * flat empty strip.
 *
 * Dimensions come from `Image.getSize` — RN gives no dimensions on a remote URI
 * until it is measured, and guessing from the URL is not possible.
 */
import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { type MediaSize, mediaFit } from "../lib/media/fit";
import { colors } from "../theme/tokens";

interface CardPhotoProps {
	url: string;
	/** Card width / height, so the fit adapts to the device. */
	cardAspect: number;
}

export function CardPhoto({ url, cardAspect }: CardPhotoProps) {
	const [size, setSize] = useState<MediaSize | undefined>(undefined);

	useEffect(() => {
		let live = true;
		// Reset on url change, or a new photo briefly inherits the previous one's
		// fit — which on a portrait→landscape swap is a visible jump.
		setSize(undefined);
		Image.getSize(
			url,
			(width, height) => {
				if (live) setSize({ width, height });
			},
			() => {
				// Measurement failed (404, offline). `undefined` keeps the `cover`
				// fallback, which still renders something rather than an empty frame.
			},
		);
		return () => {
			live = false;
		};
	}, [url]);

	const fit = mediaFit(size, cardAspect);

	if (!fit.letterboxed) {
		return (
			<Image
				source={{ uri: url }}
				style={StyleSheet.absoluteFill}
				resizeMode="cover"
			/>
		);
	}

	return (
		<View style={styles.frame}>
			{/* Blurred fill behind the bands — the same photo, so the band always
			    belongs to this card rather than reading as a dead grey strip. */}
			<Image
				source={{ uri: url }}
				style={StyleSheet.absoluteFill}
				resizeMode="cover"
				blurRadius={14}
			/>
			<View style={styles.scrim} />
			<Image
				source={{ uri: url }}
				style={[styles.contained, { aspectRatio: fit.boxAspectRatio }]}
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
	},
	/** Darkens the blurred backdrop — the card face is always dark (§0.3). */
	scrim: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: colors.cardPlainTo,
		opacity: 0.6,
	},
	/** Full card WIDTH; height follows the photo's own aspect. */
	contained: { width: "100%" },
});
