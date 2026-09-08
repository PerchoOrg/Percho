import { describe, expect, it } from "vitest";
import type { AreaShape } from "./areas-dto";
import { countyKeyForPoint } from "./locate";

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
