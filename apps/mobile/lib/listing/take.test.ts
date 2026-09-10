import { describe, expect, it } from "vitest";
import type { ListingDetailDTO, SchoolDTO } from "./detail-dto";
import { buildHomeTake } from "./take";

const RATE = 0.065;

function home(over: Partial<ListingDetailDTO> = {}): ListingDetailDTO {
	return {
		id: "id-1",
		slug: "slug-1",
		address: "12 Oak St",
		city: "Marietta",
		state: "GA",
		photos: [],
		comps: { cohortLabel: "Marietta", pricesUsd: [] },
		...over,
	};
}

function school(pct: number): SchoolDTO {
	return {
		level: "elementary",
		name: "Test Elementary",
		distanceKm: 1,
		assigned: false,
		proficiencyPct: pct,
	};
}

describe("buildHomeTake", () => {
	it("leans on the home that wins every counted dimension", () => {
		const take = buildHomeTake(
			[
				home({
					id: "a",
					address: "12 Oak St",
					price: 400_000,
					sqft: 2000,
					schools: [school(70)],
				}),
				home({
					id: "b",
					address: "9 Elm Ave",
					price: 500_000,
					sqft: 2100,
					schools: [school(55)],
				}),
			],
			RATE,
		);
		expect(take.lead).toContain("I’d lean 12 Oak St");
		// Every winning dimension argues itself in the points.
		expect(take.points.some((p) => p.includes("a month less"))).toBe(true);
		expect(take.points.some((p) => p.includes("a square foot"))).toBe(true);
		expect(take.points.some((p) => p.includes("% proficient"))).toBe(true);
		// A lean always carries its counterweight.
		expect(take.caveat).toBeDefined();
	});

	it("names the trade instead of a winner when the wins split", () => {
		const take = buildHomeTake(
			[
				home({
					id: "a",
					address: "12 Oak St",
					price: 400_000,
					sqft: 1600,
					schools: [school(50)],
				}),
				home({
					id: "b",
					address: "9 Elm Ave",
					price: 500_000,
					sqft: 2500,
					schools: [school(65)],
				}),
			],
			RATE,
		);
		expect(take.lead).toContain("a trade, not a ranking");
		// Both homes get their case made.
		expect(take.points.some((p) => p.includes("12 Oak St"))).toBe(true);
		expect(take.points.some((p) => p.includes("9 Elm Ave"))).toBe(true);
	});

	it("says out loud when a third home leads on nothing measurable", () => {
		const take = buildHomeTake(
			[
				home({ id: "a", address: "12 Oak St", price: 400_000, sqft: 1600 }),
				home({ id: "b", address: "9 Elm Ave", price: 500_000, sqft: 2500 }),
				home({ id: "c", address: "3 Pine Ct", price: 500_000, sqft: 1600 }),
			],
			RATE,
		);
		// a wins monthly, b wins $/sqft, c wins nothing.
		expect(take.caveat).toContain("3 Pine Ct");
		expect(take.caveat).toContain("anything I can measure");
	});

	it("admits when the figures barely split the homes", () => {
		const twin = {
			price: 450_000,
			sqft: 2000,
			schools: [school(60)],
		};
		const take = buildHomeTake(
			[
				home({ id: "a", address: "12 Oak St", ...twin }),
				home({ id: "b", address: "9 Elm Ave", ...twin }),
			],
			RATE,
		);
		expect(take.lead).toContain("closer than they look");
		expect(take.points).toEqual([]);
	});

	it("never argues schools when no home has a school figure", () => {
		const take = buildHomeTake(
			[
				home({ id: "a", address: "12 Oak St", price: 400_000 }),
				home({ id: "b", address: "9 Elm Ave", price: 500_000 }),
			],
			RATE,
		);
		expect(take.points.some((p) => p.includes("proficient"))).toBe(false);
	});

	it("flags the home whose school figures are missing as a blind spot", () => {
		const take = buildHomeTake(
			[
				home({
					id: "a",
					address: "12 Oak St",
					price: 400_000,
					schools: [school(70)],
				}),
				home({
					id: "b",
					address: "9 Elm Ave",
					price: 420_000,
					schools: [school(55)],
				}),
				home({ id: "c", address: "3 Pine Ct", price: 410_000 }),
			],
			RATE,
		);
		expect(
			take.points.some((p) => p.includes("No school figures for 3 Pine Ct")),
		).toBe(true);
	});
});
