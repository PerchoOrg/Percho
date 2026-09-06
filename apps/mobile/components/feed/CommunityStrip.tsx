/**
 * The header's community strip (phase181, owner pick "R3").
 *
 * The neighbourhoods Percho has filmed in the scoped city, as a scrollable row
 * of covers under the city title. The one the deck is currently showing is
 * ringed; tapping any of them goes to that card (owner, 2026-09-05:
 * 「点击一个社区应该可以跳到那张卡片」) — see `lib/feed/jump.ts` for what
 * "goes to" does to the deck.
 *
 * Only communities with a TOUR are listed. The strip's promise is "tap to see
 * this neighbourhood", and a photo-only community would land the buyer on a
 * still card that plays nothing — the same reason the feed's community pool is
 * video-only.
 *
 * ── The size of a square (owner, 2026-09-06) ────────────────────────────────
 *
 * 「make squares bigger to account for reducing one line, maybe 4.5 squares
 * making full width, and we swipe for more」. So the size is not a constant:
 * it is solved per screen so that four and a HALF squares span the width. The
 * half is the affordance — a row that ends flush at the edge looks finished,
 * and nobody swipes a finished row.
 */
import { memo } from "react";
import {
	Image,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	useWindowDimensions,
} from "react-native";
import type { CommunityCardV3 } from "../../lib/feed/card-types";
import {
	STRIP_GAP,
	STRIP_PAD,
	coverSize,
} from "../../lib/feed/community-strip";
import { redline } from "../../theme/tokens";

/** The size rule lives in `lib/feed/community-strip.ts` — the layout tests need it. */

interface CommunityStripProps {
	communities: readonly CommunityCardV3[];
	/** The community the deck is on, if it is on one. */
	activeId: string | null;
	onPick: (community: CommunityCardV3) => void;
}

export const CommunityStrip = memo(function CommunityStrip({
	communities,
	activeId,
	onPick,
}: CommunityStripProps) {
	const { width } = useWindowDimensions();
	const cover = coverSize(width);
	if (communities.length === 0) return null;
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={styles.row}
			style={styles.scroll}
		>
			{communities.map((c) => {
				const active = c.id === activeId;
				return (
					<Pressable
						key={c.id}
						onPress={() => onPick(c)}
						accessibilityRole="button"
						accessibilityState={{ selected: active }}
						accessibilityLabel={
							active ? `${c.name}, showing now` : `Go to ${c.name}`
						}
						style={({ pressed }) => [
							styles.item,
							{ width: cover },
							pressed && styles.pressed,
						]}
					>
						<Image
							source={{ uri: c.heroUrl }}
							style={[
								styles.cover,
								{ width: cover, height: cover, borderRadius: cover / 3.5 },
								active && styles.coverActive,
							]}
						/>
						<Text
							style={[
								styles.name,
								{ width: cover },
								active && styles.nameActive,
							]}
							numberOfLines={1}
						>
							{c.name}
						</Text>
					</Pressable>
				);
			})}
		</ScrollView>
	);
});

const styles = StyleSheet.create({
	/** `overflow: visible` would let the ring clip; the row scrolls instead. */
	scroll: { marginTop: 10, flexGrow: 0 },
	/** No right padding: the half square must reach the screen's edge. */
	row: { paddingLeft: STRIP_PAD, paddingRight: 0, gap: STRIP_GAP },
	item: { alignItems: "center" },
	pressed: { opacity: 0.6 },
	cover: { backgroundColor: redline.surface },
	/**
	 * The ring is drawn INSIDE the cover's box (a border, not an outline) so a
	 * selected item does not change the row's metrics and shove its neighbours.
	 */
	coverActive: { borderWidth: 2, borderColor: redline.accent },
	name: {
		marginTop: 4,
		fontSize: 11,
		lineHeight: 13,
		fontWeight: "500",
		color: redline.ink2,
		textAlign: "center",
	},
	nameActive: { color: redline.accent, fontWeight: "700" },
});
