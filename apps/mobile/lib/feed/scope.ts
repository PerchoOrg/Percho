/**
 * The explicit community scope, applied to a pool (phase140).
 *
 * §1.3 is the rule this implements: "scope = 软排序信号, **非过滤**". So a scope
 * pick REORDERS the pool — the scoped city's communities and homes come first,
 * everything else follows — and nothing is ever dropped. Two reasons that is
 * the right shape here and a filter would not be:
 *
 *   1. Only a handful of communities in the whole pool have a finished tour,
 *      and the feed is video-only. Filtering the community slots to one city
 *      would empty them outright for most cities, so a scope pick would delete
 *      half the deck rather than focus it.
 *   2. The server's `cities` parameter, which does hard-filter the community
 *      query, is not involved at all — see DEVLOG 2026-08-30 for why that
 *      channel has never actually carried a value.
 *
 * A STABLE partition, not a sort: within each side the pool keeps the order the
 * server chose (video-first, popularity, the ranking already applied), so this
 * adds a preference without discarding one.
 *
 * Pure: no react, no store, no clock — same contract as the rest of `lib/feed`.
 */
import type { CommunityCardV3, ListingCardV3 } from "./card-types";
import type { FeedPool } from "./generate-feed";

function partition<T extends { geoUnitId?: string }>(
	items: readonly T[],
	unitId: string,
): readonly T[] {
	const inScope: T[] = [];
	const rest: T[] = [];
	for (const item of items) {
		(item.geoUnitId === unitId ? inScope : rest).push(item);
	}
	// Nothing matched — hand the original array back rather than an equal copy,
	// so an unmatched scope cannot invalidate a memo downstream.
	if (inScope.length === 0) return items;
	return [...inScope, ...rest];
}

/**
 * Order `pool` so the scoped unit's content leads. `unitId` of `null` (no scope
 * picked) returns the pool untouched, by identity.
 */
export function preferScope(pool: FeedPool, unitId: string | null): FeedPool {
	if (unitId === null) return pool;
	const listings = partition<ListingCardV3>(pool.listings, unitId);
	const communities = partition<CommunityCardV3>(pool.communities, unitId);
	if (listings === pool.listings && communities === pool.communities) return pool;
	return { ...pool, listings, communities };
}

/**
 * The cities the scope sheet offers, densest first — the pool's own city units,
 * which is the only list of places Percho has communities in.
 *
 * `communityCount` descending is the server's own ordering for `city_geo_units`
 * and the honest one here too: a city with 731 communities is more useful to a
 * buyer than one with 3, and neither is a recommendation.
 */
export function scopeChoices<T extends { level: string; communityCount: number }>(
	units: readonly T[],
	limit: number,
): readonly T[] {
	return units
		.filter((u) => u.level === "city")
		.slice()
		.sort((a, b) => b.communityCount - a.communityCount)
		.slice(0, limit);
}
