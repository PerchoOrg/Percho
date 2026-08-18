import { describe, expect, it } from "vitest";
import { type StatCell, placeStats } from "./place-stats";

describe("placeStats — deterministic placeholder stat bars", () => {
	it("returns the same cells for the same id (no re-roll on re-render)", () => {
		expect(placeStats("abc-1", "community")).toEqual(
			placeStats("abc-1", "community"),
		);
		expect(placeStats("abc-1", "city")).toEqual(placeStats("abc-1", "city"));
	});

	it("returns different cells for different ids", () => {
		const a = placeStats("card-1", "community");
		const b = placeStats("card-2", "community");
		expect(a).not.toEqual(b);
	});

	it("community = Schools / Safety / Convenience / Growth", () => {
		const cells = placeStats("abc-1", "community");
		expect(cells.map((c) => c.label)).toEqual([
			"Schools",
			"Safety",
			"Convenience",
			"Growth",
		]);
		// Schools/Safety are N/10, Convenience an index, Growth a percentage.
		expect(cells[0]!.value).toMatch(/^(10|\d)\/10$/);
		expect(cells[1]!.value).toMatch(/^(10|\d)\/10$/);
		expect(cells[2]!.value).toMatch(/^\d+$/);
		expect(cells[3]!.value).toMatch(/^\+\d\.\d%$/);
	});

	it("city = Jobs / Cost of Living / Commute / Growth", () => {
		const cells = placeStats("abc-1", "city");
		expect(cells.map((c) => c.label)).toEqual([
			"Jobs",
			"Cost of Living",
			"Commute",
			"Growth",
		]);
		expect(cells[0]!.value).toMatch(/^\+\d\.\d%$/);
		expect(cells[1]!.value).toMatch(/^\d+$/);
		expect(cells[2]!.value).toMatch(/^\d+ min$/);
		expect(cells[3]!.value).toMatch(/^\+\d\.\d%$/);
	});

	it("values stay in plausible ranges", () => {
		for (let i = 0; i < 50; i++) {
			const id = `range-${i}`;
			const community = placeStats(id, "community");
			expect(community[0]!.value).toMatch(/^([6-9]|10)\/10$/);
			expect(community[1]!.value).toMatch(/^([6-9]|10)\/10$/);
			const city = placeStats(id, "city");
			expect(city[2]!.value).toMatch(/^\d+ min$/);
		}
	});

	it("keeps a stable StatCell shape for the future API swap", () => {
		const cells: StatCell[] = placeStats("shape-check", "city");
		expect(cells).toHaveLength(4);
		for (const c of cells) {
			expect(typeof c.label).toBe("string");
			expect(typeof c.value).toBe("string");
		}
	});
});
