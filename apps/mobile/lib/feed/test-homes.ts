/**
 * Stand-in homes for a development bundle (phase404.4, `TEST_HOMES` in
 * `lib/listings-in-app.ts`).
 *
 * No neighbourhood with a film has a home in the database: the six listings
 * that exist are FMLS's sandbox rows, in other parts of Georgia. So that
 * "like a neighbourhood → its homes" can be tried before the licensed feed
 * arrives, those six are presented as the homes of whichever neighbourhood is
 * asked about. Every neighbourhood gets the same six — it is the flow that is
 * under test, not the inventory.
 *
 * Nothing here runs in a release bundle: the only source of `homes` is
 * `hooks/use-test-homes.ts`, which returns none unless `TEST_HOMES`.
 *
 * Pure: no react, no store, no clock.
 */
import type { CommunityCardV3, FeedCardV3, ListingCardV3 } from "./card-types";
import type { FeedPool } from "./generate-feed";
import type { PlaceFocus } from "./place-deck";

/** As much of a neighbourhood as a home card says about where it is. */
export type HomeOf = Pick<CommunityCardV3, "slug" | "name"> &
	Partial<Pick<CommunityCardV3, "county" | "geoUnitId">>;

/** The test homes, re-addressed to `community`: its name, county and city. */
export function standInHomes(
	homes: readonly ListingCardV3[],
	community: HomeOf,
): ListingCardV3[] {
	return homes.map((home) => {
		// Where the sandbox row really is would contradict the card above it.
		const {
			communityCounty: _county,
			geoUnitId: _unit,
			locality: _locality,
			zip: _zip,
			...rest
		} = home;
		return {
			...rest,
			communityId: community.slug,
			communityName: community.name,
			...(community.county ? { communityCounty: community.county } : {}),
			...(community.geoUnitId ? { geoUnitId: community.geoUnitId } : {}),
		};
	});
}

/**
 * `pool` with the test homes as `community`'s. The pool itself, by identity,
 * when there are none to add or no neighbourhood to give them to.
 */
export function withTestHomes(
	pool: FeedPool,
	community: HomeOf | undefined,
	homes: readonly ListingCardV3[],
): FeedPool {
	if (community === undefined || homes.length === 0) return pool;
	return { ...pool, listings: standInHomes(homes, community) };
}

/** The pool as `card` sees it: a neighbourhood's card, with the test homes as its own. */
export function poolAround(
	pool: FeedPool,
	card: FeedCardV3 | undefined,
	homes: readonly ListingCardV3[],
): FeedPool {
	return withTestHomes(
		pool,
		card?.kind === "community" ? card : undefined,
		homes,
	);
}

/** The same, for a place's own page: only a neighbourhood's has homes to stand in for. */
export function placePool(
	pool: FeedPool,
	focus: PlaceFocus,
	homes: readonly ListingCardV3[],
): FeedPool {
	if (focus.kind !== "community") return pool;
	return withTestHomes(
		pool,
		pool.communities.find((c) => c.slug === focus.id) ?? {
			slug: focus.id,
			name: focus.name,
		},
		homes,
	);
}
