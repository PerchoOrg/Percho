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
/**
 * Space above the row, and the name row under each square.
 *
 * 10 → 24 on 2026-09-06 (owner: 「Add some space between text and
 * communities, communities and card, so we can reduce the empty space under
 * the card」). It comes straight out of the gap below the card: the squares
 * are already at their width ceiling on a big phone, so every point added here
 * is a point that band loses.
 */
export const STRIP_MARGIN_TOP = 24;
export const STRIP_NAME_ROW = 4 + 13;
/**
 * Below this a cover is a smudge, not a photograph of a neighbourhood — the
 * strip is dropped rather than drawn uselessly small.
 */
export const STRIP_MIN_COVER = 52;

/**
 * How the strip fits — its square size, and whether the names fit under them.
 *
 * `maxHeight` is what is left once the header's line, the card at its
 * uncropped height and the minimum gap are taken out. The degradation order
 * matters and is the point of this function:
 *
 *   1. squares at the width rule, with names under them;
 *   2. squares without names, if the names are what does not fit;
 *   3. no strip at all.
 *
 * Step 2 exists because step 3 is a cliff: on a 13 mini the name row was the
 * last 2pt, and dropping the whole strip for it left a 107pt hole where a row
 * of 67pt covers would have fitted. The film is never in this list — it is
 * pinned to the tour's aspect and everything here bends around it.
 */
export interface StripLayout {
	cover: number;
	withNames: boolean;
}

export function stripLayout(
	cardWidth: number,
	maxHeight: number,
): StripLayout | null {
	const byWidth = (cardWidth - 4 * STRIP_GAP) / STRIP_ACROSS;
	const named = Math.floor(
		Math.min(byWidth, maxHeight - STRIP_MARGIN_TOP - STRIP_NAME_ROW),
	);
	if (named >= STRIP_MIN_COVER) return { cover: named, withNames: true };
	const bare = Math.floor(Math.min(byWidth, maxHeight - STRIP_MARGIN_TOP));
	if (bare >= STRIP_MIN_COVER) return { cover: bare, withNames: false };
	return null;
}

/** The height the strip occupies — 0 when it does not render. */
export function stripHeight(layout: StripLayout | null): number {
	if (layout === null) return 0;
	return (
		STRIP_MARGIN_TOP + layout.cover + (layout.withNames ? STRIP_NAME_ROW : 0)
	);
}
