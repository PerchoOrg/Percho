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
 * `zIndex: 100`; phase181 replaced both with `PlaceHeader`, which inherits the
 * same requirement — and inherits MORE of it, since the header now carries the
 * community strip and is the tallest thing above the stage it has ever been.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STACK = readFileSync("components/SwipeStack.tsx", "utf8");
const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");
const HEADER = readFileSync("components/feed/PlaceHeader.tsx", "utf8");

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

	it("the place header out-ranks it", () => {
		expect(zIndexOf(HEADER, "wrap")).toBeGreaterThan(
			zIndexOf(STACK, "stageClip"),
		);
	});

	/**
	 * The strip is the header's child, so it rides the header's z-index — but
	 * only while it stays inside it. This fails if someone lifts it out to the
	 * screen as a sibling of the stage without giving it a rank of its own.
	 */
	it("the community strip rides the header, not the screen", () => {
		expect(FEED).toContain("<CommunityStrip");
		const header = FEED.indexOf("<PlaceHeader");
		const strip = FEED.indexOf("<CommunityStrip");
		const close = FEED.indexOf("</PlaceHeader>");
		expect(header).toBeGreaterThan(-1);
		expect(strip).toBeGreaterThan(header);
		expect(strip).toBeLessThan(close);
	});

	/** The wordmark is gone (owner, 2026-09-05) — the page opens on the place. */
	it("has no wordmark row left to rank", () => {
		expect(FEED).not.toContain("chromeRow");
		expect(FEED).not.toContain(">Percho<");
	});
});
