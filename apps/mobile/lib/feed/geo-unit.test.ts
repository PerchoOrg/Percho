/**
 * `finestAvailableLevel` is the hinge the Stage-2 degradation hangs on
 * (PLAN §3). These tests pin BOTH readings — the city-only pool we ship on
 * today, and the zip-bearing pool the reverse-geocode backfill will produce —
 * so that backfill is provably a no-op on the engine: the same function, given
 * a deeper pool, narrows further without any code change.
 */
import { describe, expect, it } from "vitest";
import {
	type GeoLevel,
	type GeoUnit,
	finestAvailableLevel,
	unitsAtLevel,
} from "./geo-unit";

function unit(id: string, level: GeoLevel): GeoUnit {
	return {
		id,
		level,
		name: id,
		state: "GA",
		centroid: { lat: 33.7, lng: -84.3 },
		communityCount: 1,
		sampleCommunityNames: [],
		stats: {},
	};
}

describe("finestAvailableLevel", () => {
	it("returns null for an empty pool", () => {
		expect(finestAvailableLevel([])).toBeNull();
	});

	it("city-reading (today): a city-only pool narrows to city", () => {
		const pool = [
			unit("city:decatur-ga", "city"),
			unit("city:brookhaven-ga", "city"),
		];
		expect(finestAvailableLevel(pool)).toBe("city");
	});

	it("city-reading: an area+city pool still narrows to city", () => {
		const pool = [
			unit("area:north-fulton", "area"),
			unit("city:alpharetta-ga", "city"),
		];
		expect(finestAvailableLevel(pool)).toBe("city");
	});

	it("zip-reading (post-backfill): one zip unit deepens the whole engine", () => {
		const pool = [
			unit("area:north-fulton", "area"),
			unit("city:decatur-ga", "city"),
			unit("zip:30030", "zip"),
		];
		expect(finestAvailableLevel(pool)).toBe("zip");
	});

	it("falls back to area when that is all there is", () => {
		expect(finestAvailableLevel([unit("area:north-fulton", "area")])).toBe(
			"area",
		);
	});

	it("is unaffected by ordering", () => {
		const deep = unit("zip:30030", "zip");
		const shallow = unit("area:north-fulton", "area");
		expect(finestAvailableLevel([deep, shallow])).toBe("zip");
		expect(finestAvailableLevel([shallow, deep])).toBe("zip");
	});
});

describe("unitsAtLevel", () => {
	it("selects only the requested level", () => {
		const pool = [
			unit("city:a", "city"),
			unit("zip:1", "zip"),
			unit("city:b", "city"),
		];
		expect(unitsAtLevel(pool, "city").map((u) => u.id)).toEqual([
			"city:a",
			"city:b",
		]);
		expect(unitsAtLevel(pool, "area")).toEqual([]);
	});
});
