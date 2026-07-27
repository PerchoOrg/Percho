/**
 * The §1.1 engineering red-line, as tests: every one of the 8 kinds must
 * resolve a behavior, and the three kinds that break the default pattern
 * (milestone can't commit, ask/milestone have no data face, only
 * listing/community/area are undoable) must stay broken in exactly that way.
 */
import { describe, expect, it } from "vitest";
import {
	CHALLENGE_REVEAL_MS,
	MILESTONE_CAP_RATIO,
	cardBehavior,
} from "./behavior";
import {
	CARD_KINDS,
	type CardKindV3,
	type FeedCardV3,
	type FunnelStage,
} from "./card-types";

/** One minimal card per kind. Shapes only — no realistic content. */
function cardOfKind(kind: CardKindV3): FeedCardV3 {
	switch (kind) {
		case "ask":
			return {
				kind: "ask",
				id: "ask-1",
				layer: "purpose",
				q: "q",
				choice: {
					form: "yes-no",
					affirm: { type: "intent", value: "primary" },
				},
			};
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
		case "challenge":
			return {
				kind: "challenge",
				id: "ch-1",
				tag: "TAG",
				q: "q",
				left: { label: "L", value: 1 },
				right: { label: "R", value: 2 },
				answer: "left",
				revealLabel: "r",
				teach: "t",
			};
		case "insight":
			return {
				kind: "insight",
				id: "i-1",
				dim: "trails",
				text: "t",
				evidence: "e",
			};
		case "milestone":
			return {
				kind: "milestone",
				id: "m-1",
				fromStage: 0 as FunnelStage,
				toStage: 1 as FunnelStage,
				headline: "h",
				sub: "s",
				chips: [],
			};
	}
}

describe("cardBehavior", () => {
	it("resolves for all 8 kinds", () => {
		expect(CARD_KINDS).toHaveLength(8);
		for (const kind of CARD_KINDS) {
			expect(cardBehavior(cardOfKind(kind))).toBeTruthy();
		}
	});

	it("milestone is pannable but never commits, capped at 30%", () => {
		const b = cardBehavior(cardOfKind("milestone"));
		expect(b.mode).toBe("ceremony");
		expect(b.capability.pannable).toBe(true);
		expect(b.capability.commits).toBe(false);
		expect(b.capability.maxDisplacementRatio).toBe(MILESTONE_CAP_RATIO);
		expect(MILESTONE_CAP_RATIO).toBe(0.3);
	});

	it("only listing / community / area are undoable (§1.8)", () => {
		const undoable = CARD_KINDS.filter(
			(k) => cardBehavior(cardOfKind(k)).undoable,
		);
		expect(undoable.sort()).toEqual(["area", "community", "listing"]);
	});

	it("ask and milestone have no data face", () => {
		const flippable = CARD_KINDS.filter(
			(k) => cardBehavior(cardOfKind(k)).capability.flippable,
		);
		expect(flippable.sort()).toEqual(["area", "community", "listing"]);
	});

	it("challenge holds 900ms before flyout", () => {
		const b = cardBehavior(cardOfKind("challenge"));
		expect(b.mode).toBe("reveal");
		expect(b.capability.revealMs).toBe(CHALLENGE_REVEAL_MS);
		expect(CHALLENGE_REVEAL_MS).toBe(900);
	});

	it("no card other than challenge holds before flyout", () => {
		const holding = CARD_KINDS.filter(
			(k) => cardBehavior(cardOfKind(k)).capability.revealMs !== undefined,
		);
		expect(holding).toEqual(["challenge"]);
	});

	it("tradeoff is a visually split either-or, never yes/no copy", () => {
		const b = cardBehavior(cardOfKind("tradeoff"));
		if (b.mode !== "either-or") throw new Error("expected either-or");
		expect(b.split).toBe(true);
		expect([b.labels.left, b.labels.right]).toEqual(["L", "R"]);
	});

	it("an either-or ask borrows the option names and does not split", () => {
		const b = cardBehavior({
			kind: "ask",
			id: "ask-2",
			layer: "lifestyle",
			q: "q",
			choice: {
				form: "either-or",
				left: { label: "Modern", record: { type: "dim", dim: "hip" } },
				right: { label: "Classic", record: { type: "dim", dim: "quiet" } },
			},
		});
		if (b.mode !== "either-or") throw new Error("expected either-or");
		expect(b.split).toBe(false);
		expect(b.labels).toEqual({ left: "Modern", right: "Classic" });
	});

	it("insight carries the third neutral pill", () => {
		const b = cardBehavior(cardOfKind("insight"));
		if (b.mode !== "confirm") throw new Error("expected confirm");
		expect(b.neutralLabel).toBe("Not sure");
	});
});
