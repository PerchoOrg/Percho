import { describe, expect, it } from "vitest";
import { type LikedPlace, dollars, likedFacts } from "./liked-facts";

const community = (
	id: string,
	city: string,
	value: string,
	grade: string,
	drive: string,
): LikedPlace => ({
	id,
	kind: "community",
	city,
	glance: {
		place: { lead: `${city}, GA` },
		cells: [
			{ value, label: "est. home value", topic: "potential" },
			{ value: grade, label: "school grade", topic: "schools" },
			{ value: drive, label: "to I-85", topic: "convenience" },
		],
	},
});
const city = (name: string, value: string, grade: string): LikedPlace => ({
	id: `area-city:${name.toLowerCase()}-ga`,
	kind: "area",
	city: name,
	glance: {
		place: { lead: `${name}, GA` },
		cells: [
			{ value, label: "median home value", topic: "cost" },
			{ value: grade, label: "school grade", topic: "schools" },
			{ value: "62 min", label: "drive to downtown", topic: "convenience" },
		],
	},
});

const PLACES = [
	community("c1", "Suwanee", "$1.2M", "A+", "16 min"),
	community("c2", "Suwanee", "$640K", "A", "6 min"),
	community("c3", "Duluth", "$430K", "B", "8 min"),
	city("Suwanee", "$481K", "A"),
	city("Johns Creek", "$629K", "A+"),
];

describe("dollars", () => {
	it("reads the cards' own spellings", () => {
		expect(dollars("$1.4M")).toBe(1_400_000);
		expect(dollars("$640K")).toBe(640_000);
		expect(dollars("A+")).toBeNull();
		expect(dollars("16 min")).toBeNull();
	});
});

describe("likedFacts", () => {
	it("says nothing for a buyer who has liked nothing", () => {
		expect(likedFacts([], PLACES)).toEqual({ count: 0, rows: [] });
	});

	it("reads only the places that are liked", () => {
		const facts = likedFacts(["c2"], PLACES);
		expect(facts.count).toBe(1);
		expect(facts.rows).toEqual([
			{ label: "Where", value: "Suwanee" },
			{ label: "Home value", value: "$640K" },
			{ label: "Schools", value: "A" },
			{ label: "To the highway", value: "6 min" },
		]);
	});

	it("gives a range as the lowest and highest values, as the cards print them", () => {
		const facts = likedFacts(["c1", "c2", "c3"], PLACES);
		expect(facts.rows).toEqual([
			{ label: "Where", value: "Suwanee · Duluth" },
			{ label: "Home value", value: "$430K – $1.2M" },
			{ label: "Schools", value: "B to A+" },
			{ label: "To the highway", value: "6 – 16 min" },
		]);
	});

	it("leads Where with the city liked most, and counts the ones it leaves out", () => {
		const facts = likedFacts(
			["c3", "c1", "c2", "area-city:johns creek-ga"],
			PLACES,
		);
		expect(facts.rows[0]).toEqual({
			label: "Where",
			value: "Suwanee · Duluth +1",
		});
	});

	it("keeps a city's drive to downtown out of the highway row", () => {
		const facts = likedFacts(["area-city:suwanee-ga"], PLACES);
		expect(facts.rows.map((r) => r.label)).toEqual([
			"Where",
			"Home value",
			"Schools",
		]);
	});

	it("skips a saved id it has no place for, and does not count it", () => {
		expect(likedFacts(["c1", "gone"], PLACES).count).toBe(1);
	});

	it("drops a row whose figure the liked places do not print", () => {
		const bare: LikedPlace = { id: "x", kind: "community", city: "Buford" };
		expect(likedFacts(["x"], [bare]).rows).toEqual([
			{ label: "Where", value: "Buford" },
		]);
	});
});
