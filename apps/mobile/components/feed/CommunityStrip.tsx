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
 * The square's size is not this component's decision — the feed solves it
 * (`coverSize` in `lib/feed/community-strip.ts`) because it depends on the
 * height the card leaves over, and the card is never allowed to shrink for it.
 * This just draws at the size it is handed.
 */
import { memo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import type { CommunityCardV3 } from "../../lib/feed/card-types";
import { STRIP_GAP, STRIP_MARGIN_TOP } from "../../lib/feed/community-strip";
import { redline } from "../../theme/tokens";

interface CommunityStripProps {
	communities: readonly CommunityCardV3[];
	/** The community the deck is on, if it is on one. */
	activeId: string | null;
	/** Solved by the feed; null when the page has no room for the strip. */
	cover: number | null;
	/** The card's width — the run must not exceed it (owner, 2026-09-06). */
	cardWidth: number;
	/** The card's inset from the screen edge, so the row starts on its edge. */
	cardInset: number;
	onPick: (community: CommunityCardV3) => void;
}

export const CommunityStrip = memo(function CommunityStrip({
	communities,
	activeId,
	cover,
	cardWidth,
	cardInset,
	onPick,
}: CommunityStripProps) {
	if (communities.length === 0 || cover === null) return null;
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={[styles.row, { paddingLeft: cardInset }]}
			// The run ends on the card's right edge, not the screen's: the strip
			// belongs to the card's column (owner, 2026-09-06).
			style={[styles.scroll, { width: cardWidth + cardInset }]}
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
	scroll: { marginTop: STRIP_MARGIN_TOP, flexGrow: 0, alignSelf: "flex-start" },
	/** No right padding: the half square must reach the card's right edge. */
	row: { paddingRight: 0, gap: STRIP_GAP },
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
