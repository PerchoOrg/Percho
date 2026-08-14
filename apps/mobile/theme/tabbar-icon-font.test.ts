/**
 * Guards the TabBar icon FONT against the same two ways the redline font can
 * silently break (see `theme/icon-font.test.ts` for the full rationale): a
 * missing codepoint renders tofu on a real device and nowhere else.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	TAB_BAR_ART_WIDTH,
	TAB_BAR_GLYPH,
} from "../components/TabBarIconFont";
const FONT = join(__dirname, "../assets/fonts/TabBarIcons.ttf");

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
	const present = codepointsInFont(FONT);

	it("draws every glyph the icon table names", () => {
		const missing = Object.entries(TAB_BAR_GLYPH)
			.filter(([, glyph]) => !present.has(glyph.codePointAt(0) as number))
			.map(
				([name, glyph]) => `${name} (U+${glyph.codePointAt(0)?.toString(16)})`,
			);
		expect(missing).toEqual([]);
	});

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
			expect(seen.get(glyph), `${name} duplicates ${seen.get(glyph)}`).toBeUndefined();
			seen.set(glyph, name);
		}
	});

	it("knows every glyph's art width, for the centring shift", () => {
		for (const name of Object.keys(TAB_BAR_GLYPH)) {
			const w = TAB_BAR_ART_WIDTH[name as keyof typeof TAB_BAR_ART_WIDTH];
			expect(w, `${name} art width`).toBeGreaterThan(0);
			expect(w, `${name} art width`).toBeLessThanOrEqual(1);
		}
		expect(Object.keys(TAB_BAR_ART_WIDTH).sort()).toEqual(
			Object.keys(TAB_BAR_GLYPH).sort(),
		);
	});
});
