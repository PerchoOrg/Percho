/**
 * The way into a place's own deck, on its Explore page (phase404.3):
 *
 *     More of Suwanee ›        a city → its neighbourhoods
 *     Homes in Edinburgh ›     a neighbourhood → its homes
 *
 * Owner, 2026-11-26, on `/demos/feed-focus-v2`: 「感觉放在explore page里比较好」.
 * The feed itself gains no control — it follows a like on its own
 * (`lib/feed/follow.ts`) — and "only this place" is asked for here, on the
 * page the buyer opened because the place interested them.
 *
 * Drawn only when the deck has something in it: it asks for the place's pool
 * (the request the deck itself makes, so the answer is already cached when the
 * page opens) and stays out of the page until a card comes back. No count.
 *
 * The Map control's material — the pale sage fill and the accent's ink — so
 * the page has one kind of "go somewhere else" button.
 */
import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useFeedPool } from "../../hooks/use-feed-pool";
import type { PlaceFocus } from "../../lib/feed/follow";
import { feedHeader } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const NONE: readonly string[] = [];

export function PlaceDeckLink({ focus }: { focus: PlaceFocus }) {
	const { pool } = useFeedPool({
		stage: 4,
		cities: NONE,
		likedCommunityIds: NONE,
		enabled: true,
		focus,
	});
	if (pool.communities.length + pool.listings.length === 0) return null;
	const label =
		focus.kind === "city" ? `More of ${focus.name}` : `Homes in ${focus.name}`;
	return (
		<Pressable
			onPress={() =>
				router.push({
					pathname: "/place",
					params: { kind: focus.kind, id: focus.id, name: focus.name },
				})
			}
			style={({ pressed }) => [styles.link, pressed && styles.pressed]}
			accessibilityRole="button"
			accessibilityLabel={label}
		>
			<Text style={styles.label} numberOfLines={1}>
				{label} ›
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	link: {
		marginTop: 14,
		minHeight: 44,
		borderRadius: 22,
		paddingHorizontal: 18,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: feedHeader.mapFill,
	},
	pressed: { backgroundColor: feedHeader.mapPressed },
	label: { ...textStyles.headline, color: feedHeader.accent },
});
