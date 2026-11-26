/**
 * The place block's geometry (phase378; above the card since phase379; set
 * down on it, larger, in phase380), asserted against the component's source.
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
import { FACTS_ROW, PLACE_ROW, ROW_GAP } from "./feed-page";

const BLOCK = readFileSync("components/feed/PlaceBlock.tsx", "utf8");

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
	 * 100 at 390: a 44pt place row (the 16pt line and the handoff's 44pt Map
	 * pill), 8, and a 48pt figures row (26pt figures over 13pt labels). The
	 * rows are declared in `theme/feed-page.ts`, which finds room for them per
	 * screen, so the two cannot drift.
	 */
	it("is 100 — two rows and the gap between", () => {
		expect(PLACE_ROW).toBe(44);
		expect(ROW_GAP).toBe(8);
		expect(FACTS_ROW).toBe(48);
		expect(CODE).toContain("minHeight: PLACE_ROW * k");
		expect(CODE).toContain("minHeight: FACTS_ROW * k");
		expect(CODE).toContain("marginTop: ROW_GAP * k");
		// The room above is the page's, not the block's.
		expect(CODE).not.toContain("paddingTop");
	});

	/**
	 * "增大上面的文字" (owner, 2026-11-24): the line 14 → 16, the figures 22 →
	 * 26, the labels 12 → 13 — as large as three figures across will go
	 * before most of the real rows have to shrink.
	 */
	it("sets the text larger than phase379 did", () => {
		expect(n("PLACE_SIZE")).toBe(16);
		expect(n("FIGURE_SIZE")).toBe(26);
		expect(n("LABEL_SIZE")).toBe(13);
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
	 * "Header left = existing card left + 8", the handoff's rule for anything
	 * above the card. Derived from the gutter, so it follows if that moves.
	 */
	it("insets 8 from each CARD edge, not from the screen", () => {
		expect(n("CARD_EDGE_INSET")).toBe(8);
		expect(CODE).toContain("const EDGE = GUTTER + CARD_EDGE_INSET;");
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
	it("never wraps; only the figures shrink to fit", () => {
		const texts = CODE.match(/<Text\b[\s\S]*?>/g) ?? [];
		const lines = CODE.match(/numberOfLines=\{1\}/g) ?? [];
		expect(lines).toHaveLength(texts.length);
		// The figure and its label — each alone in its column.
		expect(CODE.match(/adjustsFontSizeToFit/g) ?? []).toHaveLength(2);
		expect(n("FIGURE_MIN_SCALE")).toBeGreaterThanOrEqual(0.75);
		expect(n("LABEL_MIN_SCALE")).toBeGreaterThanOrEqual(0.75);
		expect(CODE.slice(CODE.indexOf("function sheet"))).not.toContain(
			"lineHeight",
		);
	});
});

describe("map control B", () => {
	/** The handoff's control, back at its own size beside a 16pt line. */
	it("is 84 x 44 at radius 22, and darkens when pressed", () => {
		expect(n("MAP_WIDTH")).toBe(84);
		expect(n("MAP_HEIGHT")).toBe(44);
		expect(n("MAP_HEIGHT")).toBe(PLACE_ROW);
		expect(n("MAP_RADIUS")).toBe(22);
		expect(n("MAP_GAP")).toBe(6);
		// A floor, not a fixed frame: the pill widens for a scaled label.
		expect(CODE).toContain("minWidth: MAP_WIDTH");
		expect(CODE).toContain("minHeight: MAP_HEIGHT");
		expect(CODE).toContain("mapPressed: { backgroundColor:");
	});

	/**
	 * The pin is a teardrop: one box, three corners rounded to half its width
	 * and the fourth sharp, turned 45° so the sharp one points down. 18 is
	 * the whole icon, not its head (owner, 2026-09-07: too big at 21.7).
	 */
	it("draws an 18-TALL teardrop pin", () => {
		expect(n("PIN_SIZE")).toBe(18);
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

/**
 * Owner, 2026-11-26, on the one-line link above the block: 「字太小 把现在的map
 * button替换掉吧」.
 */
/**
 * Owner, 2026-11-26: 「字体不统一 如果社区或者city名字长 前半部分就很小 想想办法」.
 * A place line that shrank beside the pill read as a different face.
 */
describe("the place row is one size", () => {
	it("draws the way back, the line and the pill at PLACE_SIZE, with no other size", () => {
		const body = CODE.slice(CODE.indexOf("function sheet(k: number)"));
		const row = body.slice(0, body.indexOf("factsRow: {"));
		const sizes = [...row.matchAll(/fontSize: (\w+) \* k/g)].map((m) => m[1]);
		expect(sizes.length).toBeGreaterThanOrEqual(3);
		expect(new Set(sizes)).toEqual(new Set(["PLACE_SIZE"]));
	});

	it("gives up the line's second half whole before a name loses a letter", () => {
		expect(n("REST_GIVES_WAY")).toBeGreaterThanOrEqual(100);
		expect(CODE).toContain(
			"restSlot: { flexShrink: REST_GIVES_WAY, minWidth: 0 }",
		);
		// Hidden, not cut: drawn only when it fits whole.
		expect(CODE).toContain("!fits && styles.unseen");
		expect(CODE).toContain("unseen: { opacity: 0 }");
	});
});

describe("the deck link takes the Map button's place", () => {
	it("is the same pill — Map's box, fill and label — with the words for the pin", () => {
		const pill = CODE.slice(CODE.indexOf("{deck !== undefined ? ("));
		const deck = pill.slice(0, pill.indexOf(") : onOpenMap !== undefined ? ("));
		expect(deck).toContain("styles.map, pressed && styles.mapPressed");
		expect(deck).toContain("style={styles.mapLabel}");
		expect(deck).not.toContain("pinBox");
	});

	it("is drawn INSTEAD of Map, never beside it", () => {
		expect(CODE).toContain(") : onOpenMap !== undefined ? (");
		expect(CODE).not.toContain("{onOpenMap !== undefined && (");
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
	 * community), Map, and a figure — and since phase404.5 the way into the
	 * card's own deck, which takes Map's place, and the way back on a place's
	 * page. Never one button around the block.
	 */
	it("wraps no shared button around the block", () => {
		expect(CODE.match(/<Pressable/g) ?? []).toHaveLength(5);
		const wrap = CODE.slice(CODE.indexOf("<View style={[styles.wrap"));
		expect(wrap.slice(0, 80)).not.toContain("Pressable");
	});

	/** A figure with nowhere to go is text: nothing dims under a finger. */
	it("makes a figure a control only when it opens something", () => {
		expect(CODE).toContain("onOpenCell !== undefined ? (");
	});
});
