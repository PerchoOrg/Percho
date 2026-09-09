/**
 * The above-card header's geometry (phase183) — the handoff's §2 table and its
 * §4 map control, asserted against the component's source.
 *
 * Read as text rather than rendered, the same way `listing-layout.test.ts`
 * pins the card's composition: the mobile vitest suite is deliberately
 * react-native-free (`vitest.config.ts`), so a number that lives in a
 * `StyleSheet` can only be checked this way. What the model DECIDES is tested
 * for real in `lib/feed/feed-header.test.ts`; this file guards the numbers the
 * page's height budget depends on.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HEADER = readFileSync("components/feed/FeedHeader.tsx", "utf8");
const FEED = readFileSync("app/(tabs)/feed.tsx", "utf8");

/**
 * The header with its comments stripped.
 *
 * Not tidiness — `feed-chrome-layout.test.ts` learned this the hard way: the
 * component's own doc blocks quote the numbers and the words this file looks
 * for ("no border and no shadow", "elevation glow", "wordmark"), so a match
 * against the raw text can be satisfied by prose alone, with the declaration
 * deleted.
 */
const CODE = HEADER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Every `const NAME = <number>;` declared at the top level of the header. */
function constants(source: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const m of source.matchAll(/^const ([A-Z_]+) = ([\d.]+);$/gm)) {
		if (m[1] !== undefined && m[2] !== undefined) out[m[1]] = Number(m[2]);
	}
	return out;
}

const C = constants(HEADER);

function n(name: string): number {
	const value = C[name];
	expect(value, `${name} not declared in FeedHeader.tsx`).toBeDefined();
	return value ?? Number.NaN;
}

describe("the header's height budget", () => {
	/**
	 * 86 (2026-09-07): 20 of room above, an 18pt context row, a 4pt gap and
	 * the 44pt main row. It was 98 — 12 + 18 + 4 + 44 + 4 + 16 — and the
	 * uppercase type row went, with 8 of its 20 points moving to the top
	 * padding and 12 going back to the card's stage.
	 *
	 * This is the number `theme/card-aspect.test.ts` spends against: if a row
	 * grows here, that file measures what it costs the film.
	 */
	it("is 86 — two rows, one gap, and the room above", () => {
		expect(n("PAD_TOP")).toBe(20);
		expect(n("CONTEXT_ROW")).toBe(18);
		expect(n("ROW_GAP")).toBe(4);
		expect(n("MAIN_ROW")).toBe(44);
		expect(n("PAD_TOP") + n("CONTEXT_ROW") + n("ROW_GAP") + n("MAIN_ROW")).toBe(
			86,
		);
	});

	/**
	 * The type row is gone by name (owner, 2026-09-07: 「Remove the community,
	 * home and tradeoff text from header」). The card's own badge says what
	 * kind of card it is; the header saying it again was the third row.
	 */
	it("draws no card-type row", () => {
		expect(C.TYPE_ROW).toBeUndefined();
		expect(CODE).not.toContain("typeLabel");
		expect(CODE).not.toContain("HOME TOUR");
	});

	/**
	 * "Header left = existing card left + 8". The card's left is `GUTTER` in
	 * `feed.tsx`, so the header's inset has to be derived from it — this fails
	 * if the gutter moves and the header stays put.
	 */
	it("insets 8 from each CARD edge, not from the screen", () => {
		const gutter = FEED.match(/^const GUTTER = (\d+);$/m)?.[1];
		expect(gutter, "GUTTER not found in app/(tabs)/feed.tsx").toBeDefined();
		expect(n("CARD_EDGE_INSET")).toBe(8);
		expect(CODE).toContain(`const EDGE = ${gutter} + CARD_EDGE_INSET;`);
	});

	/**
	 * Rows carry `minHeight`, so a larger system text size grows the header
	 * instead of clipping it (handoff §6 — scaling is never disabled). The
	 * `flex: 1` stage below gives up the difference; nothing overlaps.
	 */
	it("lets the rows grow rather than clip", () => {
		expect(CODE).toContain("minHeight: CONTEXT_ROW * k");
		expect(CODE).toContain("minHeight: MAIN_ROW * k");
		expect(CODE).not.toContain("allowFontScaling={false}");
	});

	/**
	 * 「area和city上面有些空间 不是完全顶头 但是也不要太大」 (2026-09-06), then
	 * 「move header a little down」 (2026-09-07) — 12 became 20, out of the type
	 * row's 20. It is paid for, not borrowed from the card.
	 */
	it("puts the room above the context row, not below the header", () => {
		expect(CODE).toContain("paddingTop: PAD_TOP * k");
	});

	/**
	 * Decision 5: every dimension is × the screen's own factor, so the
	 * proportion approved at 390 holds everywhere. The sheet is therefore a
	 * factory, and a number that forgot its `* k` is the failure this catches.
	 */
	it("scales every dimension with the screen", () => {
		expect(CODE).toContain("function sheet(k: number)");
		expect(CODE).toContain("headerScale(width)");
		expect(CODE).toContain("useMemo(() => sheet(k), [k])");
		// Every numeric style value in the sheet reads `<CONST> * k`, or is a
		// zero / an opacity / a zIndex. Anything else is a size that will not
		// scale — the one mistake this factory makes easy.
		const body = CODE.slice(CODE.indexOf("function sheet(k: number)"));
		const bare = [
			...body.matchAll(
				/\b(width|height|minWidth|minHeight|fontSize|lineHeight|margin\w*|padding\w*|borderRadius|border\w*Width|letterSpacing|gap|top|left):\s*([\d.]+)\s*[,}]/g,
			),
		].filter((m) => Number(m[2]) !== 0);
		expect(bare.map((m) => `${m[1]}: ${m[2]}`)).toEqual([]);
	});

	/**
	 * Never a second line and never a taller header from a long name: every
	 * text in here is one line, and the title is the only run that gives
	 * anything up — first its SIZE, then (below the floor) its tail. The Map
	 * pill and the chevron are `flexShrink: 0` and are laid out first, so
	 * neither can be pushed off by a long name.
	 *
	 * Decision 4 (owner, 2026-09-07): 「Don't cut the community name if it is
	 * too long, use smaller size instead」. `adjustsFontSizeToFit` was removed
	 * in phase183.1 and is back for that; the floor is 0.5, which clears the
	 * longest community name the feed serves today (24 characters, needing
	 * 54%). An explicit `lineHeight` on the title would defeat it — iOS clips
	 * auto-shrunk text against one — and the row's `minHeight` holds the
	 * header's height instead.
	 */
	it("never wraps, and shrinks the title before cutting it", () => {
		expect(CODE.match(/numberOfLines=\{1\}/g) ?? []).toHaveLength(3);
		expect(CODE).toContain("adjustsFontSizeToFit");
		expect(CODE).toContain("minimumFontScale={TITLE_MIN_SCALE}");
		expect(n("TITLE_MIN_SCALE")).toBe(0.5);
		expect(CODE).toContain('ellipsizeMode="tail"');
		expect(CODE.match(/flexShrink: 1/g) ?? []).toHaveLength(2);
		expect(CODE.match(/flexShrink: 0/g) ?? []).toHaveLength(2);
		// The title is the one text with no lineHeight of its own.
		const title = CODE.slice(CODE.indexOf("\t\ttitle: {"));
		expect(title.slice(0, title.indexOf("},"))).not.toContain("lineHeight");
	});
});

