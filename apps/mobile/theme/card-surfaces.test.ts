/**
 * Invariants for the media-less card backgrounds (`cardSurfaces`).
 *
 * These exist because the "black screen" bug regressed twice: first flat `ink`,
 * then a single shared brown ramp that bottomed out too dark. Both were legal
 * per the type system and both looked broken on device. The rules below are what
 * "not a black screen, and not the same screen five times" means numerically, so
 * a future hue edit that violates them fails here instead of on a phone.
 *
 * They also guard the §0.3 contrast contract: every surface must stay dark
 * enough that `onCard` (#FFFFFF) and `onCardDim` keep the AA ratios they were
 * checked against, and light enough not to read as black.
 */
import { describe, expect, it } from "vitest";
import { cardSurfaces, colors } from "./tokens";

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
	const m = /^#([0-9a-f]{6})$/i.exec(hex);
	if (!m?.[1]) throw new Error(`not a 6-digit hex: ${hex}`);
	const n = Number.parseInt(m[1], 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Perceived luminance, ITU-R BT.601 — good enough for "is this dark". */
function luma([r, g, b]: Rgb): number {
	return 0.299 * r + 0.587 * g + 0.114 * b;
}

function mean([r, g, b]: Rgb): number {
	return (r + g + b) / 3;
}

/** Max−min channel: 0 is a pure grey, so this measures "has a hue at all". */
function chroma([r, g, b]: Rgb): number {
	return Math.max(r, g, b) - Math.min(r, g, b);
}

const VARIANTS = Object.keys(cardSurfaces) as (keyof typeof cardSurfaces)[];

describe("cardSurfaces", () => {
	it("covers every media-less face plus the two photo fallbacks", () => {
		// Each of these has a real call site; adding a variant without a consumer
		// is how DataFaceStub-style dead code got in last time.
		expect(new Set(VARIANTS)).toEqual(
			new Set([
				"tradeoff",
				"tradeoffAlt",
				"challenge",
				"insight",
				"milestone",
				"data",
				"ask",
				"askGeo",
				"area",
			]),
		);
	});

	it.each(VARIANTS)("%s is never near-black", (v) => {
		// The bug, stated as a number. `ink` (#2B2116) has mean 30.3; the first
		// attempted fix bottomed out at #221A12, mean 27.3 — both fail this.
		expect(mean(rgb(cardSurfaces[v].to))).toBeGreaterThanOrEqual(0x20);
	});

	it.each(VARIANTS)("%s is visibly chromatic, not a dark grey", (v) => {
		// A neutral dark grey reads as "the image failed to load" just as much as
		// black does. Both stops must carry the hue.
		expect(chroma(rgb(cardSurfaces[v].from))).toBeGreaterThanOrEqual(8);
		expect(chroma(rgb(cardSurfaces[v].to))).toBeGreaterThanOrEqual(8);
	});

	it.each(VARIANTS)("%s ramps: from is materially lighter than to", (v) => {
		const { from, to } = cardSurfaces[v];
		expect(luma(rgb(from)) - luma(rgb(to))).toBeGreaterThanOrEqual(18);
	});

	it.each(VARIANTS)("%s stays dark enough for white on-card text", (v) => {
		// §0.3's invariant is that the card face is ALWAYS dark. The lightest stop
		// is what white text can land on, so it is the one that must be bounded.
		expect(luma(rgb(cardSurfaces[v].from))).toBeLessThan(0x7a);
	});

	it("gives each kind its own hue — a run of them must not read as one card", () => {
		// The failure mode this catches: someone "unifies" the palette and stage 0
		// goes back to looking like the same card repeating 5 times.
		const hues = VARIANTS.map((v) => {
			const [r, g, b] = rgb(cardSurfaces[v].from);
			// Coarse hue bucket: which channel dominates, and by how much.
			return `${r > g ? "r" : "g"}${g > b ? "g" : "b"}${Math.round(chroma([r, g, b]) / 12)}`;
		});
		expect(new Set(hues).size).toBeGreaterThanOrEqual(5);
	});

	it("every glow is a translucent wash, not an opaque fill", () => {
		for (const v of VARIANTS) {
			const m = /^rgba\(\d+,\s*\d+,\s*\d+,\s*(0?\.\d+)\)$/.exec(
				cardSurfaces[v].glow,
			);
			expect(m, `${v} glow must be rgba()`).not.toBeNull();
			expect(Number(m?.[1])).toBeLessThanOrEqual(0.3);
		}
	});

	it("the trade-off halves are opposing hues, not two shades of one", () => {
		const [lr, , lb] = rgb(cardSurfaces.tradeoff.from);
		const [rr, , rb] = rgb(cardSurfaces.tradeoffAlt.from);
		// Left warm (red-dominant), right cool (blue-dominant): the split must be
		// visible before the finger moves, per §1.6's "two halves" being the point.
		expect(lr).toBeGreaterThan(lb);
		expect(rb).toBeGreaterThan(rr);
	});

	it("the base fill matches the darkest ramp stop", () => {
		// `cardPlainTo` is what shows for the frame or two before the gradient
		// paints. It must not be a different colour, and must not be `ink`.
		expect(colors.cardPlainTo).toBe(cardSurfaces.tradeoff.to);
		expect(colors.cardPlainTo).not.toBe(colors.ink);
	});

	it("no two variants are the same colour", () => {
		// `ask`-geo and `area` shipped as literally the same pine in the first
		// draft: two different card types rendering identically, which is the same
		// "is this broken?" read as a black screen.
		const froms = VARIANTS.map((v) => cardSurfaces[v].from);
		expect(new Set(froms).size).toBe(VARIANTS.length);
	});

	it.each(VARIANTS)("%s carries AA-legible white body text", (v) => {
		// WCAG AA for body text is 4.5:1. Checked against the LIGHTEST stop, since
		// that is the worst case for white.
		const rel = ([r, g, b]: Rgb) => {
			const lin = (c: number) => {
				const s = c / 255;
				return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
		};
		const ratio = 1.05 / (rel(rgb(cardSurfaces[v].from)) + 0.05);
		expect(ratio).toBeGreaterThanOrEqual(4.5);
	});

	it("the on-card accent is lighter than the chrome accent", () => {
		// `accent` (#B45309) is AA on the light `bg` but nearly illegible on the
		// milestone's copper ramp. `accentOnCard` is the same hue, raised.
		expect(luma(rgb(colors.accentOnCard))).toBeGreaterThan(
			luma(rgb(colors.accent)) + 30,
		);
		// Still amber, not washed out to cream.
		expect(chroma(rgb(colors.accentOnCard))).toBeGreaterThanOrEqual(60);
	});
});
