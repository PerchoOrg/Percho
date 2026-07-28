/**
 * CardMap — the small locality thumbnail in the listing card's info block.
 *
 * A Google Static Map, not an interactive MapView: the feed is a swipe surface,
 * so a pannable map inside a card would fight the gesture. It's a picture of
 * where the home is, nothing more.
 *
 * ── Style choices that are load-bearing ─────────────────────────────────────
 *
 * `zoom=16` with roads and place labels VISIBLE. An earlier prototype styled
 * roads and labels off at zoom 14 to look "clean"; at 104pt the result was an
 * empty tan rectangle that read as a broken image, not a map. The map has to
 * look like a map at thumbnail size, which means street geometry must show.
 *
 * `scale=2` for retina. Google's attribution watermark is part of the returned
 * raster and must stay visible — do not crop it out.
 *
 * A missing/failed tile renders as the card's plain surface rather than a broken
 * image icon, because `Image` with no successful load just shows the background.
 */
import { Image, StyleSheet, View } from "react-native";
import { colors, radii } from "../theme/tokens";

const STATIC_MAPS_BASE = "https://maps.googleapis.com/maps/api/staticmap";

/** Dark map styling, matched to the card family (§0.3) rather than Google default. */
const DARK_STYLE = [
	"feature:all|element:geometry|color:0x2f2b26",
	"feature:all|element:labels.text.fill|color:0x9c948a",
	"feature:all|element:labels.text.stroke|color:0x1a1816",
	"feature:all|element:labels.icon|visibility:off",
	"feature:road|element:geometry.fill|color:0x6b6259",
	"feature:road.arterial|element:geometry.fill|color:0x857a6d",
	"feature:water|element:geometry|color:0x16202a",
	"feature:poi.park|element:geometry|color:0x24331f",
	"feature:poi.business|visibility:off",
];

interface CardMapProps {
	lat: number;
	lng: number;
	/** Square edge in points. */
	size?: number;
}

export function CardMap({ lat, lng, size = 104 }: CardMapProps) {
	const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;
	// No key configured → render the empty well rather than a 403 image.
	if (!key) return <View style={[styles.well, { width: size, height: size }]} />;

	const marker = encodeURIComponent(`color:0xB45309|size:small|${lat},${lng}`);
	const styleParams = DARK_STYLE.map((s) => `&style=${encodeURIComponent(s)}`).join("");
	const uri =
		`${STATIC_MAPS_BASE}?center=${lat},${lng}&zoom=16&size=200x200&scale=2` +
		`&maptype=roadmap&markers=${marker}${styleParams}&key=${key}`;

	return (
		<View style={[styles.well, { width: size, height: size }]}>
			<Image source={{ uri }} style={styles.img} resizeMode="cover" />
		</View>
	);
}

const styles = StyleSheet.create({
	well: {
		borderRadius: radii.tile,
		overflow: "hidden",
		backgroundColor: colors.cardPlainTo,
	},
	img: { width: "100%", height: "100%" },
});
