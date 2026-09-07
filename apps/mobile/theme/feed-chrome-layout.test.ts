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
 * community list. The wordmark row never had the problem only because it set
 * `zIndex: 100`; every header since has inherited the requirement —
 * `PlaceHeader` (phase181) and now `FeedHeader` (phase183), which raises the
 * stakes: its Map pill is the first real BUTTON the feed has drawn above the
 * stage, so an unranked header would leave a control that cannot be seen but
 * can be pressed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STACK = readFileSync("components/SwipeStack.tsx", "utf8");
const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");
const HEADER = readFileSync("components/feed/FeedHeader.tsx", "utf8");

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

	it("the feed header out-ranks it", () => {
		expect(zIndexOf(HEADER, "wrap")).toBeGreaterThan(
			zIndexOf(STACK, "stageClip"),
		);
	});

	/**
	 * Every row rides that one rank, because the header has a single ranked
	 * root and the screen draws nothing of its own up there. This fails if
	 * someone lifts a row out to the feed as a sibling of the stage without
	 * giving it a rank — the exact 2026-08-31 bug, one row higher.
	 */
	it("every header row rides that one rank", () => {
		expect(HEADER).toContain("<View style={styles.wrap}>");
		expect(FEED).toContain("<FeedHeader");
		expect(FEED.indexOf("<FeedHeader")).toBeLessThan(
			FEED.indexOf("styles.stackWrap"),
		);
		expect(FEED).not.toContain("zIndex: 100");
	});
});
