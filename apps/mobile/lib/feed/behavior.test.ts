/**
 * The §1.1 engineering red-line, as tests: every one of the 4 kinds must
 * resolve a behavior, and every surviving kind commits and flies out.
 */
import { describe, expect, it } from "vitest";
import { cardBehavior, swipeLabelsFor } from "./behavior";
import { CARD_KINDS, type CardKindV3, type FeedCardV3 } from "./card-types";

/** One minimal card per kind. Shapes only — no realistic content. */
function cardOfKind(kind: CardKindV3): FeedCardV3 {
	switch (kind) {
		case "area":
			return {
				kind: "area",
				id: "area-1",
				unit: {
					id: "city:x",
					level: "city",
					name: "X",
					state: "GA",
					centroid: { lat: 0, lng: 0 },
					communityCount: 1,
					sampleCommunityNames: [],
					stats: {},
				},
			};
		case "listing":
			return {
				kind: "listing",
				id: "l-1",
				slug: "l-1",
				address: "a",
				priceLabel: "$1",
				bedBathSqft: "1 bd",
				heroUrl: "h",
			};
		case "community":
			return {
				kind: "community",
				id: "c-1",
				slug: "c-1",
				name: "C",
				city: "X",
				state: "GA",
				heroUrl: "h",
			};
		case "tradeoff":
			return {
				kind: "tradeoff",
				id: "t-1",
				left: { label: "L", dim: "outdoors" },
				right: { label: "R", dim: "walkable" },
				scope: "life",
			};
	}
}

describe("cardBehavior", () => {
	it("resolves for all 4 kinds", () => {
		expect(CARD_KINDS).toHaveLength(4);
		for (const kind of CARD_KINDS) {
			expect(cardBehavior(cardOfKind(kind))).toBeTruthy();
		}
	});

	it("every kind commits and flies out", () => {
		// The flip is gone (2026-07-30) and the milestone/challenge/insight
		// kinds are gone (2026-08-15), so every surviving kind behaves the same.
		const commits = CARD_KINDS.filter(
			(k) => cardBehavior(cardOfKind(k)).capability.commits,
		);
		expect(commits).toHaveLength(CARD_KINDS.length);
	});

	it("area/listing/community are decide cards with directional labels", () => {
		for (const kind of ["area", "listing", "community"] as const) {
			const b = cardBehavior(cardOfKind(kind));
			expect(b.mode).toBe("decide");
			expect(swipeLabelsFor(cardOfKind(kind))).toBeTruthy();
		}
	});

	it("tradeoff is a visually split either-or, never yes/no copy", () => {
		const b = cardBehavior(cardOfKind("tradeoff"));
		if (b.mode !== "either-or") throw new Error("expected either-or");
		expect(b.split).toBe(true);
		expect([b.labels.left, b.labels.right]).toEqual(["L", "R"]);
	});
});
