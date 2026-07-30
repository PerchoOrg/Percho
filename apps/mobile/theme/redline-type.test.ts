/**
 * The redline type scale, asserted against the spec text.
 *
 * Why this file exists: the owner caught `$968,000` rendering wrong on device
 * (「你这个房价的字体明显不对啊」, 2026-07-30) and the cause was a token, not a
 * component — `fonts.display` was Georgia, whose OLD-STYLE figures make a 9
 * descend and 6/8 ascend, so the price came out as a ragged row of digits where
 * the reference board shows a flat one. Nothing in the suite could see that.
 *
 * These tests encode the redline's stated numbers so a future "just nudge it to
 * fit" edit fails here instead of on a phone. Each expectation quotes the spec
 * line it comes from. When the redline itself changes, change the test WITH it —
 * that is the point, not an obstacle.
 */
import { describe, expect, it } from "vitest";
import { fonts } from "./tokens";
import { redlineText } from "./typography";

/** The redline's `line-height` ratios, resolved against each size. */
function ratio(style: { fontSize: number; lineHeight?: number }): number {
	if (style.lineHeight === undefined) {
		throw new Error("expected an explicit lineHeight");
	}
	return style.lineHeight / style.fontSize;
}

describe("redline type scale", () => {
	// ── The bug that started this file ────────────────────────────────────
	it("puts a LINING-figure serif first, not Georgia", () => {
		// New York is the iOS system serif and has lining (equal-height) figures.
		// Georgia is the redline stack's 4th fallback and has old-style ones.
		// `$968,000` is the visible casualty: measured on the reference board, all
		// six digits span exactly y388–409 — one flat row.
		expect(fonts.display).toBe("New York");
		expect(fonts.displayFallback).toBe("Georgia");
	});

	it("uses the serif for price and every editorial headline", () => {
		// "Use serif only for key editorial headlines and price."
		for (const key of ["price", "place", "question", "insight"] as const) {
			// Platform.select resolves to the iOS entry under vitest's default.
			expect(redlineText[key].fontFamily).not.toBe(fonts.ui);
		}
	});

	it("uses sans for all interface copy", () => {
		// "Use sans-serif for all interface copy."
		const ui = [
			"address",
			"locality",
			"story",
			"subtext",
			"subtitle",
			"insightBody",
			"choice",
			"cta",
			"ctaSm",
			"label",
			"chip",
			"tile",
			"micro",
			"microLabel",
			"nano",
		] as const;
		for (const key of ui) {
			expect(redlineText[key].fontFamily, key).toBe(fonts.ui);
		}
	});

	// ── Sizes, verbatim from the spec ─────────────────────────────────────
	it("matches the redline's stated sizes", () => {
		expect(redlineText.price.fontSize).toBe(35); // "Price: serif, 35px"
		expect(redlineText.place.fontSize).toBe(38); // "Roswell: Serif 38px"
		expect(redlineText.question.fontSize).toBe(32); // "Serif 32px"
		// "Serif 30–32px" — a range, so assert the band rather than a point.
		expect(redlineText.insight.fontSize).toBeGreaterThanOrEqual(30);
		expect(redlineText.insight.fontSize).toBeLessThanOrEqual(32);
		expect(redlineText.address.fontSize).toBe(14); // "14px semibold"
		expect(redlineText.locality.fontSize).toBe(12); // "12px muted"
		expect(redlineText.story.fontSize).toBe(13); // "Story: 13px"
		expect(redlineText.subtext.fontSize).toBe(12); // trade-off "12px"
		expect(redlineText.subtitle.fontSize).toBe(14); // community "14px"
		expect(redlineText.insightBody.fontSize).toBe(13); // insight "13px"
		expect(redlineText.choice.fontSize).toBe(14); // "14px semibold"
		expect(redlineText.cta.fontSize).toBe(13); // "13px semibold"
		expect(redlineText.ctaSm.fontSize).toBe(12); // "12px semibold"
		expect(redlineText.label.fontSize).toBe(10); // "10px / 700 / 0.1em"
		expect(redlineText.tile.fontSize).toBe(10); // "Label 10px"
		expect(redlineText.microLabel.fontSize).toBe(10); // "Top matches" 10px
	});

	it("keeps the chip label in the redline's 9–10px band", () => {
		// "Chips ... Text 9–10px". This was shrunk to 8px at one point to force
		// three chips onto one row on the HTML board — the wrong end to fix, since
		// the row can flex and the spec states the size.
		expect(redlineText.chip.fontSize).toBeGreaterThanOrEqual(9);
		expect(redlineText.chip.fontSize).toBeLessThanOrEqual(10);
		// Same band for the recommendation captions: "Font 9–10px".
		expect(redlineText.nano.fontSize).toBeGreaterThanOrEqual(9);
		expect(redlineText.nano.fontSize).toBeLessThanOrEqual(10);
	});

	// ── Weights ───────────────────────────────────────────────────────────
	it("sets every display line to 500, not bold", () => {
		// The redline says 500 for every display line; the chrome's own serif
		// styles are 700, which is why these could not be reused.
		for (const key of ["price", "place", "question", "insight"] as const) {
			expect(redlineText[key].fontWeight, key).toBe("500");
		}
	});

	it("sets semibold where the redline says semibold", () => {
		for (const key of ["address", "choice", "cta", "ctaSm"] as const) {
			expect(redlineText[key].fontWeight, key).toBe("600");
		}
		expect(redlineText.label.fontWeight).toBe("700"); // "10px / 700"
	});

	// ── Line heights ──────────────────────────────────────────────────────
	it("matches the redline's line-height ratios", () => {
		// RN does not derive lineHeight from fontSize, so these must be explicit
		// or serif headlines stack too tightly on device.
		expect(ratio(redlineText.price)).toBeCloseTo(1.0, 1); // "/ 1 /"
		expect(ratio(redlineText.place)).toBeCloseTo(1.0, 1); // "line-height 1"
		expect(ratio(redlineText.question)).toBeCloseTo(1.06, 1); // "1.06"
		expect(ratio(redlineText.insight)).toBeCloseTo(1.08, 1); // "1.08"
		expect(ratio(redlineText.story)).toBeCloseTo(1.45, 1); // "1.45"
		expect(ratio(redlineText.subtext)).toBeCloseTo(1.45, 1); // "1.45"
		expect(ratio(redlineText.subtitle)).toBeCloseTo(1.45, 1); // "1.45"
		expect(ratio(redlineText.insightBody)).toBeCloseTo(1.55, 1); // "1.55"
		expect(ratio(redlineText.choice)).toBeCloseTo(1.35, 1); // "1.35"
	});

	// ── Tracking ──────────────────────────────────────────────────────────
	it("applies the redline's negative tracking to display lines", () => {
		// "-0.8px" on the page title / hero title / price.
		expect(redlineText.price.letterSpacing).toBeCloseTo(-0.8, 1);
		// The others are in the same family; assert they are tightened at all
		// rather than pinning a value the redline does not state per-line.
		for (const key of ["place", "question", "insight"] as const) {
			expect(redlineText[key].letterSpacing ?? 0, key).toBeLessThan(0);
		}
	});

	it("tracks the uppercase label at 0.1em", () => {
		// "Uppercase label: 10px / 700 / 0.1em" → 1pt at 10px.
		expect(redlineText.label.letterSpacing).toBeCloseTo(1, 1);
		expect(redlineText.label.textTransform).toBe("uppercase");
	});
});
