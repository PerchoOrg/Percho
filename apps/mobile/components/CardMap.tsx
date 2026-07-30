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
 *
 * ── 2026-07-30: circular, and with no text on it ─────────────────────────────
 *
 * Two owner instructions, both literal. 「去掉地图上的字」 removed the "Explore
 * area" caption that used to sit on the tile — the Explore button below it says
 * the same thing without covering the map. The pre-rendered tile itself also has
 * Google's label layer switched off (see `scripts/backfill_listing_maps.py`), so
 * street names are gone as well; the Google watermark and attribution are
 * mandated by the Static Maps terms and cannot be styled away.
 *
 * `diameter` defaults BELOW the card's 150pt column slot: the circle centres in
 * that slot, so resizing it leaves its centre where it was — 「地图稍微小一点
 * 圆心不动」. Sizing the column to the circle instead would have moved the
 * centre right and down as it shrank.
 */
import { Image, Pressable, StyleSheet, View } from "react-native";
import { colors } from "../theme/tokens";

interface CardMapProps {
	/** Public Storage URL of the pre-rendered tile (`listings.map_url`). */
	url?: string;
	/** Circle diameter in points. */
	diameter?: number;
	/** Opens the deep POI map. Omit to render a non-interactive thumbnail. */
	onPress?: () => void;
}

/** Diameter of the centre dot marking the house. */
const DOT = 12;

export function CardMap({ url, diameter = 132, onPress }: CardMapProps) {
	// No cached tile → render nothing at all rather than an empty grey square,
	// so the info block simply reflows to full width.
	if (!url) return null;

	const body = (
		<View
			style={[
				styles.well,
				{ width: diameter, height: diameter, borderRadius: diameter / 2 },
			]}
		>
			<Image source={{ uri: url }} style={styles.img} resizeMode="cover" />
			{/*
			 * Our own centre dot. The pre-rendered tile deliberately carries NO
			 * Google marker (see `scripts/backfill_listing_maps.py`) — its teardrop
			 * pin doesn't match anything else in the app, and keeping both drew two
			 * overlapping indicators. The tile is centred on the listing, so the
			 * geometric centre of the circle IS the house.
			 */}
			<View style={styles.dot} />
		</View>
	);

	if (!onPress) return body;
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel="Explore the area around this home"
		>
			{body}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	/**
	 * The white ring is what makes this read as an object sitting ON the card
	 * rather than a hole punched INTO it, and the soft drop shadow is demo C's
	 * 「微阴影，还原真实卡片触感」. The well behind the tile is the recessed
	 * `surface2` rather than a dark fill — on the light card face a brown backing
	 * showed as a dark rim while the image loaded.
	 */
	well: {
		overflow: "hidden",
		backgroundColor: colors.surface2,
		borderWidth: 4,
		borderColor: colors.surface,
		shadowColor: colors.ink,
		shadowOpacity: 0.22,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 5 },
		elevation: 4,
	},
	img: { width: "100%", height: "100%" },
	/**
	 * Centred by `position:absolute` + 50% insets and a half-size negative
	 * margin, which is exact at any diameter — `alignItems:center` on the parent
	 * would fight the absolutely-positioned image.
	 */
	dot: {
		position: "absolute",
		top: "50%",
		left: "50%",
		width: DOT,
		height: DOT,
		marginTop: -DOT / 2,
		marginLeft: -DOT / 2,
		borderRadius: DOT / 2,
		backgroundColor: colors.accent,
		borderWidth: 2.5,
		borderColor: colors.surface,
	},
});