describe("map control B", () => {
	it("is 84 x 44 at radius 22, and darkens when pressed", () => {
		expect(n("MAP_WIDTH")).toBe(84);
		expect(n("MAP_HEIGHT")).toBe(44);
		expect(n("MAP_RADIUS")).toBe(22);
		expect(n("MAP_GAP")).toBe(6);
		// A floor, not a fixed frame: the pill widens for a scaled label.
		expect(CODE).toContain("minWidth: MAP_WIDTH");
		expect(CODE).toContain("minHeight: MAP_HEIGHT");
		expect(CODE).toContain("mapPressed: { backgroundColor:");
	});

	/**
	 * The pin is a teardrop: one box, three corners rounded to half its width
	 * and the fourth sharp, turned 45° so the sharp one points down. The
	 * rounding is what makes it a pin rather than a rotated square, and the
	 * ONE sharp corner is what makes it a pin rather than a circle.
	 */
	it("draws an 18-TALL teardrop pin", () => {
		// 18 is the whole icon, not its head: the tip hangs below the head's
		// centre, so sizing the head at 18 drew a 21.7pt icon — 20% over the
		// handoff, and what the owner reported as too big on 2026-09-07.
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
});

describe("what the handoff forbids", () => {
	/**
	 * "Do not introduce a Percho wordmark, community count, floating overlay
	 * on the video, or another map-button variant." The wordmark and the count
	 * were both in the header this replaced (phase182.1) — this is the test
	 * that notices if either comes back by accident.
	 */
	it("carries no wordmark and no community count", () => {
		expect(CODE).not.toContain("Percho");
		expect(CODE).not.toContain("StatsLine");
		expect(CODE).not.toContain("communityCount");
	});

	/**
	 * Two separate controls, each with its own 44pt target: the title and Map.
	 * The handoff is explicit that the whole header must not be one button.
	 *
	 * It was three until 2026-09-09. The context row opened `ScopeSheet`, and
	 * the owner moved that to the Search/map tab — 「这个scope sheet的选项不用在
	 * 主feed流里提供 显示text就可以」 — so the row is plain text now. If a third
	 * `Pressable` appears here, something has put a control back on it.
	 */
	it("wraps no shared button around the header", () => {
		expect(CODE.match(/<Pressable/g) ?? []).toHaveLength(2);
		expect(CODE).toContain("height: MAIN_ROW * k");
	});

	/** The scope sheet does not reach the feed header by any route. */
	it("opens no scope sheet", () => {
		expect(CODE).not.toContain("Scope");
	});

	/**
	 * Decision 1 (owner, 2026-09-07): 「map button应该和community name在同一行
	 * 呼应 而不是不相干的两个部分display」. The title slot SHRINKS but never
	 * GROWS, so the pill sits beside the name at any name length instead of on
	 * the header's right edge — where a short city fallback left ~150pt of
	 * nothing between the two. `flex: 1` would undo it in one word, and Yoga
	 * defaults `flexShrink` to 0, so both halves have to be explicit.
	 */
	it("lets Map follow the name instead of the right edge", () => {
		const slot = CODE.slice(CODE.indexOf("titleSlot: {"));
		const block = slot.slice(0, slot.indexOf("},"));
		expect(block).toContain("flexShrink: 1");
		expect(block).not.toContain("flex: 1");
		expect(block).not.toContain("flexGrow");
		// No spacer between the name and the pill, either.
		expect(CODE).not.toContain("styles.grow");
	});

	/** No panel, no border, no shadow — the header is on the page's paper. */
	it("draws no container", () => {
		expect(CODE).not.toContain("shadow");
		expect(CODE).not.toContain("elevation");
		expect(CODE).not.toContain("borderWidth: 1,");
		expect(CODE).toContain("backgroundColor: colors.bg");
	});
});
