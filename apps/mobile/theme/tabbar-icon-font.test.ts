/**
 * Guards the TabBar icon FONT against the same two ways the redline font can
 * silently break (see `theme/icon-font.test.ts` for the full rationale): a
 * missing codepoint renders tofu on a real device and nowhere else.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	TAB_BAR_GLYPH,
	TAB_BAR_GLYPH_CENTER_Y,
	TAB_BAR_GLYPH_SCALE,
	TAB_BAR_OPTICAL_SCALE,
} from "../components/TabBarIconFont";
const FONTS = {
	outline: join(__dirname, "../assets/fonts/TabBarIcons.ttf"),
	fill: join(__dirname, "../assets/fonts/TabBarIconsFill.ttf"),
};

/** Minimal TrueType `cmap` reader — every codepoint the font can actually draw. */
function codepointsInFont(path: string): Set<number> {
	const buf = readFileSync(path);
	const numTables = buf.readUInt16BE(4);
	let cmapOff = -1;
	for (let i = 0; i < numTables; i++) {
		const rec = 12 + i * 16;
		if (buf.toString("ascii", rec, rec + 4) === "cmap") {
			cmapOff = buf.readUInt32BE(rec + 8);
			break;
		}
	}
	if (cmapOff < 0) throw new Error("no cmap table in font");

	const out = new Set<number>();
	const nSub = buf.readUInt16BE(cmapOff + 2);
	for (let i = 0; i < nSub; i++) {
		const enc = cmapOff + 4 + i * 8;
		const sub = cmapOff + buf.readUInt32BE(enc + 4);
		const format = buf.readUInt16BE(sub);

		if (format === 4) {
			const segX2 = buf.readUInt16BE(sub + 6);
			const ends = sub + 14;
			const starts = ends + segX2 + 2;
			for (let s = 0; s < segX2 / 2; s++) {
				const end = buf.readUInt16BE(ends + s * 2);
				const start = buf.readUInt16BE(starts + s * 2);
				if (start === 0xffff) continue;
				for (let c = start; c <= end; c++) out.add(c);
			}
		} else if (format === 12) {
			const nGroups = buf.readUInt32BE(sub + 12);
			for (let g = 0; g < nGroups; g++) {
				const rec = sub + 16 + g * 12;
				const start = buf.readUInt32BE(rec);
				const end = buf.readUInt32BE(rec + 4);
				for (let c = start; c <= end; c++) out.add(c);
			}
		}
	}
	return out;
}

describe("tab bar icon font", () => {
	/**
	 * BOTH weights are checked: the active tab stacks the fill glyph under the
	 * outline one, so a codepoint present in only one font renders a half-drawn
	 * icon on device and nowhere else.
	 */
	it.each(Object.entries(FONTS))(
		"the %s font draws every glyph the icon table names",
		(_weight, path) => {
			const present = codepointsInFont(path);
			const missing = Object.entries(TAB_BAR_GLYPH)
				.filter(([, glyph]) => !present.has(glyph.codePointAt(0) as number))
				.map(
					([name, glyph]) =>
						`${name} (U+${glyph.codePointAt(0)?.toString(16)})`,
				);
			expect(missing).toEqual([]);
		},
	);

	it("maps each icon name to exactly one codepoint", () => {
		for (const [name, glyph] of Object.entries(TAB_BAR_GLYPH)) {
			expect(Array.from(glyph), `${name} must be a single glyph`).toHaveLength(
				1,
			);
		}
	});

	it("gives every icon name a distinct glyph", () => {
		const seen = new Map<string, string>();
		for (const [name, glyph] of Object.entries(TAB_BAR_GLYPH)) {
			expect(
				seen.get(glyph),
				`${name} duplicates ${seen.get(glyph)}`,
			).toBeUndefined();
			seen.set(glyph, name);
		}
	});

	/**
	 * The metric tables are what centre and size the drawing. A glyph swapped in
	 * `TAB_BAR_GLYPH` without re-measuring would silently inherit the old
	 * glyph's numbers — which is exactly how the 2.7px Saved drift shipped.
	 */
	it("has a measured centre and scale for every glyph", () => {
		const names = Object.keys(TAB_BAR_GLYPH).sort();
		expect(Object.keys(TAB_BAR_GLYPH_CENTER_Y).sort()).toEqual(names);
		expect(Object.keys(TAB_BAR_GLYPH_SCALE).sort()).toEqual(names);
		for (const name of names) {
			const cy =
				TAB_BAR_GLYPH_CENTER_Y[name as keyof typeof TAB_BAR_GLYPH_CENTER_Y];
			// Phosphor draws inside the em box; a centre outside this band means
			// the number was guessed, not measured.
			expect(cy, `${name} centre`).toBeGreaterThan(0.3);
			expect(cy, `${name} centre`).toBeLessThan(0.6);
			const scale =
				TAB_BAR_GLYPH_SCALE[name as keyof typeof TAB_BAR_GLYPH_SCALE];
			expect(scale, `${name} scale`).toBeGreaterThan(0.8);
			expect(scale, `${name} scale`).toBeLessThanOrEqual(1);
		}
	});

	/**
	 * The glyph `<Text>` must carry its own em-wide box.
	 *
	 * `TAB_BAR_OPTICAL_SCALE` is 1.13, so the 1 em advance is always WIDER than
	 * the 24pt icon box it sits in. A `<Text>` pinned `left: 0, right: 0` gets
	 * the box's width, and iOS clips the overflow rather than letting the glyph
	 * hang: on the owner's 2026-09-05 screenshot every icon measured 0.6–1.4pt
	 * narrower than its outline, cut down the right side (the heart lost its
	 * right lobe). So the style must set an explicit `width: fontSize`.
	 */
	it("gives the glyph a box at least as wide as its em advance", () => {
		const source = readFileSync(
			join(__dirname, "../components/TabBar.tsx"),
			"utf8",
		);
		expect(source).toContain("width: fontSize");
		expect(source).toContain("left: (ICON_SIZE - fontSize) / 2");
		// The pinned-to-both-edges form is the bug; it must not come back.
		expect(source).not.toMatch(/icon:\s*\{[^}]*left:\s*0,\s*right:\s*0/);

		// The premise: the em box really is wider than the icon box for every
		// glyph, so no scale value can make the explicit width unnecessary.
		for (const name of Object.keys(TAB_BAR_GLYPH)) {
			const scale =
				TAB_BAR_GLYPH_SCALE[name as keyof typeof TAB_BAR_GLYPH_SCALE];
			expect(TAB_BAR_OPTICAL_SCALE * scale, `${name} em vs box`).toBeGreaterThan(
				1,
			);
		}
	});
});
