/**
 * The header's per-card place trail (phase182).
 *
 * The community strip is gone (owner, 2026-09-06: 「It makes the page not well
 * organized and immersive. Let's remove that section」), and this is what
 * replaces the connection it carried: as the buyer swipes, the header line
 * reads the TOP CARD's parent chain — metro for a city card, metro › city for
 * a community, metro › city › community for a home. The card itself is always
 * the chain's last, unwritten link.
 *
 * Every segment is real or absent (the `GeoStats` rule): a home whose
 * `communityId` the pool cannot resolve shows metro › city, not a placeholder —
 * `listings.community_id` is almost entirely unpopulated today (see
 * `apps/web/lib/feed/listing-gate.ts`), so that IS the common case until the
 * backfill lands.
 *
 * Returns null for a card with no place (trade-off) and for no card at all;
 * the header falls back to its scope line then.
 */
import type { CommunityCardV3, FeedCardV3 } from "./card-types";
import type { GeoUnit } from "./geo-unit";

export function placeTrail(
	card: FeedCardV3 | undefined,
	geoUnits: readonly GeoUnit[],
	communities: readonly CommunityCardV3[],
): readonly string[] | null {
	if (card === undefined) return null;
	switch (card.kind) {
		// The card IS the city — the metro alone is its parent chain.
		case "area":
			return [];
		case "community":
			return card.city ? [card.city] : [];
		case "listing": {
			const trail: string[] = [];
			const unit = geoUnits.find((u) => u.id === card.geoUnitId);
			if (unit !== undefined) trail.push(unit.name);
			const community = communities.find((c) => c.id === card.communityId);
			if (community !== undefined) trail.push(community.name);
			return trail;
		}
		case "tradeoff":
			return null;
	}
}
