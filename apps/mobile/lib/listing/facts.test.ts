import { describe, expect, it } from "vitest";
import type { ListingDetailDTO } from "./detail-dto";
import { MAX_FACTS, buildFacts } from "./facts";

const base: ListingDetailDTO = {
	id: "l1",
	slug: "s",
	address: "355 Morgans Creek Ct NW",
	city: "Kennesaw",
	state: "GA",
	photos: [],
	comps: { cohortLabel: "Kennesaw", pricesUsd: [] },
};

describe("buildFacts", () => {
	it("renders nothing for an empty schema — no invented rows", () => {
		expect(buildFacts(base)).toEqual([]);
	});

	it("prefers the raw lot text over the mirror acres", () => {
		expect(
			buildFacts({ ...base, lotSizeRaw: "0.31 acres", lotSizeAcres: 0.4 }),
		).toEqual([{ label: "LOT", value: "0.31 acres" }]);
		expect(buildFacts({ ...base, lotSizeAcres: 0.31 })).toEqual([
			{ label: "LOT", value: "0.31 acres" },
		]);
	});

	it("normalises a parseable HOA to $/mo and passes raw text through otherwise", () => {
		expect(buildFacts({ ...base, hoaRaw: "$660/yr" })).toEqual([
			{ label: "HOA", value: "$55 / mo" },
		]);
		expect(buildFacts({ ...base, hoaRaw: "voluntary" })).toEqual([
			{ label: "HOA", value: "voluntary" },
		]);
	});

	it("caps at MAX_FACTS", () => {
		const facts = buildFacts({
			...base,
			lotSizeRaw: "0.31 acres",
			hoaRaw: "$55/mo",
			yearBuilt: 2004,
			neighborhood: "Morgans Creek",
			zip: "30152",
			mlsNumber: "7382914",
		});
		expect(facts).toHaveLength(MAX_FACTS);
		expect(facts.map((f) => f.label)).toContain("MLS");
	});
});
