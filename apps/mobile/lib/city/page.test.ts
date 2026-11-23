import { describe, expect, it } from "vitest";
import {
	costRows,
	driveRows,
	driveTimes,
	fullSchoolName,
	glancePart,
	glanceTiles,
	otherRankings,
	percentOf,
	schoolColumns,
	schoolRows,
	schoolsByLevel,
	stopLabel,
} from "./page";

const base = {
	stats: [
		{ label: "Population", value: "20,786", note: "2020 census" },
		{ label: "Homes owner-occupied", value: "59%", note: "the rest rented" },
		{ label: "Parks", value: "12" },
	],
	compare: {
		against: "Georgia",
		rows: [
			{
				label: "Median household income",
				city: { value: 103260, display: "$103,260" },
				state: { value: 77353, display: "$77,353" },
				takeaway: "1.3× the state",
			},
		],
		source: { name: "Census" },
	},
	growth: {
		series: [
			{ label: "1990", value: 2412 },
			{ label: "2020", value: 20786 },
		],
		takeaway: "8.6× since 1990",
		source: { name: "Census" },
	},
	education: { schools: [], measure: "", rows: [], note: "" },
	gettingAround: [
		{
			label: "Downtown Atlanta",
			value: "~40 min",
			minutes: { min: 40, max: 75 },
		},
		{ label: "Airport", value: "45–60 min", minutes: { min: 45, max: 60 } },
		{ label: "Nearest rail", value: "no rail in Suwanee" },
	],
	history: [],
};

describe("glanceTiles", () => {
	it("leads with growth and drops the population tile it already shows", () => {
		const tiles = glanceTiles(base);
		expect(tiles.map((t) => t.kind)).toEqual([
			"growth",
			"compare",
			"share",
			"stat",
		]);
		expect(tiles[0]).toMatchObject({
			value: "20,786",
			takeaway: "8.6× since 1990",
		});
		expect(tiles.some((t) => t.label === "Population")).toBe(false);
	});

	it("keeps the population tile when there is no growth series to show it", () => {
		const tiles = glanceTiles({
			...base,
			growth: { ...base.growth, series: [] },
		});
		expect(tiles[0]?.kind).toBe("compare");
		expect(tiles.some((t) => t.label === "Population")).toBe(true);
	});
});

describe("percentOf", () => {
	it("reads a plain percentage and nothing else", () => {
		expect(percentOf("59%")).toBe(59);
		expect(percentOf("62.5 %")).toBe(62.5);
		expect(percentOf("88–92%")).toBeNull();
		expect(percentOf("$103,260")).toBeNull();
	});
});

describe("schoolColumns", () => {
	const s = (
		level: "elementary" | "middle" | "high" | "college",
		name: string,
		rank?: string,
	) => ({
		level,
		name,
		...(rank ? { rank } : {}),
		detail: "",
		source: { name: "U.S. News" },
	});

	it("puts the best rank first in each level and keeps colleges apart", () => {
		const { columns, colleges } = schoolColumns([
			s("high", "North Gwinnett", "#16"),
			s("elementary", "Level Creek", "#9"),
			s("high", "Lambert", "#9"),
			s("elementary", "Johns Creek", "#5"),
			s("college", "PCOM Georgia"),
		]);
		expect(columns.map((c) => c.level)).toEqual(["elementary", "high"]);
		expect(columns[0]?.schools.map((x) => x.name)).toEqual([
			"Johns Creek",
			"Level Creek",
		]);
		expect(columns[1]?.schools.map((x) => x.name)).toEqual([
			"Lambert",
			"North Gwinnett",
		]);
		expect(colleges.map((x) => x.name)).toEqual(["PCOM Georgia"]);
	});
});

describe("driveTimes", () => {
	it("charts the timed rows on a half-hour axis and keeps the rest as notes", () => {
		const d = driveTimes(base.gettingAround);
		expect(d.bars.map((b) => b.label)).toEqual(["Downtown Atlanta", "Airport"]);
		expect(d.axisMax).toBe(90);
		expect(d.notes).toEqual([
			{ label: "Nearest rail", value: "no rail in Suwanee" },
		]);
	});

	it("never draws an axis shorter than an hour", () => {
		expect(
			driveTimes([{ label: "x", value: "", minutes: { min: 5, max: 12 } }])
				.axisMax,
		).toBe(60);
	});
});

