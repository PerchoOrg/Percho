import { describe, expect, it } from "vitest";
import {
	type ShelfEntry,
	buildShelves,
	shelfCountLine,
	shelfListingIds,
} from "./shelves";

const home = (id: string, place?: string): ShelfEntry => ({
	id,
	kind: "listing",
	...(place ? { place } : {}),
	title: "$624,000 · 4 bd",
	sub: "312 Founders Way",
	href: `/listing/${id}`,
});
const hood = (id: string, place: string): ShelfEntry => ({
	id,
	kind: "community",
	place,
	title: "Ashley Crossing",
	sub: "4.6 · 12 reviews",
	href: `/community/${id}`,
});
const area = (id: string, place: string, areaKey?: string): ShelfEntry => ({
	id,
	kind: "area",
	place,
	costLine: "Cherokee County · $691/mo on a $500k home",
	...(areaKey ? { areaKey } : {}),
});

describe("buildShelves", () => {
	it("groups by place, in order of each place's earliest save", () => {
		const { shelves } = buildShelves([
			home("h1", "Woodstock"),
			home("h2", "Marietta"),
			home("h3", "Woodstock"),
		]);
		expect(shelves.map((s) => s.place)).toEqual(["Woodstock", "Marietta"]);
		// h3 joins the shelf h1 opened rather than starting a third.
		expect(shelves[0]?.cards.map((c) => c.id)).toEqual(["h1", "h3"]);
	});

	it("turns a saved area into the shelf header rather than a card", () => {
		const { shelves } = buildShelves([
			area("area-woodstock", "Woodstock", "cherokee"),
			home("h1", "Woodstock"),
		]);
		expect(shelves).toHaveLength(1);
		expect(shelves[0]?.area).toEqual({
			id: "area-woodstock",
			costLine: "Cherokee County · $691/mo on a $500k home",
			areaKey: "cherokee",
		});
		// The area contributes NO card — it is the header.
		expect(shelves[0]?.cards.map((c) => c.id)).toEqual(["h1"]);
	});

	it("opens a shelf for a place saved only as an area", () => {
		const { shelves } = buildShelves([area("area-dallas", "Dallas")]);
		expect(shelves[0]?.place).toBe("Dallas");
		expect(shelves[0]?.cards).toEqual([]);
		// No lens figures outside the covered metro — no key, and that is fine.
		expect(shelves[0]?.area?.areaKey).toBeUndefined();
	});

	it("holds back a save whose place has not resolved yet", () => {
		const { shelves, unplaced } = buildShelves([
			home("h1", "Woodstock"),
			home("h2"),
		]);
		expect(shelves).toHaveLength(1);
		expect(unplaced.map((e) => e.id)).toEqual(["h2"]);
	});

	it("treats a placed entry with no card face as unplaced, not as a blank card", () => {
		// A 404'd listing: the store still holds the id, the row has no title.
		const { shelves, unplaced } = buildShelves([
			{ id: "gone", kind: "listing", place: "Woodstock" },
		]);
		expect(shelves[0]?.cards).toEqual([]);
		expect(unplaced.map((e) => e.id)).toEqual(["gone"]);
	});
});

describe("shelfCountLine", () => {
	it("pluralises each kind and omits the one that is absent", () => {
		const { shelves } = buildShelves([
			home("h1", "Woodstock"),
			home("h2", "Woodstock"),
			hood("c1", "Woodstock"),
		]);
		expect(shelfCountLine(shelves[0] as never)).toBe(
			"2 homes · 1 neighbourhood",
		);
		const only = buildShelves([hood("c1", "Marietta")]).shelves[0];
		expect(shelfCountLine(only as never)).toBe("1 neighbourhood");
	});

	it("is empty for a shelf that is only its header", () => {
		const { shelves } = buildShelves([area("area-dallas", "Dallas")]);
		expect(shelfCountLine(shelves[0] as never)).toBe("");
	});
});

describe("shelfListingIds", () => {
	it("returns the homes only, in shelf order", () => {
		const { shelves } = buildShelves([
			home("h1", "Woodstock"),
			hood("c1", "Woodstock"),
			home("h2", "Woodstock"),
		]);
		expect(shelfListingIds(shelves[0] as never)).toEqual(["h1", "h2"]);
	});
});
