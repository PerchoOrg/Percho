/**
 * Anything the feed draws ABOVE the card stage must out-rank the stage's paper
 * band — asserted as text, the same way `listing-layout.test.ts` pins the
 * card's composition (the mobile vitest suite is deliberately
 * react-native-free, so these files are read rather than imported).
 *
 * ── The bug this exists to stop coming back ─────────────────────────────────
 *
 * `SwipeStack` paints `stageClip`: an OPAQUE band in the page's own paper
 * colour, positioned `top: -CLIP_OVERFLOW_PT` — 120pt above the stage — and no
 * ancestor clips it. Its job is to hide the behind-card's top edge and the
 * ~22pt elevation glow that rises past it, and it is generous on purpose. It
 * also carries `pointerEvents="none"`.
 *
 * So a sibling above the stage with a lower z-index is painted over but stays
 * tappable, which is not a subtle failure mode: on 2026-08-31 the owner found
 * the new scope crumb invisible while tapping the blank space still opened the
 * community list. The wordmark row has never had the problem only because it
 * sets `zIndex: 100`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STACK = readFileSync("components/SwipeStack.tsx", "utf8");
const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");
const CRUMB = readFileSync("components/feed/ScopeCrumb.tsx", "utf8");

/**
 * The `zIndex: N` DECLARED inside a named style block.
 *
 * Comments are stripped first, and that is not defensive tidiness: the first
 * draft of this file matched the prose in `ScopeCrumb`'s own doc block, which
 * cites `zIndex: 100` by name — so the test passed with the declaration
 * deleted. A source-text assertion that a comment can satisfy asserts nothing.
 */
function zIndexOf(source: string, styleName: string): number {
	const start = source.indexOf(`${styleName}: {`);
	expect(start, `${styleName} not found`).toBeGreaterThan(-1);
	const block = source
		.slice(start, source.indexOf("},", start))
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");
	const match = block.match(/zIndex:\s*(\d+)/);
	expect(match, `${styleName} declares no zIndex`).not.toBeNull();
	return Number(match?.[1]);
}

describe("feed chrome sits above the stage's paper band", () => {
	it("the band is opaque, unclipped and reaches above the stage", () => {
		// If any of these three stop being true the rule below is unnecessary —
		// and this test should be deleted rather than quietly kept passing.
		expect(STACK).toContain("backgroundColor: colors.bg");
		expect(STACK).toContain("top: -CLIP_OVERFLOW_PT");
		expect(STACK).toContain('pointerEvents="none"');
	});

	it("the wordmark row out-ranks it", () => {
		expect(zIndexOf(FEED, "chromeRow")).toBeGreaterThan(
			zIndexOf(STACK, "stageClip"),
		);
	});

	it("the scope crumb out-ranks it", () => {
		expect(zIndexOf(CRUMB, "wrap")).toBeGreaterThan(
			zIndexOf(STACK, "stageClip"),
		);
	});
});