describe("stopLabel", () => {
	it("uses the short label, else the first words of the sentence", () => {
		expect(
			stopLabel({ year: "1871", short: "Railroad depot", text: "x" }),
		).toBe("Railroad depot");
		expect(
			stopLabel({
				year: "1949",
				text: "Incorporated as a city; still farmland.",
			}),
		).toBe("Incorporated as a");
	});
});

describe("the five tiles", () => {
	const src = { name: "U.S. News" };
	const school = (
		level: "elementary" | "middle" | "high" | "college",
		name: string,
		rank?: string,
	) => ({
		level,
		name,
		...(rank ? { rank, scope: "in Georgia" } : {}),
		detail: "",
		source: src,
	});
	const city = {
		...base,
		rankings: [
			{
				rank: "#1",
				scope: "in metro Atlanta",
				title: "Fastest-growing city",
				detail: "",
				source: src,
			},
			{
				rank: "#6",
				scope: "in Georgia",
				title: "Daves Creek Elementary School",
				detail: "",
				source: src,
			},
			{
				rank: "#5",
				scope: "in Georgia",
				title: "Alliance Academy for Innovation",
				detail: "",
				source: src,
			},
		],
		stats: [
			...base.stats,
			{ label: "Median rent", value: "$2,090", note: "a month · county" },
		],
		compare: {
			...base.compare,
			rows: [
				...base.compare.rows,
				{
					label: "Median home value · county",
					city: { value: 550400, display: "$550,400" },
					state: { value: 303300, display: "$303,300" },
					takeaway: "1.8× the state",
				},
			],
		},
		education: {
			schools: [
				school("high", "Forsyth Central High", "#123"),
				school("high", "Alliance Academy for Innovation", "#5"),
				school("elementary", "Daves Creek Elementary", "#6"),
				school("college", "University of North Georgia — Cumming"),
			],
			measure: "",
			rows: [],
			note: "",
		},
		gettingAround: [
			{
				label: "Downtown Atlanta · 39 mi",
				value: "",
				minutes: { min: 52, max: 83 },
			},
			{ label: "Georgia 400", value: "the county's highway" },
			{ label: "City Hall · 1 mi", value: "", minutes: { min: 4, max: 4 } },
		],
		planning: [],
	};

	it("keeps a school's ranking out of the badges — the Schools tile says it", () => {
		expect(otherRankings(city).map((r) => r.title)).toEqual([
			"Fastest-growing city",
		]);
	});

	it("names every ranked school in full, by level then rank, a college last", () => {
		expect(schoolRows(city)).toEqual([
			{ name: "Daves Creek Elementary School", rank: "#6 in Georgia" },
			{ name: "Alliance Academy for Innovation", rank: "#5 in Georgia" },
			{ name: "Forsyth Central High School", rank: "#123 in Georgia" },
			{ name: "University of North Georgia — Cumming" },
		]);
		expect(
			schoolsByLevel([
				{ name: "A High", level: "high", share: 4 },
				{ name: "B Elementary", level: "elementary", share: 9, miles: 1.2 },
			]).map((g) => [g.heading, g.schools.map((s) => s.name)]),
		).toEqual([
			["Elementary", ["B Elementary"]],
			["High", ["A High"]],
		]);
		expect(schoolsByLevel(undefined)).toEqual([]);
		expect(fullSchoolName("South Forsyth Middle")).toBe(
			"South Forsyth Middle School",
		);
	});

	it("lists the drives that have a time, off-peak to rush", () => {
		expect(driveRows(city)).toEqual([
			{ place: "Downtown Atlanta · 39 mi", time: "52–83 min" },
			{ place: "City Hall · 1 mi", time: "4 min" },
		]);
	});

	it("puts home value and rent under Cost, and each figure in one place", () => {
		expect(costRows(city)).toEqual([
			{
				label: "Median home value · county",
				value: "$550,400",
				note: "1.8× the state",
			},
			{ label: "Median rent", value: "$2,090", note: "a month" },
		]);
		const where = glanceTiles(city).map((t) => [t.label, glancePart(t)]);
		expect(where).toEqual([
			["Residents", "potential"],
			["Median household income", "glance"],
			["Median home value · county", "cost"],
			["Homes owner-occupied", "glance"],
			["Parks", "glance"],
			["Median rent", "cost"],
		]);
	});
});
