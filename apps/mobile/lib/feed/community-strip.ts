/**
 * The header strip's row of communities (phase181, owner pick "R3").
 *
 * Which neighbourhoods appear under the city title, in what order. Kept out of
 * the screen so the rules are testable — the strip itself only draws.
 *
 * Rules, and why:
 *   · **Toured only.** Tapping a face goes to that card; a photo-only community
 *     would land on a still that plays nothing. Same reason the feed's
 *     community pool is video-only.
 *   · **Scoped city first, then the rest.** Reordered, never filtered — the
 *     same treatment `preferScope` gives the deck (§1.3: scope ranks, it does
 *     not hide). A city with two toured communities still shows a full strip.
 *   · **De-duplicated by id.** The community pool recycles entries; the strip
 *     is a list of places, so one face per place.
 *   · **Capped.** A horizontal strip is a glance, not a directory; the scope
 *     sheet is where the full list lives.
 */
import type { CommunityCardV3 } from "./card-types";

/** How many faces the strip will draw. */
export const STRIP_CAP = 12;

export function communityStripItems(
	communities: readonly CommunityCardV3[],
	unitId: string | null,
	cap: number = STRIP_CAP,
): readonly CommunityCardV3[] {
	const seen = new Set<string>();
	const scoped: CommunityCardV3[] = [];
	const rest: CommunityCardV3[] = [];
	for (const c of communities) {
		if (c.videoUrl === undefined || seen.has(c.id)) continue;
		seen.add(c.id);
		(unitId !== null && c.geoUnitId === unitId ? scoped : rest).push(c);
	}
	return [...scoped, ...rest].slice(0, cap);
}
