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

/**
 * The size of one square (owner, 2026-09-06, twice).
 *
 * First: 「maybe 4.5 squares making full width, and we swipe for more」 — the
 * half square is the affordance, because a row that ends flush at the edge
 * looks finished and nobody swipes a finished row.
 *
 * Then, on seeing it: 「4.5 communities preview full width is not accurate, it
 * should not exceed card width」 and 「Don't cut film」 — so the run is the
 * CARD's width, not the screen's:
 *
 *     4 × (size + GAP) + size / 2 = cardWidth
 *
 * and the answer is capped by the height the page can actually spare. That cap
 * is the whole point of this function: the card is pinned to the tour's shape
 * (`theme/card-frame.ts`) and must never be squeezed, so when a screen is short
 * it is the SQUARES that give, not the film. On a 428pt phone the width rule
 * wins (79pt squares); on a 393 the height rule does (~63); on an SE there is
 * nothing left and the strip does not render at all.
 *
 * Lives here rather than in the component because the layout tests
 * (`theme/card-aspect.test.ts`) need it and the mobile vitest suite imports no
 * RN runtime.
 */
export const STRIP_GAP = 10;
export const STRIP_ACROSS = 4.5;
/** Space above the row, and the name row under each square. */
export const STRIP_MARGIN_TOP = 10;
export const STRIP_NAME_ROW = 4 + 13;
/**
 * Below this a cover is a smudge, not a photograph of a neighbourhood — the
 * strip is dropped rather than drawn uselessly small.
 */
export const STRIP_MIN_COVER = 52;

/**
 * The square's size, or null when the page has no room for the strip at all.
 *
 * `maxHeight` is what is left for the whole strip once the header's type, the
 * card at its uncropped height and the minimum gap are taken out.
 */
export function coverSize(cardWidth: number, maxHeight: number): number | null {
	const byWidth = (cardWidth - 4 * STRIP_GAP) / STRIP_ACROSS;
	const byHeight = maxHeight - STRIP_MARGIN_TOP - STRIP_NAME_ROW;
	const size = Math.floor(Math.min(byWidth, byHeight));
	return size >= STRIP_MIN_COVER ? size : null;
}

/** The height the strip occupies at that size — 0 when it does not render. */
export function stripHeight(cover: number | null): number {
	return cover === null ? 0 : STRIP_MARGIN_TOP + cover + STRIP_NAME_ROW;
}
