import { describe, expect, it } from "vitest";
import {
	type VisualCity,
	buildCityCompareVisuals,
	buildCityInShort,
	citySlugsOf,
} from "./compare-visuals";

/** A city with only what the cards read; figures shaped like the live API's. */
function city(over: Partial<VisualCity> & { name: string }): VisualCity {
	return {
		stats: [],
		compare: { against: "Georgia", rows: [], source: { name: "ACS" } },
		growth: { series: [], takeaway: "", source: { name: "Census" } },
		education: { schools: [], measure: "", rows: [], note: "" },
		gettingAround: [],
		rankings: [],
		planning: [],
		...over,
	};
}

const suwanee = city({
	name: "Suwanee",
	stats: [{ label: "Median rent", value: "$1,885", note: "a month" }],
	compare: {
		against: "Georgia",
		rows: [
			{
				label: "Median home value",
				city: { value: 480600, display: "$480,600" },
				state: { value: 300000, display: "$300,000" },
				takeaway: "1.6× the state",
			},
		],
		source: { name: "ACS" },
	},
	growth: {
		series: [
			{ label: "1990", value: 2412 },
			{ label: "2000", value: 8725 },
			{ label: "2020", value: 20786 },
		],
		takeaway: "",
		source: { name: "Census" },
	},
	gettingAround: [
		{
			label: "Downtown Atlanta · 33 mi",
			value: "~50 min",
			minutes: { min: 49, max: 74 },
		},
	],
	everyday: [
		{ kind: "Groceries", places: [{ name: "Kroger", miles: 0.7 }] },
		{ kind: "Hospital", places: [{ name: "Emory Johns Creek", miles: 6.4 }] },
	],
	hazards: {
		overall: "Relatively Low",
		tracts: 4,
		miles: 2,
		version: "1.20",
		rows: [{ label: "Flood", rating: "Relatively Moderate" }],
	},
	crime: {
		violent: "Well below",
		against: "Georgia",
		year: 2025,
		agency: "Suwanee Police Department",
		source: { name: "FBI" },
	},
	holding: {
		display: "≈ $740",
		basis: "",
		rows: [
			{ label: "Property tax", usd: 481 },
			{ label: "Electricity", usd: 159 },
		],
	},
	allSchools: [
		{ name: "Riverside Elementary", level: "elementary", share: 9, miles: 1.2 },
		{ name: "Burnette Elementary", level: "elementary", share: 4, miles: 2 },
		{ name: "North Gwinnett High", level: "high", share: 6 },
	],
});

const duluth = city({
	name: "Duluth",
	compare: {
		against: "Georgia",
		rows: [
			{
				label: "Median home value",
				city: { value: 400800, display: "$400,800" },
				state: { value: 300000, display: "$300,000" },
				takeaway: "1.3× the state",
			},
		],
		source: { name: "ACS" },
	},
	growth: {
		series: [
			{ label: "1980", value: 2956 },
			{ label: "1990", value: 9029 },
			{ label: "2020", value: 31873 },
		],
		takeaway: "",
		source: { name: "Census" },
	},
	gettingAround: [
		{
			label: "Downtown Atlanta · 30 mi",
			value: "~48 min",
			minutes: { min: 38, max: 72 },
		},
	],
	everyday: [
		{ kind: "Groceries", places: [{ name: "Publix", miles: 0.9 }] },
		{ kind: "Hospital", places: [{ name: "Northside Duluth", miles: 1.1 }] },
		{ kind: "Library", places: [{ name: "Duluth Branch", miles: 0.2 }] },
	],
	crime: {
		violent: "Below",
		against: "Georgia",
		year: 2025,
		agency: "Duluth Police Department",
		source: { name: "FBI" },
	},
	holding: {
		display: "≈ $610",
		basis: "",
		rows: [
			{ label: "Property tax", usd: 354 },
			{ label: "Electricity", usd: 159 },
		],
	},
});

