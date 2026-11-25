/**
 * One mark for one action: every save control in the app draws the bookmark.
 *
 * ── What this is guarding ───────────────────────────────────────────────────
 *
 * Seven controls call the same `useSavedStore.toggle` and land in the same
 * Saved tab. Three of them (the card faces, through `CardCorner`) drew a
 * Phosphor bookmark; the other four — the community hero, the listing hero,
 * the collapsed app bar and the action dock — drew a typographic `♥` / `♡`.
 *
 * The owner found the seam himself: "Explore page has a heart button, same as
 * saved? Make them consistent". phase260 did, on the bookmark — the heart is
 * already the web's **Like** button, a different table and a different promise,
 * so a heart that saves makes one shape mean two things. `SaveGlyph` carries
 * the full argument.
 *
 * Nothing in `tsc` can hold this: a glyph is a string, and `♡` typechecks
 * exactly as well as a bookmark. Asserted as source text, which is this
 * suite's idiom for a cross-file agreement (see `community-panel-fit`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	ICON_ART_WIDTH,
	OUTLINE_ART_WIDTH,
} from "../components/cards/redline/icon-font";

/** Every surface that draws the save control outside a feed card. */
const SURFACES = [
	"components/community/TourHero.tsx",
	"components/listing/explore/MediaCarousel.tsx",
	"components/listing/explore/CollapsedAppBar.tsx",
	"components/listing/explore/ActionDock.tsx",
];

/**
 * Source with comments removed.
 *
 * Load-bearing: the files that USED to draw a heart explain in prose that they
 * used to, and `SaveGlyph`'s own doc quotes both characters. A naive search
 * would fail on the documentation of the very change it is checking for.
 */
function code(path: string): string {
	return readFileSync(path, "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");
}

describe("the save control wears one mark (phase260)", () => {
	it.each(SURFACES)("%s draws SaveGlyph, not a typographic heart", (path) => {
		const src = code(path);
		expect(src).toContain("<SaveGlyph");
		expect(src).not.toMatch(/[♥♡]/);
	});

	it("SaveGlyph and the card's corner draw the SAME glyph", () => {
		// If these two ever diverge the app is back to two marks for one action,
		// which is the whole defect — and it would look deliberate on device.
		expect(code("components/SaveGlyph.tsx")).toContain('name="heart"');
		expect(code("components/cards/CardCorner.tsx")).toContain('name="heart"');
	});

	it("saved is signalled by WEIGHT, the way the card signals it", () => {
		// `♡` → `♥` was one bit; outline → fill is the same bit, so nothing about
		// how the state reads was traded away in the swap.
		expect(code("components/SaveGlyph.tsx")).toContain(
			'weight={saved ? "fill" : "outline"}',
		);
	});

	/**
	 * Saving must not resize the mark. The fill font is drawn 1.18× larger than
	 * the outline font, which is right for most glyphs and wrong for a toggle
	 * between two weights of one drawing: the saved heart came out bigger and
	 * clipped (owner, 2026-11-25). Both renderers must ask for the outline size,
	 * and that only works while the heart's bounds agree across the two fonts.
	 */
	it("draws the heart the same size saved and unsaved", () => {
		expect(ICON_ART_WIDTH.heart).toBe(OUTLINE_ART_WIDTH.heart);
		expect(code("components/SaveGlyph.tsx")).toContain("matchOutline");
		expect(code("components/cards/CardCorner.tsx")).toContain("matchOutline");
	});
});
