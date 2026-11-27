/**
 * The way into a place's own deck, on its Explore page (phase404.3):
 *
 *     Communities ›     a city → its neighbourhoods
 *     Homes ›           a neighbourhood → its homes
 *
 * Owner, 2026-11-26, on `/demos/feed-focus-v2`: 「感觉放在explore page里比较好」 —
 * "only this place" is asked for here, on the page the buyer opened because
 * the place interested them, as well as on the place's card in the feed.
 *
 * Drawn only when the deck has something in it: it asks for the place's pool
 * (the request the deck itself makes, so the answer is already cached when the
 * page opens) and stays out of the page until a card comes back — so on a
 * neighbourhood's page it draws nothing in a build without homes. No count.
 *
 * The same words sit above the place's card on the feed (`app/(tabs)/feed.tsx`).
 *
 * The Map control's material — the pale sage fill and the accent's ink — so
 * the page has one kind of "go somewhere else" button.
 */
import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { primePlacePool, useFeedPool } from "../../hooks/use-feed-pool";
import { useTestHomes } from "../../hooks/use-test-homes";
import {
	type PlaceFocus,
	type SwipeHistory,
	placeDeck,
	placeLinkAccessibilityLabel,
	placeLinkLabel,
} from "../../lib/feed/place-deck";
import { placePool } from "../../lib/feed/test-homes";
import { feedHeader } from "../../theme/tokens";
import { textStyles } from "../../theme/typography";

const NONE: readonly string[] = [];
/** Whether there is a deck at all does not depend on what was swiped. */
const NO_HISTORY: SwipeHistory = {
	seenIds: new Set(),
	passedIds: new Set(),
};

export function PlaceDeckLink({ focus }: { focus: PlaceFocus }) {
	const { pool } = useFeedPool({
		stage: 4,
		cities: NONE,
		likedCommunityIds: NONE,
		enabled: true,
		focus,
	});
	const testHomes = useTestHomes();
	const deck = placeDeck(
		placePool(pool, focus, testHomes),
		focus.kind,
		NO_HISTORY,
	);
	if (deck.length === 0) return null;
	const label = placeLinkLabel(focus);
	return (
		<Pressable
			onPress={() => {
				// The answer this button was drawn from is the page's first pool.
				primePlacePool(focus, pool);
				router.push({
					pathname: "/place",
					params: { kind: focus.kind, id: focus.id, name: focus.name },
				});
			}}
			style={({ pressed }) => [styles.link, pressed && styles.pressed]}
			accessibilityRole="button"
			accessibilityLabel={placeLinkAccessibilityLabel(focus)}
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
