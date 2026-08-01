/**
 * Gallery slide construction — the rules that keep Explore honest.
 *
 * These assert the three things the 2026-08-01 immersion change depends on, all
 * of which are easy to "fix" into a lie later:
 *
 *   1. ALL photos survive. The video is a highlight reel; the gallery is not. A
 *      future quality filter here would silently recreate the thing the owner
 *      explicitly asked to see past ("包括视频里没有的").
 *   2. An untagged photo gets NO caption — not a generated one, not the address.
 *      Today `ai_tags` is null for the 104 fmls-import listings the feed serves,
 *      so a fallback would be a lie on almost every listing in production.
 *   3. A `room_type` the tagger hallucinated does not get printed as an
 *      authoritative room label.
 */
import { describe, expect, it } from "vitest";
import type { DetailPhotoDTO } from "./detail-dto";
import {
	buildGallerySlides,
	captionedCount,
	kickerForRoom,
	slideCounter,
} from "./gallery";

const photo = (over: Partial<DetailPhotoDTO> = {}): DetailPhotoDTO => ({
	id: "p1",
	url: "https://example.test/p1.jpg",
	...over,
});

describe("buildGallerySlides", () => {
	it("keeps EVERY photo, including ones the video would have dropped", () => {
		const slides = buildGallerySlides([
			photo({ id: "a" }),
			// `usable: false` means "don't put this in a video / on a pin" — it does
			// NOT mean the buyer may not browse it.
			photo({ id: "b", tags: { usable: false } }),
			photo({ id: "c", tags: { quality: 0.1, hero_score: 0.02 } }),
		]);
		expect(slides.map((s) => s.id)).toEqual(["a", "b", "c"]);
	});

	it("preserves the DTO's order rather than re-ranking by score", () => {
		const slides = buildGallerySlides([
			photo({ id: "low", tags: { hero_score: 0.1 } }),
			photo({ id: "high", tags: { hero_score: 0.99 } }),
		]);
		expect(slides.map((s) => s.id)).toEqual(["low", "high"]);
	});

	it("omits caption and kicker entirely for an untagged photo", () => {
		const [slide] = buildGallerySlides([photo()]);
		expect(slide).toEqual({ id: "p1", url: "https://example.test/p1.jpg" });
		expect(slide).not.toHaveProperty("caption");
		expect(slide).not.toHaveProperty("kicker");
	});

	it("carries the vision caption and room kicker when tagged", () => {
		const [slide] = buildGallerySlides([
			photo({
				tags: { room_type: "kitchen", caption: "Quartz island seats four." },
			}),
		]);
		expect(slide?.caption).toBe("Quartz island seats four.");
		expect(slide?.kicker).toBe("KITCHEN");
	});

	it("treats a whitespace-only caption as absent", () => {
		const [slide] = buildGallerySlides([
			photo({ tags: { room_type: "kitchen", caption: "   " } }),
		]);
		expect(slide).not.toHaveProperty("caption");
		// The kicker still stands: the room is known even when the sentence isn't.
		expect(slide?.kicker).toBe("KITCHEN");
	});
});

describe("kickerForRoom", () => {
	it("uppercases a known room", () => {
		expect(kickerForRoom("bathroom")).toBe("BATHROOM");
	});

	it("accepts a qualified room whose head noun is known", () => {
		expect(kickerForRoom("primary_bedroom")).toBe("PRIMARY BEDROOM");
	});

	it("refuses a room outside the shared vocabulary", () => {
		// Not in HOTSPOT_ROOMS. The slide still renders — it just gets no label,
		// rather than printing the tagger's guess as fact.
		expect(kickerForRoom("wine_cellar")).toBeUndefined();
		expect(kickerForRoom("vibes")).toBeUndefined();
	});

	it("returns undefined for empty / missing input", () => {
		expect(kickerForRoom(undefined)).toBeUndefined();
		expect(kickerForRoom(null)).toBeUndefined();
		expect(kickerForRoom("  ")).toBeUndefined();
	});
});

describe("counters", () => {
	it("is 1-indexed for display", () => {
		expect(slideCounter(0, 22)).toBe("1 / 22");
		expect(slideCounter(21, 22)).toBe("22 / 22");
	});

	it("counts only captioned slides", () => {
		const slides = buildGallerySlides([
			photo({ id: "a", tags: { caption: "One." } }),
			photo({ id: "b" }),
			photo({ id: "c", tags: { caption: "Three." } }),
		]);
		expect(captionedCount(slides)).toBe(2);
	});

	it("is 0 on a fully untagged listing — the hint must stay hidden", () => {
		expect(
			captionedCount(buildGallerySlides([photo(), photo({ id: "b" })])),
		).toBe(0);
	});
});