describe("citySlugsOf", () => {
	it("reads the slugs when every save has a city page", () => {
		expect(citySlugsOf(["/city/suwanee-ga", "/city/duluth-ga"])).toEqual([
			"suwanee-ga",
			"duluth-ga",
		]);
	});

	it("is null when any save has no city page — those keep the county table", () => {
		expect(citySlugsOf(["/city/suwanee-ga", undefined])).toBeNull();
		expect(citySlugsOf(["/city/suwanee-ga", "/community/x"])).toBeNull();
	});

	it("keeps two cities in ONE county apart — the county table could not", () => {
		// Suwanee and Duluth are both Gwinnett.
		expect(citySlugsOf(["/city/suwanee-ga", "/city/duluth-ga"])).toHaveLength(
			2,
		);
	});
});

describe("buildCityCompareVisuals", () => {
	const v = buildCityCompareVisuals([suwanee, duluth]);

	it("states safety in words, and a city without a FEMA rating gets a dash", () => {
		const rows = v.texts?.safety ?? [];
		expect(rows.map((r) => r.label)).toEqual([
			"Natural hazards, overall",
			"Flood",
			"Violent crime",
		]);
		expect(rows[0]?.cells).toEqual(["Low", undefined]);
		expect(rows[1]?.cells).toEqual(["Moderate", undefined]);
		expect(rows[2]?.cells).toEqual([
			"Well below Georgia's rate",
			"Below Georgia's rate",
		]);
	});

	it("rings the best-standing school at each level, in full", () => {
		const elementary = v.schools.find((l) => l.level === "Elementary");
		expect(elementary?.cells[0]).toEqual({
			name: "Burnette Elementary School",
			share: 4,
			distance: "2 mi",
		});
		expect(elementary?.cells[1]).toBeUndefined();
		// No middle school on either list: no row.
		expect(v.schools.map((l) => l.level)).toEqual(["Elementary", "High"]);
	});

	it("lists every everyday kind either city has, with a dash where one lacks it", () => {
		expect(v.convenience.map((r) => r.label)).toEqual([
			"Groceries",
			"Hospital",
			"Library",
		]);
		expect(v.convenience[2]?.cells[0]).toBeUndefined();
		expect(v.texts?.convenience?.[0]).toEqual({
			label: "Drive to Downtown Atlanta",
			cells: ["49–74 min", "38–72 min"],
		});
	});

	it("draws residents over the census years both cities have", () => {
		expect(v.potential?.years).toEqual([1990, 2020]);
		expect(v.potential?.series).toEqual([
			[2412, 20786],
			[9029, 31873],
		]);
		expect(v.potential?.cells[0]).toEqual({
			display: "20,786",
			change: "+762% since 1990",
			area: "residents in 2020",
		});
	});

	it("stacks the month to hold a home, and prints home value and rent", () => {
		expect(v.cost?.holding.map((h) => h?.usd)).toEqual([640, 513]);
		expect(v.texts?.cost).toEqual([
			{ label: "Median home value", cells: ["$480,600", "$400,800"] },
			{ label: "Median rent, a month", cells: ["$1,885", undefined] },
		]);
	});
});

describe("buildCityInShort", () => {
	const v = buildCityCompareVisuals([suwanee, duluth]);
	const lines = buildCityInShort(v, [suwanee, duluth]);
	const text = lines.map((l) => `${l.place}:${l.text}`);

	it("names the nearer hospital, the lower home values, the shorter drive and the cheaper month", () => {
		expect(text).toContain(
			"1:The shortest drive to a hospital — Northside Duluth, 1.1 mi.",
		);
		expect(text).toContain("1:The lowest home values — a median of $400,800.");
		expect(text).toContain("1:The shortest drive downtown — 38–72 min.");
		expect(text).toContain(
			"1:The least to hold a home — ≈ $610 a month before the mortgage.",
		);
	});

	it("says nothing where the gap is small, and never ranks crime or population", () => {
		// Kroger 0.7 vs Publix 0.9: under the half-mile gap.
		expect(text.some((t) => t.includes("groceries"))).toBe(false);
		expect(text.some((t) => /crime|resident|people/i.test(t))).toBe(false);
	});
});
