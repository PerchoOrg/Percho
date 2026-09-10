import { describe, expect, it } from "vitest";
import type { CommunityDetailDTO, CommunityReviewsDTO } from "./detail-dto";
import { buildCommunityTake } from "./take";

function community(over: Partial<CommunityDetailDTO> = {}): CommunityDetailDTO {
	return {
		id: "id-1",
		slug: "slug-1",
		name: "Ashley Crossing",
		city: "Woodstock",
		state: "GA",
		heroUrl: "https://example.test/hero.jpg",
		topReasons: [],
		moreReasons: [],
		stats: [],
		interests: [],
		...over,
	};
}

function reviews(
	avgRating: number,
	count: number,
	dimensionAvgs: CommunityReviewsDTO["dimensionAvgs"] = {},
): CommunityReviewsDTO {
	return { avgRating, count, dimensionAvgs, items: [] };
}

describe("buildCommunityTake", () => {
	it("nudges toward the community residents rate clearly higher", () => {
		const take = buildCommunityTake([
			community({ id: "a", name: "Alpha", reviews: reviews(4.6, 12) }),
			community({ id: "b", name: "Beta", reviews: reviews(3.9, 8) }),
		]);
		expect(take.lead).toContain("nudge you toward Alpha");
		expect(take.lead).toContain("4.6");
		expect(take.lead).toContain("3.9");
	});

	it("names a thin review sample instead of leaning on it silently", () => {
		const take = buildCommunityTake([
			community({ id: "a", name: "Alpha", reviews: reviews(4.6, 12) }),
			community({ id: "b", name: "Beta", reviews: reviews(3.9, 2) }),
		]);
		expect(take.caveat).toContain("Beta has only 2 reviews");
	});

	it("offers character, not a verdict, when nobody has reviewed", () => {
		const take = buildCommunityTake([
			community({
				id: "a",
				name: "Alpha",
				nearby: [{ bucket: "dining", count: 14 }],
				stats: [{ label: "Owner-occupied", value: "62%" }],
			}),
			community({
				id: "b",
				name: "Beta",
				nearby: [{ bucket: "dining", count: 4 }],
				stats: [{ label: "Owner-occupied", value: "84%" }],
			}),
		]);
		expect(take.lead).toContain("No resident verdict");
		expect(take.points.some((p) => p.includes("more around Alpha"))).toBe(true);
		expect(
			take.points.some((p) => p.includes("Beta is 84% owner-occupied")),
		).toBe(true);
		expect(take.caveat).toContain("not which is better");
	});

	it("speaks the widest review-dimension gap as character", () => {
		const take = buildCommunityTake([
			community({
				id: "a",
				name: "Alpha",
				reviews: reviews(4.2, 5, { quiet: 4.8, walkable: 3.0 }),
			}),
			community({
				id: "b",
				name: "Beta",
				reviews: reviews(4.1, 6, { quiet: 3.1, walkable: 3.2 }),
			}),
		]);
		// Ratings are within the noise gap, so no lean — but quiet (1.7 apart)
		// is worth a sentence, and walkable (0.2 apart) is not.
		expect(take.lead).toContain("won’t separate");
		expect(take.points.some((p) => p.includes("quiet"))).toBe(true);
		expect(take.points.some((p) => p.includes("walkable"))).toBe(false);
	});

	it("does not invent a nearby contrast from a bucket only one side has", () => {
		const take = buildCommunityTake([
			community({
				id: "a",
				name: "Alpha",
				nearby: [{ bucket: "dining", count: 14 }],
			}),
			community({ id: "b", name: "Beta" }),
		]);
		// Beta's missing bucket is unknown, not zero — no contrast to speak.
		expect(take.lead).toContain("near twins");
	});
});
