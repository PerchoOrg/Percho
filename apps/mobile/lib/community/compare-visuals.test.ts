import type { CommunityProfile } from "@percho/shared/community-profile";
import { describe, expect, it } from "vitest";
import {
	type VisualCommunity,
	buildCompareVisuals,
	buildInShort,
	hasVisuals,
	sharedFlood,
} from "./compare-visuals";

const seg = (name: string, distance: string, bucket: string) => ({
	name,
	distance,
	bucket,
	endFraction: 0,
});

const base: CommunityProfile = {
	asOf: "2026-11-01",
	verdict: { good: [], watch: [] },
	sources: [],
};

const school = (label: string, note: string, rank: string) => ({
	group: "Schools",
	label,
	note,
	rank,
	of: "of 1,000 in GA",
	percentile: 50,
});

const series = (from: number, values: number[]) =>
	values.map((value, i) => ({ year: from + i, value, baseline: 300_000 }));

const windward: VisualCommunity = {
	profile: {
		...base,
		safety: {
			rows: [
				{ label: "Hospital", name: "Northside Forsyth", note: "2.4 mi" },
				{ label: "Fire station", name: "Station 81", note: "0.8 mi" },
				{ label: "Flood zone", name: "Minimal flood hazard", note: "Zone X" },
			],
		},
		ranks: {
			rows: [
				school("Elementary", "Creek View", "#120"),
				school("High", "Alpharetta HS", "#30"),
			],
		},
		homeValue: {
			area: "ZIP 30005",
			display: "$747K",
			change: "+60% since 2020",
			headline: "",
			baseline: "Metro Atlanta",
			series: series(2020, [470_000, 560_000, 650_000, 700_000, 747_000]),
			holding: {
				display: "≈ $940",
				basis: "",
				rows: [
					{ label: "Property tax", usd: 640 },
					{ label: "Insurance", usd: 300 },
				],
			},
		},
		dues: {
			display: "$824",
			period: "a year",
			headline: "",
			tile: { included: "", separate: "" },
			included: [],
			separate: [],
		},
	},
	tourSegments: [
		seg("Trader Joe's", "1.4 mi", "daily_errands"),
		seg("Vinny's", "2.1 mi", "dining"),
		seg("Big Creek Greenway", "0.9 mi", "outdoor"),
		seg("Halcyon", "4.8 mi", "shopping"),
	],
};

const northbrooke: VisualCommunity = {
	profile: {
		...base,
		safety: {
			rows: [{ label: "Hospital", name: "Northside Forsyth", note: "5.1 mi" }],
		},
		ranks: { rows: [school("Elementary", "Cumming", "#452")] },
		homeValue: {
			area: "ZIP 30040",
			display: "$520K",
			change: "+48% since 2020",
			headline: "",
			baseline: "Metro Atlanta",
			series: series(2022, [450_000, 500_000, 520_000]),
		},
	},
};

const bare: VisualCommunity = {};

describe("buildCompareVisuals", () => {
	const v = buildCompareVisuals([windward, northbrooke, bare]);

	it("keeps a cell per place, undefined where a place has no figure", () => {
		expect(v.safety?.rows[0]?.cells.map((c) => c?.miles)).toEqual([
			2.4,
			5.1,
			undefined,
		]);
	});

	it("does not compare how far the fire station is", () => {
		expect(v.safety?.rows.map((r) => r.label)).toEqual(["Hospital"]);
	});

	it("ends a distance axis on the next whole mile past the farthest place", () => {
		expect(v.safety?.rows[0]?.axisMiles).toBe(6);
	});

	it("says the flood zone in words, apart from the distances", () => {
		expect(v.safety?.flood).toEqual([
			"Minimal flood hazard · Zone X",
			undefined,
			undefined,
		]);
	});

	it("draws a school level only when someone has a school at it", () => {
		expect(v.schools.map((l) => l.level)).toEqual(["Elementary", "High"]);
		expect(v.schools[0]?.cells.map((c) => c?.share)).toEqual([
			12,
			46,
			undefined,
		]);
		expect(v.schools[0]?.cells[0]?.name).toBe("Creek View Elementary School");
	});

	it("takes the closest place of each kind from the film's stops", () => {
		expect(v.convenience.map((r) => r.label)).toEqual([
			"Errands",
			"Food & drink",
			"Outdoors",
		]);
		expect(v.convenience[0]?.cells[0]).toEqual({
			miles: 1.4,
			name: "Trader Joe's",
		});
		expect(v.convenience[0]?.cells[1]).toBeUndefined();
	});

	it("draws home value lines over the years every charted place has", () => {
		expect(v.potential?.years).toEqual([2022, 2023, 2024]);
		expect(v.potential?.series).toEqual([
			[650_000, 700_000, 747_000],
			[450_000, 500_000, 520_000],
			undefined,
		]);
		expect(v.potential?.max).toBe(800_000);
		expect(v.potential?.cells[1]?.display).toBe("$520K");
	});

	it("draws no line when the records share fewer than two years", () => {
		const late: VisualCommunity = {
			profile: {
				...base,
				homeValue: {
					area: "ZIP 30041",
					display: "$600K",
					change: "",
					headline: "",
					baseline: "Metro Atlanta",
					series: series(2024, [600_000, 610_000]),
				},
			},
		};
		const p = buildCompareVisuals([windward, late]).potential;
		expect(p?.years).toEqual([]);
		expect(p?.series).toEqual([undefined, undefined]);
		expect(p?.cells[1]?.display).toBe("$600K");
	});

	it("sums what a month of holding costs, and words the dues", () => {
		expect(v.cost?.holding).toEqual([
			{
				display: "≈ $940",
				usd: 940,
				rows: [
					{ label: "Property tax", usd: 640 },
					{ label: "Insurance", usd: 300 },
				],
			},
			undefined,
			undefined,
		]);
		expect(v.cost?.dues).toEqual(["$824 a year", undefined, undefined]);
	});

	it("draws nothing for places nobody has researched", () => {
		const none = buildCompareVisuals([bare, bare]);
		expect(none).toEqual({
			safety: null,
			schools: [],
			convenience: [],
			potential: null,
			cost: null,
		});
		expect(hasVisuals(none)).toBe(false);
		expect(hasVisuals(v)).toBe(true);
	});
});

describe("buildInShort", () => {
	it("names the place that stands out in each direction, with its figure", () => {
		const v = buildCompareVisuals([windward, northbrooke]);
		expect(buildInShort(v)).toEqual([
			{
				place: 0,
				text: "The best-ranked schools nearby — Top 3–12% in Georgia.",
			},
			{ place: 0, text: "The shortest drive to a hospital — 2.4 mi." },
			{ place: 1, text: "The lowest home values — around $520K." },
		]);
	});

	it("writes no line where only one place has a figure, or the gap is small", () => {
		// One place alone, compared with a place nobody has researched.
		expect(buildInShort(buildCompareVisuals([windward, bare]))).toEqual([]);
		// The same place twice: every gap is zero.
		expect(buildInShort(buildCompareVisuals([windward, windward]))).toEqual([]);
	});
});

describe("sharedFlood", () => {
	it("is the zone when every place has the same one", () => {
		expect(sharedFlood(["Zone X", "Zone X", "Zone X"])).toBe("Zone X");
		expect(sharedFlood(["Zone X", "Zone AE"])).toBeNull();
		expect(sharedFlood(["Zone X", undefined])).toBeNull();
	});
});
