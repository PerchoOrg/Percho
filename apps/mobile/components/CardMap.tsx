/**
 * CardMap — the locality thumbnail in the listing card's info block.
 *
 * ── This renders a CACHED image, not a live API call ─────────────────────────
 *
 * `url` is a public Supabase Storage URL produced once by
 * `scripts/backfill_listing_maps.py`. Two reasons it is not a live Static Maps
 * fetch:
 *
 *   1. Cost. The card's map is a fixed picture of a fixed coordinate, so a live
 *      fetch is a billable request per render for an image that never changes.
 *   2. Key exposure. Doing it client-side needs the key in the app, and
 *      `EXPO_PUBLIC_*` is INLINED INTO THE JS BUNDLE at build time — extractable
 *      by anyone with the bundle. Rendering server-side keeps the key on the host.
 *
 * That first version also simply did not work: the key was written to the repo
 * root `.env.local`, but Expo only reads env from `apps/mobile/`, so
 * `process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY` was `undefined` on device and the
 * component silently rendered its empty well. Verified by grepping the Metro
 * process env (0 matches). A cached URL has no such failure mode — it is either
 * present in the DTO or it isn't.
 *
 * Not an interactive MapView: the feed is a swipe surface, so a pannable map
 * inside a card would fight the gesture. Tapping opens the full POI map instead.
 */
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

interface CardMapProps {
	/** Public Storage URL of the pre-rendered tile (`listings.map_url`). */
	url?: string;
	/** Square edge in points. */
	size?: number;
	/** Opens the deep POI map. Omit to render a non-interactive thumbnail. */
	onPress?: () => void;
}

export function CardMap({ url, size = 104, onPress }: CardMapProps) {
	// No cached tile → render nothing at all rather than an empty grey square,
	// so the info block simply reflows to full width.
	if (!url) return null;

	const body = (
		<View style={[styles.well, { width: size, height: size }]}>
			<Image source={{ uri: url }} style={styles.img} resizeMode="cover" />
			{!!onPress && (
				<View style={styles.hintRow}>
					<Text style={styles.hint}>Explore area</Text>
				</View>
			)}
		</View>
	);

	if (!onPress) return body;
	return (
		<Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Explore the area around this home">
			{body}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	well: {
		borderRadius: radii.tile,
		overflow: "hidden",
		backgroundColor: colors.cardPlainTo,
	},
	img: { width: "100%", height: "100%" },
	hintRow: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		paddingVertical: 4,
		paddingHorizontal: 6,
		backgroundColor: "rgba(0,0,0,0.55)",
	},
	hint: { ...textStyles.caption, color: colors.onCard, fontSize: 9 },
});
