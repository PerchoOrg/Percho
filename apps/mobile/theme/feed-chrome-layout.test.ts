/**
 * How the feed's layers stack — asserted as text, the same way
 * `listing-layout.test.ts` pins the card's composition (the mobile vitest
 * suite is deliberately react-native-free, so these files are read rather
 * than imported).
 *
 * ── The bug this exists to stop coming back ─────────────────────────────────
 *
 * `SwipeStack` paints `stageClip`: an OPAQUE band in the page's own paper
 * colour, positioned `top: -CLIP_OVERFLOW_PT` — 120pt above the stage — and no
 * ancestor clips it. Its job is to hide the behind-card's top edge and the
 * ~22pt elevation glow that rises past it, and it is generous on purpose. It
 * also carries `pointerEvents="none"`.
 *
 * So anything drawn above the stage with a lower rank is painted over but
 * stays tappable: on 2026-08-31 the owner found the scope crumb invisible
 * while tapping the blank space still opened the community list. Every header
 * since has had to out-rank the band.
 *
 * phase378 took the header away — the card now starts under the status bar,
 * with the place block UNDER it — which leaves two rules:
 *
 *   · the offline bar is the one thing still drawn above the stage, and the
 *     stage is now ranked itself (below), so the bar has to out-rank both;
 *   · the stage out-ranks the place block, so a card being dragged passes
 *     over those lines rather than behind them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STACK = readFileSync("components/SwipeStack.tsx", "utf8");
const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");
const OFFLINE = readFileSync("components/feed/OfflineBar.tsx", "utf8");
const BLOCK = readFileSync("components/feed/PlaceBlock.tsx", "utf8");

/** A named style block with its comments stripped — a source-text assertion
 * that a comment can satisfy asserts nothing. */
function styleBlock(source: string, styleName: string): string {
	const start = source.indexOf(`${styleName}: {`);
	expect(start, `${styleName} not found`).toBeGreaterThan(-1);
	return source
		.slice(start, source.indexOf("},", start))
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");
}

/** The `zIndex: N` DECLARED inside a named style block. */
function zIndexOf(source: string, styleName: string): number {
	const match = styleBlock(source, styleName).match(/zIndex:\s*(\d+)/);
	expect(match, `${styleName} declares no zIndex`).not.toBeNull();
	return Number(match?.[1]);
}

describe("the feed's layers", () => {
	it("the band is opaque, unclipped and reaches above the stage", () => {
		// If any of these three stop being true the offline bar's rank is
		// unnecessary — and that test should be deleted rather than quietly
		// kept passing.
		expect(STACK).toContain("backgroundColor: colors.bg");
		expect(STACK).toContain("top: -CLIP_OVERFLOW_PT");
		expect(STACK).toContain('pointerEvents="none"');
	});

	it("the offline bar out-ranks the stage and its band", () => {
		const bar = zIndexOf(OFFLINE, "bar");
		expect(bar).toBeGreaterThan(zIndexOf(FEED, "stackWrap"));
		expect(bar).toBeGreaterThan(zIndexOf(STACK, "stageClip"));
		expect(FEED.indexOf("<OfflineBar")).toBeLessThan(
			FEED.indexOf("styles.stackWrap,"),
		);
	});

	/**
	 * Nothing else is drawn up there. A header coming back above the card —
	 * the thing the owner had removed — would also come back unranked.
	 */
	it("draws nothing else above the card", () => {
		expect(FEED).not.toContain("<FeedHeader");
		const above = FEED.slice(
			FEED.indexOf("<SafeAreaView"),
			FEED.indexOf("styles.stackWrap,"),
		);
		expect(above.match(/<[A-Z]\w+/g)).toEqual([
			"<SafeAreaView",
			"<OfflineBar",
			"<View",
			"<View",
		]);
	});

	it("the place block sits under the stage, and a dragged card passes over it", () => {
		expect(FEED.indexOf("<PlaceBlock")).toBeGreaterThan(
			FEED.indexOf("styles.stackWrap,"),
		);
		expect(zIndexOf(FEED, "stackWrap")).toBeGreaterThan(0);
		expect(styleBlock(BLOCK, "wrap")).not.toContain("zIndex");
	});
});
