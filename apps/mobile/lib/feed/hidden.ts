/**
 * Cards the buyer hid with the card's cross (phase414) never come back to a
 * deck: this takes them out of the pool a deck is dealt from.
 *
 * A filter, where a left swipe was only ever a soft downweight (§1.7: "hard
 * filtering under a swipe rhythm produces an empty feed"). That rule was about
 * a verdict every card got; the cross is one the buyer goes out of their way
 * to give, on a handful of cards.
 *
 * Only DEALING reads this. Search, the map and a place's own page still find a
 * hidden place — and so does everything that looks a card's place up in the
 * pool, which is why the pool itself is left whole.
 */
import type { FeedPool } from "./generate-feed";

export function withoutHidden(
	pool: FeedPool,
	hiddenIds: readonly string[],
): FeedPool {
	if (hiddenIds.length === 0) return pool;
	const hidden = new Set(hiddenIds);
	return {
		...pool,
		// A city's card is its unit under the composer's `area-` id.
		geoUnits: pool.geoUnits.filter((u) => !hidden.has(`area-${u.id}`)),
		communities: pool.communities.filter((c) => !hidden.has(c.id)),
		listings: pool.listings.filter((l) => !hidden.has(l.id)),
	};
}
