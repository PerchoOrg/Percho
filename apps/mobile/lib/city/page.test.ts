import { describe, expect, it } from "vitest";
import {
	driveTimes,
	glanceTiles,
	percentOf,
	schoolColumns,
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
