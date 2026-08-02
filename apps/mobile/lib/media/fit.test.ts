import { describe, expect, it } from "vitest";
import { mediaFit } from "./fit";

/** The community card's real frame: 2:3 (CARD_ASPECT 1.5 inverted). */
const CARD = 2 / 3;

describe("mediaFit", () => {
	it("fills the card for the community cover (1080x1920 in a 2:3 frame)", () => {
		// This is the case the owner reported as 「视频宽度不够 没有占满card 有黑色空隙」:
		// 0.5625 is NARROWER than 0.667, so `contain` pillarboxed it.
		expect(mediaFit({ width: 1080, height: 1920 }, CARD)).toBe("cover");
	});

	it("letterboxes a landscape source rather than cropping its width", () => {
		// The owner's older rule, which must survive this change.
		expect(mediaFit({ width: 1920, height: 1080 }, CARD)).toBe("contain");
	});

	it("fills for a square source in a tall frame", () => {
		// 1.0 > 0.667, so this is WIDER than the frame — must letterbox, not crop.
		expect(mediaFit({ width: 1080, height: 1080 }, CARD)).toBe("contain");
	});

	it("fills a square source in a square frame", () => {
		expect(mediaFit({ width: 1080, height: 1080 }, 1)).toBe("cover");
	});

	it("treats a ~1% mismatch as a match instead of painting hairline bands", () => {
		// 1080x1900 in a 9:16 frame.
		expect(mediaFit({ width: 1080, height: 1900 }, 9 / 16)).toBe("cover");
	});

	it("falls back to contain when the size is unknown", () => {
		// Never `cover`: an unmeasured landscape video would flash a zoomed crop.
		expect(mediaFit(null, CARD)).toBe("contain");
		expect(mediaFit(undefined, CARD)).toBe("contain");
		expect(mediaFit({ width: 0, height: 0 }, CARD)).toBe("contain");
	});

	/**
	 * The owner reported the community card's black side-gaps a SECOND time after
	 * the measured fix shipped (「视频黑色空隙 还在!」). A measured fix fails silently
	 * on iOS HLS when `availableVideoTracks` never populates: the card sits on
	 * the unknown-size fallback forever with nothing in any log. So a surface
	 * whose renders are known-portrait must be able to say "fill until told
	 * otherwise".
	 */
	describe("whenUnknown — a known-portrait surface must not wait to look right", () => {
		it("fills on frame one when the caller says its source is portrait", () => {
			expect(mediaFit(null, CARD, "cover")).toBe("cover");
			expect(mediaFit(undefined, CARD, "cover")).toBe("cover");
			expect(mediaFit({ width: 0, height: 0 }, CARD, "cover")).toBe("cover");
		});

		it("still letterboxes a landscape source once its real size lands", () => {
			// The self-correction that makes `whenUnknown: cover` safe: 2 of the 5
			// ready community videos are really 1920x1080 while the DB claims 9:16,
			// and a measured size ALWAYS overrides the default.
			expect(mediaFit({ width: 1920, height: 1080 }, CARD, "cover")).toBe(
				"contain",
			);
		});

		it("keeps contain as the default so other callers are unchanged", () => {
			// `AreaFace` / `ListingFace` pass no `whenUnknown`; their behaviour must
			// not move because the community card needed a different default.
			expect(mediaFit(null, CARD)).toBe("contain");
		});

		it("honours the fallback for a nonsense frame aspect too", () => {
			expect(mediaFit({ width: 1080, height: 1920 }, 0, "cover")).toBe("cover");
		});
	});

	it("falls back to contain for a nonsense frame aspect", () => {
		expect(mediaFit({ width: 1080, height: 1920 }, 0)).toBe("contain");
		expect(mediaFit({ width: 1080, height: 1920 }, Number.NaN)).toBe("contain");
	});
});
