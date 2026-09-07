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
	 * 18 + 4 + 44 + 4 + 16 = 86, then 16 of paper, then the card. This is the
	 * number `theme/card-aspect.test.ts` spends against — if a row grows here,
	 * that file measures what it costs the film.
	 */
	it("is the handoff's 86: three rows and two 4pt gaps", () => {
		// The title grew 30 → 36 in phase183.1 and the ROWS did not, so the
		// page's budget above the card is unchanged. This is the assertion
		// that says so.
		expect(n("CONTEXT_ROW")).toBe(18);
		expect(n("ROW_GAP")).toBe(4);
		expect(n("MAIN_ROW")).toBe(44);
		expect(n("TYPE_ROW")).toBe(16);
		expect(
			n("CONTEXT_ROW") +
				n("ROW_GAP") +
				n("MAIN_ROW") +
				n("ROW_GAP") +
				n("TYPE_ROW"),
		).toBe(86);
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
		expect(CODE).toContain("minHeight: CONTEXT_ROW");
		expect(CODE).toContain("minHeight: MAIN_ROW");
		expect(CODE).toContain("minHeight: TYPE_ROW");
		expect(CODE).not.toContain("allowFontScaling={false}");
	});

	/**
	 * Never a second line and never a taller header from a long name: every
	 * text in here is one line, and the title is the only run that gives
	 * anything up — its tail (the Map pill and the chevron are
	 * `flexShrink: 0` and are laid out first).
	 *
	 * `adjustsFontSizeToFit` is asserted ABSENT (phase183.1): inside a
	 * shrinking flex row iOS measures it twice and a title with room to spare
	 * still comes out near the floor, which read as the wrong size against
	 * the owner's demo.
	 */
	it("never wraps, and truncates the title rather than resizing it", () => {
		expect(CODE.match(/numberOfLines=\{1\}/g) ?? []).toHaveLength(4);
		expect(CODE).toContain("flexShrink: 1");
		expect(CODE.match(/flexShrink: 0/g) ?? []).toHaveLength(2);
		expect(CODE).toContain('ellipsizeMode="tail"');
		expect(CODE).not.toContain("adjustsFontSizeToFit");
		expect(CODE).not.toContain("minimumFontScale");
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
	it("draws an 18-wide teardrop pin with a 1.75 stroke", () => {
		expect(n("PIN_HEAD")).toBe(18);
		expect(n("PIN_STROKE")).toBe(1.75);
		expect(CODE).toContain("borderTopLeftRadius: PIN_HEAD / 2");
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
	 * Three separate controls, each with its own 44pt target: the context row
	 * (the scope sheet — see the component's file header), the title, and Map.
	 * The handoff is explicit that the whole header must not be one button.
	 */
	it("wraps no shared button around the header", () => {
		expect(CODE.match(/<Pressable/g) ?? []).toHaveLength(3);
		expect(CODE).toContain("height: MAIN_ROW");
	});

	/** No panel, no border, no shadow — the header is on the page's paper. */
	it("draws no container", () => {
		expect(CODE).not.toContain("shadow");
		expect(CODE).not.toContain("elevation");
		expect(CODE).not.toContain("borderWidth: 1,");
		expect(CODE).toContain("backgroundColor: colors.bg");
	});
});
