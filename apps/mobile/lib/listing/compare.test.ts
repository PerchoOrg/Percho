import { describe, expect, it } from "vitest";
import { buildCompareTable } from "./compare";
import type { ListingDetailDTO } from "./detail-dto";

const base = (over: Partial<ListingDetailDTO>): ListingDetailDTO => ({
	id: "x",
	slug: "x",
	address: "1 St",
	city: "Duluth",
	state: "GA",
	photos: [],
	comps: { cohortLabel: "Duluth", pricesUsd: [] },
	...over,
});

describe("buildCompareTable", () => {
	it("lays out one cell per home, in caller order, blank when missing", () => {
		const t = buildCompareTable(
			[
				base({
					id: "a",
					price: 500_000,
					sqft: 2500,
					beds: 4,
					baths: 3,
					hoaRaw: "$100/mo",
					neighborhood: "Sugarloaf",
					schools: [
						{
							level: "elementary",
							name: "Simpson Elementary",
							distanceKm: 1,
							assigned: false,
							proficiencyPct: 71.4,
						},
					],
				}),
				base({ id: "b", price: 300_000, beds: 3 }),
			],
			0.06,
		);
		expect(t.headers.map((h) => h.id)).toEqual(["a", "b"]);
		const row = (label: string) => t.rows.find((r) => r.label === label)?.cells;
		expect(row("Price")).toEqual(["$500,000", "$300,000"]);
		expect(row("Per sqft")).toEqual(["$200", undefined]);
		expect(row("Beds · baths")).toEqual(["4 · 3", "3 · —"]);
		expect(row("HOA")).toEqual(["$100/mo", undefined]);
		expect(row("Elementary")).toEqual(["71% · Simpson Elementary", undefined]);
		expect(row("Neighbourhood")).toEqual(["Sugarloaf", undefined]);
		expect(row("Monthly, all-in")?.[0]).toMatch(/^\$[\d,]+\/mo$/);
	});

	it("drops rows nobody has data for and never invents a score", () => {
		const t = buildCompareTable([base({ id: "a" }), base({ id: "b" })], 0.06);
		expect(t.rows).toEqual([]);
	});
});
