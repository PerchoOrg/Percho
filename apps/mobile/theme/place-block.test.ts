/**
 * The place block's geometry (phase378, above the card since phase379),
 * asserted against the component's source.
 *
 * Read as text rather than rendered, the same way `listing-layout.test.ts`
 * pins the card's composition: the mobile vitest suite is deliberately
 * react-native-free (`vitest.config.ts`), so a number that lives in a
 * `StyleSheet` can only be checked this way. What the model DECIDES is tested
 * for real in `lib/feed/place-block.test.ts`, and what the block's height
 * costs the film in `theme/card-aspect.test.ts`; this file guards the drawing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const BLOCK = readFileSync("components/feed/PlaceBlock.tsx", "utf8");
const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");

/**
 * The block with its comments stripped. Not tidiness: the component's own
 * doc blocks quote the numbers and the words this file looks for ("no border
 * and no shadow", "36pt"), so a match against the raw text can be satisfied
 * by prose alone, with the declaration deleted.
 */
const CODE = BLOCK.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Every `const NAME = <number>;` declared at the top level of the block. */
function constants(source: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const m of source.matchAll(/^const ([A-Z_]+) = ([\d.]+);$/gm)) {
		if (m[1] !== undefined && m[2] !== undefined) out[m[1]] = Number(m[2]);
	}
	return out;
}

const C = constants(BLOCK);

function n(name: string): number {
	const value = C[name];
	expect(value, `${name} not declared in PlaceBlock.tsx`).toBeDefined();
	return value ?? Number.NaN;
}

describe("the block's rows", () => {
	/**
	 * 86 at 390: 10 of room above, the 32pt place row, a 4pt gap and the 40pt
	 * figures row — the header's own total, so the card did not move when the
	 * block replaced it (owner, picking "numbers above the card": "same spot,
	 * same height"). `theme/card-aspect.test.ts` spends this number.
	 */
	it("is 86 — two rows, one gap, and the room above", () => {
		expect(n("PAD_TOP")).toBe(10);
		expect(n("PLACE_ROW")).toBe(32);
		expect(n("ROW_GAP")).toBe(4);
		expect(n("FACTS_ROW")).toBe(40);
		expect(n("PAD_TOP") + n("PLACE_ROW") + n("ROW_GAP") + n("FACTS_ROW")).toBe(
			86,
		);
		expect(CODE).toContain("paddingTop: PAD_TOP * k");
		expect(CODE).toContain("minHeight: PLACE_ROW * k");
		expect(CODE).toContain("minHeight: FACTS_ROW * k");
		expect(CODE).toContain("marginTop: ROW_GAP * k");
	});

	/**
	 * `minHeight`, never `height`: a larger system text size grows a row
	 * instead of clipping it, and a row with no text yet is as tall as a full
	 * one, so nothing moves when the first card lands.
	 */
	it("lets the rows grow rather than clip", () => {
		expect(CODE).not.toMatch(/\bheight: (PLACE_ROW|FACTS_ROW)/);
		expect(CODE).not.toContain("allowFontScaling={false}");
	});

	/**
	 * "Header left = existing card left + 8", as the header was. The card's
	 * left is `GUTTER` in `feed.tsx`, so the inset is derived from it — this
	 * fails if the gutter moves and the block stays put.
	 */
	it("insets 8 from each CARD edge, not from the screen", () => {
		const gutter = FEED.match(/^const GUTTER = (\d+);$/m)?.[1];
		expect(gutter, "GUTTER not found in app/(tabs)/feed.tsx").toBeDefined();
		expect(n("CARD_EDGE_INSET")).toBe(8);
		expect(CODE).toContain(`const EDGE = ${gutter} + CARD_EDGE_INSET;`);
		expect(CODE).toContain("paddingHorizontal: EDGE * k");
	});

	/**
	 * Every dimension is × the screen's own factor (owner decision 5 of the
	 * header, carried over), so the proportion approved at 390 holds
	 * everywhere. The sheet is therefore a factory, and a number that forgot
	 * its `* k` is the failure this catches.
	 */
	it("scales every dimension with the screen", () => {
		expect(CODE).toContain("function sheet(k: number)");
		expect(CODE).toContain("headerScale(width)");
		expect(CODE).toContain("useMemo(() => sheet(k), [k])");
		const body = CODE.slice(CODE.indexOf("function sheet(k: number)"));
		const bare = [
			...body.matchAll(
				/\b(width|height|minWidth|minHeight|fontSize|lineHeight|margin\w*|padding\w*|borderRadius|letterSpacing|gap|top|left):\s*([\d.]+)\s*[,}]/g,
			),
		].filter((m) => Number(m[2]) !== 0);
		expect(bare.map((m) => `${m[1]}: ${m[2]}`)).toEqual([]);
	});

	/**
	 * Never a second line: every text is one line, and a long one gives up
	 * its SIZE before its tail (owner, 2026-09-07: 「Don't cut the community
	 * name if it is too long, use smaller size instead」). An explicit
	 * `lineHeight` would defeat that — iOS clips auto-shrunk text against one.
	 */
	it("never wraps, and shrinks a long line before cutting it", () => {
		const texts = CODE.match(/<Text\b[^>]*>/g) ?? [];
		const lines = CODE.match(/numberOfLines=\{1\}/g) ?? [];
		// The place line's inner run inherits its parent's one line.
		expect(lines).toHaveLength(texts.length - 1);
		expect(CODE.match(/adjustsFontSizeToFit/g) ?? []).toHaveLength(3);
		expect(n("PLACE_MIN_SCALE")).toBeGreaterThanOrEqual(0.75);
		expect(n("LABEL_MIN_SCALE")).toBeGreaterThanOrEqual(0.75);
		expect(CODE.slice(CODE.indexOf("function sheet"))).not.toContain(
			"lineHeight",
		);
	});
});

