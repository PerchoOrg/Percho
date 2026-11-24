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
 * community list. Every header since has carried `zIndex: 100` — `PlaceHeader`
 * (phase181), `FeedHeader` (phase183) and now `PlaceBlock` (phase379), whose
 * Map pill and three figures are all buttons: an unranked block would leave
 * four controls that cannot be seen but can be pressed.
 *
 * The offline bar sits above the block, and the band's top reaches it too.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STACK = readFileSync("components/SwipeStack.tsx", "utf8");
const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");
const BLOCK = readFileSync("components/feed/PlaceBlock.tsx", "utf8");
const OFFLINE = readFileSync("components/feed/OfflineBar.tsx", "utf8");

/**
 * The `zIndex: N` DECLARED inside a named style block.
 *
 * Comments are stripped first, and that is not defensive tidiness: the first
 * draft of this file matched the prose in the header's own doc block, which
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

	it("the place block out-ranks it", () => {
		expect(zIndexOf(BLOCK, "wrap")).toBeGreaterThan(
			zIndexOf(STACK, "stageClip"),
		);
	});

	it("the offline bar out-ranks it", () => {
		expect(zIndexOf(OFFLINE, "bar")).toBeGreaterThan(
			zIndexOf(STACK, "stageClip"),
		);
	});

	/**
	 * Every row rides that one rank, because the block has a single ranked
	 * root and the screen draws nothing of its own up there. This fails if
	 * someone lifts a row out to the feed as a sibling of the stage without
	 * giving it a rank — the exact 2026-08-31 bug, one row higher.
	 */
	it("every row of the block rides that one rank", () => {
		expect(BLOCK).toContain("<View style={styles.wrap}>");
		expect(FEED).toContain("<PlaceBlock");
		expect(FEED).not.toContain("<FeedHeader");
		expect(FEED.indexOf("<PlaceBlock")).toBeLessThan(
			FEED.indexOf("styles.stackWrap"),
		);
		expect(FEED).not.toContain("zIndex: 100");
	});
});
