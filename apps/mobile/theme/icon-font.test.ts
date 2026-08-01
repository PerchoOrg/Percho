/**
 * Guards the icon FONT against the two ways it can silently break.
 *
 * Both failures are invisible to `tsc`: the glyph table is just strings, and the
 * font is a binary asset. A missing codepoint renders a tofu box on a real
 * device and nowhere else, which is exactly the class of bug that shipped the
 * RNSVG red screen (DEVLOG 2026-07-30) — caught only after the owner opened the
 * app. So the invariants are asserted against the actual .ttf bytes here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICON_GLYPH } from "../components/cards/redline/icon-font";

const FONT = join(__dirname, "../assets/fonts/PerchoIcons.ttf");

/**
 * Minimal TrueType `cmap` reader — every codepoint the font can actually draw.
 *
 * Hand-rolled rather than pulled from a dependency: this needs to run in the
 * mobile app's vitest, which has no font tooling, and the only thing required is
 * format 4 / format 12 subtable decoding (~40 lines) rather than a font library.
 */
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

describe("redline icon font", () => {
	const present = codepointsInFont(FONT);

	it("draws every glyph the icon table names", () => {
		const missing = Object.entries(ICON_GLYPH)
			.filter(([, glyph]) => !present.has(glyph.codePointAt(0) as number))
			.map(
				([name, glyph]) => `${name} (U+${glyph.codePointAt(0)?.toString(16)})`,
			);

		// A name added to ICON_GLYPH without re-running pyftsubset lands here.
		expect(missing).toEqual([]);
	});

	it("maps each icon name to exactly one codepoint", () => {
		for (const [name, glyph] of Object.entries(ICON_GLYPH)) {
			expect(Array.from(glyph), `${name} must be a single glyph`).toHaveLength(
				1,
			);
		}
	});

	it("gives every icon name a distinct glyph", () => {
		// Two names sharing a codepoint means one dim is silently wearing
		// another's art — the "Move-in Ready shows a pedestrian" bug class.
		const seen = new Map<string, string>();
		for (const [name, glyph] of Object.entries(ICON_GLYPH)) {
			expect(
				seen.get(glyph),
				`${name} duplicates ${seen.get(glyph)}`,
			).toBeUndefined();
			seen.set(glyph, name);
		}
	});

	it("stays subset — the full Phosphor font must never be committed", () => {
		// Phosphor-Fill.ttf is ~440 KB for 1512 glyphs. Ours is ~5 KB for 14.
		expect(readFileSync(FONT).byteLength).toBeLessThan(40_000);
	});

	it("declares expo-font as a real dependency", () => {
		// Regression guard for the 2026-08-01 red screen. `expo-font` was used
		// without being declared, so pnpm's hoisted copy at the repo root got
		// picked up instead of a properly peer-linked one. The hoisted copy has
		// no react of its own, so it resolved the ROOT node_modules/react while
		// the app resolved .pnpm/react@19.1.0 — same version, different path,
		// and Metro keys modules by path. Two React instances means a null
		// dispatcher: "Invalid hook call" / "Cannot read property 'useState' of
		// null" the moment useFonts ran on device.
		//
		// tsc cannot catch this (the phantom import type-checks fine) and it
		// only fails on a real device, so it is asserted here.
		const pkg = JSON.parse(
			readFileSync(join(__dirname, "../package.json"), "utf8"),
		);
		expect(pkg.dependencies["expo-font"]).toBeTruthy();
	});
});
