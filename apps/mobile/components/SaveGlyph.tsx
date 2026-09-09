/**
 * The save control's mark, wherever it is drawn outside a feed card.
 *
 * ── Why this exists (phase260) ──────────────────────────────────────────────
 *
 * Every save affordance in the app calls the same `useSavedStore.toggle` and
 * lands in the same Saved tab, but they did not look like the same thing: the
 * three card faces drew a Phosphor BOOKMARK through `CardCorner`, while the
 * four explore surfaces — the community hero, the listing hero, the collapsed
 * app bar and the action dock — drew a typographic `♥` / `♡`.
 *
 * The owner hit exactly that seam: "Explore page has a heart button, same as
 * saved? Make them consistent".
 *
 * ── Why the bookmark won and not the heart ──────────────────────────────────
 *
 * The heart is already spoken for. On the web the rose heart is the **Like**
 * button, which writes `listing_likes` / `community_likes` — a different table
 * from the save, and a different promise. On the phone the equivalent of that
 * like is the right SWIPE, which teaches the feed. So a heart that saves makes
 * one shape mean two things across the product, and it is the ambiguity the
 * owner tripped over rather than a cosmetic mismatch.
 *
 * The bookmark says "kept, to come back to", which is what the store does.
 *
 * ── The state language is the card's ────────────────────────────────────────
 *
 * `CardCorner` signals saved by swapping the glyph's WEIGHT — outline when it
 * is not yours, fill when it is. That is the same one-bit change `♡` → `♥`
 * carried, so nothing about how the state reads is lost in the swap, and the
 * control now matches the card a tap away.
 *
 * `size` is per-surface on purpose: these discs are not all one size (36pt
 * glass on the heroes, 50pt on the dock), and each glyph is set to sit with the
 * typographic chrome beside it — the `←` / `↑` / `✕` those surfaces still draw.
 * Unifying THAT chrome is a separate job; this file only claims the save mark.
 */
import { RedlineIcon } from "./cards/redline/RedlineChrome";

interface SaveGlyphProps {
	/** Whether the item is in the buyer's Saved list — fills the bookmark. */
	saved: boolean;
	/** Nominal box, matched to the typographic glyphs on the same surface. */
	size: number;
	color: string;
}

export function SaveGlyph({ saved, size, color }: SaveGlyphProps) {
	return (
		<RedlineIcon
			name="bookmark"
			size={size}
			color={color}
			weight={saved ? "fill" : "outline"}
		/>
	);
}
