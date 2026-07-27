import { describe, expect, it } from "vitest";
import { FILL_TOLERANCE, isLandscapeInCard, mediaFit } from "./fit";

/** A typical card: 9:16-ish. */
const CARD = 9 / 16;

describe("mediaFit — the owner's rule, 2026-07-27", () => {
	it("LANDSCAPE video fills the WIDTH and letterboxes vertically", () => {
		// "对于横屏视频宽度要占满 listing card 上下可以不用占满" — nothing cropped.
		const fit = mediaFit({ width: 1920, height: 1080 }, CARD);
		expect(fit.orientation).toBe("landscape");
		expect(fit.contentFit).toBe("contain");
		expect(fit.letterboxed).toBe(true);
		expect(fit.boxAspectRatio).toBeCloseTo(16 / 9, 5);
	});

	it("PORTRAIT video fills the card with no bands", () => {
		const fit = mediaFit({ width: 1080, height: 1920 }, CARD);
		expect(fit.orientation).toBe("portrait");
		expect(fit.contentFit).toBe("cover");
		expect(fit.letterboxed).toBe(false);
		expect(fit.boxAspectRatio).toBeUndefined();
	});

	it("does NOT letterbox a source that is only marginally off the card shape", () => {
		// 1080x1900 in a 9:16 card is ~1% off. Two hairline bands read as a bug.
		const fit = mediaFit({ width: 1080, height: 1900 }, CARD);
		expect(fit.letterboxed).toBe(false);
		expect(fit.contentFit).toBe("cover");
	});

	it("letterboxes a SQUARE source in a tall card, and says so without calling it landscape", () => {
		// A 1:1 photo is wider than a 9:16 card, so the owner's rule applies: full
		// width, nothing cropped. But its own orientation is `square` — the two are
		// different questions, and an earlier draft conflated them.
		const fit = mediaFit({ width: 1000, height: 1000 }, CARD);
		expect(fit.orientation).toBe("square");
		expect(fit.widerThanCard).toBe(true);
		expect(fit.contentFit).toBe("contain");
		expect(fit.letterboxed).toBe(true);
	});

	it("falls back to fill when dimensions are unknown or junk", () => {
		// Video metadata arrives a beat after mount; an empty frame in that beat is
		// worse than a fill that corrects itself.
		for (const source of [
			undefined,
			{ width: 0, height: 100 },
			{ width: 100, height: 0 },
			{ width: Number.NaN, height: 100 },
			{ width: -10, height: 100 },
		]) {
			const fit = mediaFit(source, CARD);
			expect(fit.contentFit).toBe("cover");
			expect(fit.letterboxed).toBe(false);
		}
	});

	it("adapts to the CARD's aspect, not a hardcoded 9:16", () => {
		// A 4:3 source is wider than a phone card (letterbox) but TALLER than a wide
		// 16:9 card, where it must fill instead. Its own orientation is `landscape`
		// in both cases — only the fit changes.
		const source = { width: 1440, height: 1080 };
		expect(mediaFit(source, CARD).widerThanCard).toBe(true);
		expect(mediaFit(source, CARD).letterboxed).toBe(true);
		expect(mediaFit(source, 16 / 9).widerThanCard).toBe(false);
		expect(mediaFit(source, 16 / 9).contentFit).toBe("cover");
		expect(mediaFit(source, 16 / 9).orientation).toBe("landscape");
	});

	it("uses the real source aspect for the box, so nothing is cropped", () => {
		const fit = mediaFit({ width: 1280, height: 720 }, CARD);
		expect(fit.boxAspectRatio).toBeCloseTo(1280 / 720, 5);
	});

	it("exposes the tolerance it applies", () => {
		expect(FILL_TOLERANCE).toBeGreaterThan(0);
		// Just INSIDE the tolerance still fills. Not computed exactly at the edge:
		// `1 + 0.05` is 1.0500000000000002 in binary floating point, so an
		// edge-exact fixture tests the FPU, not the rule.
		const inside = {
			width: 1000,
			height: 1000 / (CARD * (1 + FILL_TOLERANCE * 0.9)),
		};
		expect(mediaFit(inside, CARD).letterboxed).toBe(false);
		// And just OUTSIDE it letterboxes.
		const outside = {
			width: 1000,
			height: 1000 / (CARD * (1 + FILL_TOLERANCE * 1.5)),
		};
		expect(mediaFit(outside, CARD).letterboxed).toBe(true);
	});
});

describe("isLandscapeInCard", () => {
	it("answers the one question call sites actually ask", () => {
		expect(isLandscapeInCard({ width: 1920, height: 1080 }, CARD)).toBe(true);
		expect(isLandscapeInCard({ width: 1080, height: 1920 }, CARD)).toBe(false);
		expect(isLandscapeInCard(undefined, CARD)).toBe(false);
	});
});
