import { describe, expect, it } from "vitest";
import type { InsightDTO } from "./detail-dto";
import { rankInsights, summarizeKinds } from "./insights";

function card(
	id: string,
	kind: InsightDTO["kind"],
	theme: string,
	decisiveness: 1 | 2 | 3,
): InsightDTO {
	return {
		id,
		headline: id,
		detail: "d",
		kind,
		theme,
		basis: [{ note: "n", url: "https://x.y" }],
		decisiveness,
	};
}

describe("rankInsights", () => {
	it("orders by weight, then watch < plus < know, then the model's order", () => {
		const out = rankInsights(
			[
				card("a", "know", "house", 2),
				card("b", "plus", "money", 3),
				card("c", "watch", "money", 2),
				card("d", "watch", "house", 3),
				card("e", "know", "vibe", 2),
			],
			{},
		);
		expect(out.map((c) => c.id)).toEqual(["d", "b", "c", "a", "e"]);
	});

	it("lets theme affinity lift a lighter card", () => {
		const out = rankInsights(
			[card("house3", "watch", "house", 3), card("pets2", "know", "pets", 2)],
			{ pets: 1 },
		);
		// pets: 2 × (1+1) = 4 beats house: 3 × 1 = 3.
		expect(out.map((c) => c.id)).toEqual(["pets2", "house3"]);
	});

	it("does not mutate its input", () => {
		const input = [
			card("a", "know", "house", 1),
			card("b", "watch", "house", 3),
		];
		rankInsights(input, {});
		expect(input.map((c) => c.id)).toEqual(["a", "b"]);
	});
});

describe("summarizeKinds", () => {
	it("counts in kind order and drops empty kinds", () => {
		expect(
			summarizeKinds([
				card("a", "know", "house", 1),
				card("b", "watch", "house", 3),
				card("c", "watch", "money", 2),
			]),
		).toEqual([
			{ kind: "watch", count: 2, label: "to watch" },
			{ kind: "know", count: 1, label: "good to know" },
		]);
	});

	it("is empty for no cards", () => {
		expect(summarizeKinds([])).toEqual([]);
	});
});
