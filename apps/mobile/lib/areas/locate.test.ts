import { describe, expect, it } from "vitest";
import type { AreaShape } from "./areas-dto";
import {
	countyKeyForPoint,
	savedCitiesByCounty,
	savedCityNote,
} from "./locate";

/** A unit square from (x,y) to (x+1,y+1), as `[lng, lat]` like the real file. */
function square(key: string, x: number, y: number): AreaShape {
	return {
		key,
		name: key,
		centre: [x + 0.5, y + 0.5],
		rings: [
			[
				[x, y],
				[x + 1, y],
				[x + 1, y + 1],
				[x, y + 1],
				[x, y],
			],
		],
	};
}

const WEST = square("west", -85, 33);
const EAST = square("east", -84, 33);
const SHAPES = [WEST, EAST];

describe("countyKeyForPoint", () => {
	it("finds the county containing the point", () => {
		expect(countyKeyForPoint(33.5, -84.5, SHAPES)).toBe("west");
		expect(countyKeyForPoint(33.5, -83.5, SHAPES)).toBe("east");
	});

	it("returns undefined outside the covered metro rather than guessing", () => {
		expect(countyKeyForPoint(40.7, -74.0, SHAPES)).toBeUndefined();
		expect(countyKeyForPoint(33.5, -86.5, SHAPES)).toBeUndefined();
	});

	it("does not double-count a vertex it passes level with", () => {
		// A ray from a point at exactly a vertex's latitude crosses two edges
		// meeting there; the half-open y test makes that count once.
		expect(countyKeyForPoint(33, -84.5, SHAPES)).toBeDefined();
	});

	it("handles a county made of several rings", () => {
		const split: AreaShape = {
			key: "split",
			name: "Split",
			centre: [-80, 33],
			rings: [...square("a", -81, 33).rings, ...square("b", -79, 33).rings],
		};
		expect(countyKeyForPoint(33.5, -80.5, [split])).toBe("split");
		expect(countyKeyForPoint(33.5, -78.5, [split])).toBe("split");
		expect(countyKeyForPoint(33.5, -79.5, [split])).toBeUndefined();
	});

	it("survives a degenerate ring without throwing", () => {
		const bad: AreaShape = {
			key: "bad",
			name: "Bad",
			centre: [0, 0],
			rings: [[]],
		};
		expect(countyKeyForPoint(33.5, -84.5, [bad])).toBeUndefined();
	});

	it("returns the first match, so the order of the shape file is the tie-break", () => {
		// Overlapping shapes should not happen in the real file; if they ever do,
		// the answer must at least be deterministic rather than arbitrary.
		const overlap = [square("first", -85, 33), square("second", -85, 33)];
		expect(countyKeyForPoint(33.5, -84.5, overlap)).toBe("first");
	});
});

describe("savedCitiesByCounty", () => {
	const units = [
		{
			id: "city:woodstock-ga",
			name: "Woodstock",
			centroid: { lat: 34.1, lng: -84.52 },
		},
		{
			id: "city:canton-ga",
			name: "Canton",
			centroid: { lat: 34.24, lng: -84.49 },
		},
		{
			id: "city:decatur-ga",
			name: "Decatur",
			centroid: { lat: 33.77, lng: -84.3 },
		},
	];
	/** A box from (w,s) to (e,n) as `[lng, lat]`, like the real shape file. */
	const box = (
		w: number,
		s: number,
		e: number,
		n: number,
	): AreaShape["rings"][number] => [
		[w, s],
		[e, s],
		[e, n],
		[w, n],
		[w, s],
	];
	// Two boxes standing in for county outlines.
	const shapes: AreaShape[] = [
		{
			key: "cherokee",
			name: "Cherokee",
			centre: [-84.5, 34.17],
			rings: [box(-84.7, 33.95, -84.3, 34.4)],
		},
		{
			key: "dekalb",
			name: "DeKalb",
			centre: [-84.22, 33.8],
			rings: [box(-84.35, 33.65, -84.1, 33.95)],
		},
	];

	it("groups saved cities under the county that contains them", () => {
		const got = savedCitiesByCounty(
			["city:woodstock-ga", "city:canton-ga", "city:decatur-ga"],
			units,
			shapes,
		);
		expect(got.get("cherokee")).toEqual(["Woodstock", "Canton"]);
		expect(got.get("dekalb")).toEqual(["Decatur"]);
	});

	it("ignores units the buyer has not saved", () => {
		const got = savedCitiesByCounty(["city:decatur-ga"], units, shapes);
		expect(got.has("cherokee")).toBe(false);
		expect(got.get("dekalb")).toEqual(["Decatur"]);
	});

	it("leaves a county with nothing saved absent rather than empty", () => {
		// So a caller can test presence with a lookup instead of a length check.
		expect(savedCitiesByCounty([], units, shapes).size).toBe(0);
	});

	it("drops a saved city outside the covered metro", () => {
		const far = [
			{
				id: "city:ellijay-ga",
				name: "Ellijay",
				centroid: { lat: 34.69, lng: -84.48 },
			},
		];
		expect(savedCitiesByCounty(["city:ellijay-ga"], far, shapes).size).toBe(0);
	});
});

describe("savedCityNote", () => {
	it("names one city", () => {
		expect(savedCityNote(["Woodstock"])).toBe("Woodstock, saved");
	});

	it("names two", () => {
		expect(savedCityNote(["Woodstock", "Canton"])).toBe(
			"Woodstock and Canton, saved",
		);
	});

	it("counts the rest beyond two, so the row cannot overflow", () => {
		expect(savedCityNote(["Woodstock", "Canton", "Ball Ground"])).toBe(
			"Woodstock and 2 more, saved",
		);
	});

	it("says nothing when nothing is saved there", () => {
		expect(savedCityNote([])).toBeUndefined();
		expect(savedCityNote(undefined)).toBeUndefined();
	});
});
