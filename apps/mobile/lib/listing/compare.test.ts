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

describe("buildCompareTable — row order follows declared priorities", () => {
	const HOMES = [
		base({
			id: "a",
			price: 400_000,
			sqft: 2000,
			schools: [
				{
					level: "elementary",
					name: "Sixes Elementary",
					distanceKm: 1,
					assigned: false,
					proficiencyPct: 70,
				},
			],
		}),
		base({
			id: "b",
			price: 500_000,
			sqft: 2100,
			schools: [
				{
					level: "elementary",
					name: "Bells Ferry",
					distanceKm: 1,
					assigned: false,
					proficiencyPct: 55,
				},
			],
		}),
	];

	it("leaves the built order alone when no weights are passed", () => {
		const t = buildCompareTable(HOMES, 0.065);
		expect(t.rows[0]?.label).toBe("Price");
	});

	it("floats the schools rows to the top for a schools-first buyer", () => {
		const t = buildCompareTable(HOMES, 0.065, {
			schools: 3,
			cost: 1,
			commute: 1,
			community: 1,
		});
		expect(t.rows[0]?.label).toBe("Elementary");
		// Nothing was dropped — a weight orders, it never filters.
		expect(t.rows.some((r) => r.label === "Price")).toBe(true);
	});

	it("keeps every figure regardless of weighting", () => {
		const neutral = buildCompareTable(HOMES, 0.065);
		const weighted = buildCompareTable(HOMES, 0.065, {
			schools: 3,
			cost: 0,
			commute: 1,
			community: 1,
		});
		expect(weighted.rows.map((r) => r.label).sort()).toEqual(
			neutral.rows.map((r) => r.label).sort(),
		);
	});
});
