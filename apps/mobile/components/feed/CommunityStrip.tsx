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
 */
import { memo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import type { CommunityCardV3 } from "../../lib/feed/card-types";
import { redline } from "../../theme/tokens";

/** Cover size. 56 fits five across a 393pt screen with the gutter showing. */
const COVER = 56;

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
						style={({ pressed }) => [styles.item, pressed && styles.pressed]}
					>
						<Image
							source={{ uri: c.heroUrl }}
							style={[styles.cover, active && styles.coverActive]}
						/>
						<Text
							style={[styles.name, active && styles.nameActive]}
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
	row: { paddingHorizontal: 16, gap: 10 },
	item: { width: COVER, alignItems: "center" },
	pressed: { opacity: 0.6 },
	cover: {
		width: COVER,
		height: COVER,
		borderRadius: 17,
		backgroundColor: redline.surface,
	},
	/**
	 * The ring is drawn INSIDE the cover's box (a border, not an outline) so a
	 * selected item does not change the row's metrics and shove its neighbours.
	 */
	coverActive: { borderWidth: 2, borderColor: redline.accent },
	name: {
		marginTop: 4,
		fontSize: 10,
		lineHeight: 12,
		fontWeight: "500",
		color: redline.ink2,
		width: COVER,
		textAlign: "center",
	},
	nameActive: { color: redline.accent, fontWeight: "700" },
});
