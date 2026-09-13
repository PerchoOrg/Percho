import { describe, expect, it } from "vitest";
import type { NeighborhoodScores } from "../feed/card-types";
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

const convenience = (
	score: number | null,
	nearestM?: number,
): NeighborhoodScores => ({
	overall: score,
	dims: [
		{
			key: "convenience",
			label: "Convenience",
			score,
			count: score === null ? 0 : 5,
			...(nearestM !== undefined ? { nearestM } : {}),
		},
	],
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
		// Price lives in the header column now, not in a row.
		expect(t.headers.map((h) => h.price)).toEqual(["$500,000", "$300,000"]);
		const basics = (label: string) =>
			t.basics.find((r) => r.label === label)?.cells;
		expect(basics("Per sqft")).toEqual(["$200", undefined]);
		expect(basics("Beds · baths")).toEqual(["4 · 3", "3 · —"]);
		expect(basics("HOA")).toEqual(["$100/mo", undefined]);
		expect(basics("Neighbourhood")).toEqual(["Sugarloaf", undefined]);
		expect(basics("Monthly, all-in")?.[0]).toMatch(/^\$[\d,]+\/mo$/);
		const schools = t.aspects.find((a) => a.key === "schools");
		expect(schools?.rows.find((r) => r.label === "Elementary")?.cells).toEqual([
			"71% · Simpson Elementary",
			undefined,
		]);
	});

	it("always emits the owner's four aspects, in his order", () => {
		const t = buildCompareTable([base({ id: "a" }), base({ id: "b" })], 0.06);
		expect(t.aspects.map((a) => a.key)).toEqual([
			"schools",
			"convenience",
			"safety",
			"potential",
		]);
	});

	it("drops rows nobody has data for and never invents a score", () => {
		const t = buildCompareTable([base({ id: "a" }), base({ id: "b" })], 0.06);
		expect(t.basics).toEqual([]);
		for (const a of t.aspects) expect(a.rows).toEqual([]);
	});

	it("builds convenience from the feed card's score, treating null as absent", () => {
		const t = buildCompareTable(
			[
				base({ id: "a", scores: convenience(7.8, 320) }),
				base({ id: "b", scores: convenience(null) }),
			],
			0.06,
		);
		const conv = t.aspects.find((a) => a.key === "convenience");
		expect(
			conv?.rows.find((r) => r.label === "Errands, shops & food")?.cells,
		).toEqual(["7.8", undefined]);
		expect(
			conv?.rows.find((r) => r.label === "Closest of those")?.cells,
		).toEqual(["0.2 mi", undefined]);
	});

	it("carries researched safety notes, never a number", () => {
		const insight = (headline: string) => ({
			id: headline,
			headline,
			detail: "…",
			kind: "watch",
			theme: "safety",
			basis: [{ note: "county records" }],
			decisiveness: 2 as const,
		});
		const t = buildCompareTable(
			[
				base({ id: "a", insights: [insight("Flood zone AE"), insight("x")] }),
				base({ id: "b", insights: [{ ...insight("Roof age"), theme: "hoa" }] }),
			],
			0.06,
		);
		const safety = t.aspects.find((a) => a.key === "safety");
		expect(safety?.rows.find((r) => r.label === "On record")?.cells).toEqual([
			"Flood zone AE · +1 more",
			undefined,
		]);
		expect(safety?.note).toContain("doesn’t score safety");
	});

	it("reads potential from today's signals only", () => {
		const t = buildCompareTable(
			[
				base({
					id: "a",
					price: 400_000,
					sqft: 2000,
					daysOnMarket: 12,
					rentEstimate: {
						monthlyUsd: 2400,
						asOf: "2026-08-01",
						source: "Zillow ZORI",
						zip: "30096",
					},
					comps: {
						cohortLabel: "Duluth",
						pricesUsd: [],
						medianPricePerSqft: 250,
					},
				}),
				base({ id: "b", price: 500_000 }),
			],
			0.06,
		);
		const pot = t.aspects.find((a) => a.key === "potential");
		// 2400 × 12 / 400k = 7.2% gross.
		expect(pot?.rows.find((r) => r.label === "Rent vs price")?.cells).toEqual([
			"7.2%",
			undefined,
		]);
		// $200/sqft against a $250 city median = 20% under.
		expect(
			pot?.rows.find((r) => r.label === "Asking vs its city")?.cells,
		).toEqual(["20% under", undefined]);
		expect(pot?.rows.find((r) => r.label === "Days on market")?.cells).toEqual([
			"12",
			undefined,
		]);
	});
});

describe("buildCompareTable — basics order follows declared priorities", () => {
	const HOMES = [
		base({
			id: "a",
			price: 400_000,
			sqft: 2000,
			neighborhood: "Sixes",
		}),
		base({
			id: "b",
			price: 500_000,
			sqft: 2100,
			neighborhood: "Bells Ferry",
		}),
	];

	it("leaves the built order alone when no weights are passed", () => {
		const t = buildCompareTable(HOMES, 0.065);
		expect(t.basics[0]?.label).toBe("Monthly, all-in");
	});

	it("floats the community rows up for a community-first buyer", () => {
		const t = buildCompareTable(HOMES, 0.065, {
			schools: 1,
			cost: 1,
			commute: 1,
			community: 3,
		});
		expect(t.basics[0]?.label).toBe("Neighbourhood");
		// Nothing was dropped — a weight orders, it never filters.
		expect(t.basics.some((r) => r.label === "Monthly, all-in")).toBe(true);
	});

	it("keeps every figure regardless of weighting", () => {
		const neutral = buildCompareTable(HOMES, 0.065);
		const weighted = buildCompareTable(HOMES, 0.065, {
			schools: 3,
			cost: 0,
			commute: 1,
			community: 1,
		});
		expect(weighted.basics.map((r) => r.label).sort()).toEqual(
			neutral.basics.map((r) => r.label).sort(),
		);
	});
});
