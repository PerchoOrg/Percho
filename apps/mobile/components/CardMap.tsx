/**
 * CardMap — the locality strip at the bottom of the listing card.
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
 * ── 2026-07-29: square thumbnail → full-width strip ──────────────────────────
 *
 * Was a 104pt square floated to the right of the info text. Owner: 「右下角地图
 * 不好看」and 「整体看下面有很多空的位置不够匀称」 — those are one problem. A
 * square in the corner leaves a dead column under itself that nothing can fill,
 * and it is the only hard-edged block on the face.
 *
 * As a full-width strip pinned to the card's bottom edge it terminates the card
 * instead of floating in it, and it is the natural home for the Explore-area
 * affordance (which used to be a separate pill competing with it). The tile is
 * now rendered LIGHT and at 2:1 — the shape it is displayed at, so `cover` crops
 * nothing (see `STYLE_VERSION`/`size` in scripts/backfill_listing_maps.py).
 */
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme/tokens";
import { textStyles } from "../theme/typography";

/**
 * Strip height in points. Deliberately short: this is orientation ("where is
 * this?"), not a map the buyer reads. 2:1 at ~360pt wide would be 180pt tall and
 * would take the height the description needs.
 */
const STRIP_HEIGHT = 84;

interface CardMapProps {
	/** Public Storage URL of the pre-rendered tile (`listings.map_url`). */
	url?: string;
	/** Opens the deep POI map. Omit to render a non-interactive strip. */
	onPress?: () => void;
	/**
	 * Opens the listing detail. Rendered as the strip's right-hand label so the
	 * card carries ONE accent-coloured affordance rather than a separate pill
	 * stacked above the map (owner: 色彩克制, 仅用点缀色突出核心操作).
	 */
	onExplore?: () => void;
}

export function CardMap({ url, onPress, onExplore }: CardMapProps) {
	// No cached tile → render nothing at all rather than an empty grey band, so
	// the info block above simply grows into the space.
	if (!url) return null;

	const body = (
		<View style={styles.strip}>
			<Image source={{ uri: url }} style={styles.img} resizeMode="cover" />
			{/*
			 * A single soft veil, not a dark scrim: the tile is light now, so the
			 * labels need lift from a PALE wash and ink text. A dark gradient here
			 * would put the loudest element back on the face.
			 */}
			<View style={styles.veil} />
			<View style={styles.row}>
				{!!onPress && <Text style={styles.hint}>Explore area</Text>}
				{!!onExplore && (
					<Pressable
						hitSlop={10}
						onPress={onExplore}
						accessibilityRole="button"
						accessibilityLabel="Open this listing"
						style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
					>
						<Text style={styles.ctaLabel}>Explore →</Text>
					</Pressable>
				)}
			</View>
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
	strip: {
		height: STRIP_HEIGHT,
		// Bottom corners follow the card; the top edge is a straight seam against
		// the info block.
		borderBottomLeftRadius: radii.card,
		borderBottomRightRadius: radii.card,
		overflow: "hidden",
		backgroundColor: colors.cardLightWell,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.cardLightEdge,
		justifyContent: "flex-end",
	},
	img: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
	veil: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: colors.cardLightFrom,
		opacity: 0.34,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	hint: { ...textStyles.caption, color: colors.ink2 },
	cta: {
		paddingHorizontal: 12,
		paddingVertical: 7,
		borderRadius: radii.pill,
		backgroundColor: colors.accent,
	},
	pressed: { backgroundColor: colors.accentDeep },
	ctaLabel: { ...textStyles.caption, color: colors.surface },
});