describe("map control B", () => {
	/**
	 * The handoff's control at the place line's height — 72 × 32 at radius 16,
	 * as option 1 of `/demos/feed-above-card-v1` drew it beside a 14pt line —
	 * with its touch target brought back to 44 by `hitSlop`.
	 */
	it("is a 72 x 32 pill at the line's height, and darkens when pressed", () => {
		expect(n("MAP_WIDTH")).toBe(72);
		expect(n("MAP_HEIGHT")).toBe(n("PLACE_ROW"));
		expect(n("MAP_RADIUS")).toBe(n("MAP_HEIGHT") / 2);
		// A floor, not a fixed frame: the pill widens for a scaled label.
		expect(CODE).toContain("minWidth: MAP_WIDTH");
		expect(CODE).toContain("minHeight: MAP_HEIGHT");
		expect(CODE).toContain("mapPressed: { backgroundColor:");
	});

	it("gives its touch target back its 44", () => {
		expect(CODE).toContain("const PLACE_SLOP = { top: 8, bottom: 4 };");
		expect(n("MAP_HEIGHT") + 8 + 4).toBe(44);
		expect(CODE).toContain("const CELL_SLOP = { bottom: 4 };");
		expect(n("FACTS_ROW") + 4).toBe(44);
	});

	/**
	 * The pin is a teardrop: one box, three corners rounded to half its width
	 * and the fourth sharp, turned 45° so the sharp one points down. Sized by
	 * the whole icon, not its head (owner, 2026-09-07: too big at 21.7).
	 */
	it("draws a teardrop pin sized by the whole icon", () => {
		expect(n("PIN_SIZE")).toBeLessThan(n("MAP_HEIGHT") / 2);
		expect(CODE).toContain("const PIN_HEAD = PIN_SIZE / PIN_TIP_RATIO;");
		expect(CODE).toContain("height: PIN_SIZE * k");
		expect(n("PIN_STROKE")).toBeLessThan(1.75);
		expect(CODE).toContain("borderTopLeftRadius: (PIN_HEAD / 2) * k");
		expect(CODE).toContain("borderBottomRightRadius: 0");
		expect(CODE).toContain('transform: [{ rotate: "45deg" }]');
	});

	/** Exactly the word. Not "MAP", not an icon-only button. */
	it("says Map", () => {
		expect(CODE).toMatch(/>\s*Map\s*<\/Text>/);
	});

	/** Laid out before the place line, so a long line cannot push it off. */
	it("is never squeezed by the place line", () => {
		const map = CODE.slice(CODE.indexOf("\t\tmap: {"));
		expect(map.slice(0, map.indexOf("},"))).toContain("flexShrink: 0");
	});
});

describe("what the block must not become", () => {
	/**
	 * The header this replaced said the card's name again, at 36pt (owner,
	 * 2026-11-23: "信息本身也和卡片有重合"). The block has no title face and no
	 * slot for one — and none of what earlier headers carried.
	 */
	it("has no title, wordmark or community count", () => {
		expect(CODE).not.toContain("DM_SERIF_FONT");
		expect(CODE).not.toContain("model.title");
		expect(CODE).not.toContain("Percho");
		expect(CODE).not.toContain("communityCount");
		expect(CODE).not.toContain("Scope");
	});

	/** No panel, no border, no shadow — the block is on the page's paper. */
	it("draws no container", () => {
		expect(CODE).not.toContain("shadow");
		expect(CODE).not.toContain("elevation");
		const wrap = CODE.slice(CODE.indexOf("wrap: {"));
		expect(wrap.slice(0, wrap.indexOf("},"))).not.toMatch(/border/);
		expect(CODE.match(/backgroundColor: colors\.\w+/g)).toEqual([
			"backgroundColor: colors.bg",
		]);
	});

	/**
	 * Separate controls, each its own target: the place line (a home's
	 * community), Map, and a figure. Never one button around the block.
	 */
	it("wraps no shared button around the block", () => {
		expect(CODE.match(/<Pressable/g) ?? []).toHaveLength(3);
		const wrap = CODE.slice(CODE.indexOf("<View style={[styles.wrap"));
		expect(wrap.slice(0, 80)).not.toContain("Pressable");
	});

	/** A figure with nowhere to go is text: nothing dims under a finger. */
	it("makes a figure a control only when it opens something", () => {
		expect(CODE).toContain("onOpenCell !== undefined ? (");
	});
});
