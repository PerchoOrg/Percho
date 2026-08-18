/**
 * Card icon vocabulary — shared because it now travels over the wire.
 *
 * ── Why this moved out of the mobile app ─────────────────────────────────────
 *
 * The names were `RedlineIconName` in
 * `apps/mobile/components/cards/redline/icon-font.ts`, which was right while an
 * icon was a purely client-side rendering decision: the server sent a `DimKey`,
 * the app decided which glyph a dim wears.
 *
 * The community card's "why people love it" tiles (owner picked layout E,
 * 2026-08-02) broke that assumption. Those tiles render a resident-stated
 * attribute VERBATIM — "Dog Friendly", "Peaceful" — and there are ~60 such
 * attributes against 11 dims, so the attribute→glyph decision has to live next
 * to the attribute table on the server (`lib/feed/community-reasons.ts`). The
 * name then has to cross the API boundary, and a string crossing the boundary
 * with no shared type is how a typo ships a tofu box.
 *
 * `RedlineIconName` is re-exported from `icon-font.ts` unchanged, so no card
 * face's imports moved.
 *
 * ── Adding a name here is NOT enough to draw it ─────────────────────────────
 *
 * The app ships a 14-glyph SUBSET of Phosphor Fill (5 KB, not 440 KB). A name
 * added here and to `ICON_GLYPH` but not re-subset renders BLANK on device and
 * nowhere else. Full procedure in `brand/icons/README.md`; short version:
 *
 *   1. add to `GLYPHS` in `scripts/icon-fonts/build-icon-font.py`
 *   2. add the same key to `ICON_GLYPH` in `icon-font.ts`
 *   3. add it to the union below
 *   4. `python3 scripts/icon-fonts/build-icon-font.py`
 *   5. `cd apps/mobile && npx vitest run theme/icon-font.test.ts`
 *
 * Step 5 fails loudly if the table and the .ttf disagree, so this cannot ship
 * silently broken.
 */

/**
 * Every glyph a card may ask for, as a runtime array.
 *
 * An array rather than a bare union because an icon name now arrives over the
 * wire: `apps/mobile/lib/feed/pool-dto.ts` has to REJECT a name the shipped
 * subset font cannot draw, and a `type` is erased at compile time so it cannot
 * validate anything. Declaring the array and deriving the union from it keeps
 * one source of truth — adding a name is a single edit and there is no way to
 * update one half and forget the other.
 *
 * The first fourteen are the set the owner picked on 2026-08-01 after reviewing
 * six libraries at true chip size. The last three were added 2026-08-02 for the
 * community card's resident reasons, each because the alternative was two
 * different claims wearing the same art:
 *
 *   `dog`         — "Dog Friendly", said by 35.8% of communities. No dim covers
 *                   it and no existing glyph reads as it; the nearest was `path`
 *                   (trails), which is a different claim entirely.
 *   `handshake`   — "Friendly" / "Welcoming" / "Neighbors" / "Community".
 *                   Would otherwise share `family` (users-three), so a tile
 *                   reading "Friendly" showed a family — asserting children
 *                   where residents only said the neighbours are nice.
 *   `shieldCheck` — "Safe", said by 41.4%. Would otherwise share `check`
 *                   (check-circle) with "Well Maintained", i.e. upkeep and
 *                   safety indistinguishable in the same row.
 */
export const CARD_ICON_NAMES = [
	'camera',
	'school',
	'tree',
	'walk',
	'family',
	'car',
	'yard',
	'sparkle',
	'moon',
	'path',
	'shop',
	'cup',
	'check',
	'expand',
	'dog',
	'handshake',
	'shieldCheck',
] as const;

/** Union form, derived so it can never drift from the array above. */
export type CardIconName = (typeof CARD_ICON_NAMES)[number];
