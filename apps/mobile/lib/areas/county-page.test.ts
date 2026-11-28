import { describe, expect, it } from "vitest";
import type { AreaShape } from "./areas-dto";
import {
	insideCounty,
	shapeBox,
	standingOf,
	standingWords,
} from "./county-page";

const ranked = ["a", "b", "c", "d"].map((key) => ({ area: { key } }));

describe("standingOf", () => {
	it("places a county, best first, as a share and a dot position", () => {
		expect(standingOf(ranked, "a")).toEqual({
			place: 1,
			of: 4,
			share: 25,
			position: 1,
		});
		expect(standingOf(ranked, "d")?.position).toBe(0);
		expect(standingOf(ranked, "zz")).toBeUndefined();
	});
});

describe("standingWords", () => {
	it("speaks only in the top half", () => {
		expect(standingWords(standingOf(ranked, "b"), "cost")).toBe(
			"Top 50% for low cost",
		);
		expect(standingWords(standingOf(ranked, "c"), "schools")).toBeUndefined();
	});
});

const square: AreaShape = {
	key: "sq",
	name: "Square",
	centre: [-84, 34],
	rings: [
		[
			[-84.5, 33.5],
			[-83.5, 33.5],
			[-83.5, 34.5],
			[-84.5, 34.5],
		],
	],
};

describe("shapeBox / insideCounty", () => {
	it("boxes the outline and keeps only points inside it", () => {
		expect(shapeBox(square)).toEqual({
			minLat: 33.5,
			maxLat: 34.5,
			minLng: -84.5,
			maxLng: -83.5,
		});
		const pts = [
			{ id: 1, lat: 34, lng: -84 },
			{ id: 2, lat: 35, lng: -84 },
			{ id: 3 },
		];
		expect(insideCounty(pts, [square], "sq").map((p) => p.id)).toEqual([1]);
	});
});
