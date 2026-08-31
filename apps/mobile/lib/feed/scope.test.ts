/**
 * `preferScope` / `scopeChoices` — the explicit community scope, applied to a
 * pool. The rule under test is §1.3: a scope REORDERS, it never removes.
 */
import { describe, expect, it } from "vitest";
import type { CommunityCardV3, ListingCardV3 } from "./card-types";
import type { FeedPool } from "./generate-feed";
import { preferScope, scopeChoices } from "./scope";

function listing(id: string, geoUnitId?: string): ListingCardV3 {
	return {
		kind: "listing",
		id,
		slug: id,
		address: `${id} St`,
		priceLabel: "$400,000",
		bedBathSqft: "3 bd · 2 ba · 1,500 sqft",
		heroUrl: `https://example.test/${id}.jpg`,
		...(geoUnitId ? { geoUnitId } : {}),
	};
}

function community(id: string, geoUnitId?: string): CommunityCardV3 {
	return {
		kind: "community",
		id,
		slug: id,
		name: id,
		city: "Duluth",
		state: "GA",
		heroUrl: `https://example.test/${id}.jpg`,
		...(geoUnitId ? { geoUnitId } : {}),
	};
}

const pool: FeedPool = {
	geoUnits: [],
	listings: [
		listing("a", "city:atlanta-ga"),
		listing("b", "city:duluth-ga"),
		listing("c"),
		listing("d", "city:duluth-ga"),
	],
	communities: [
		community("x", "city:atlanta-ga"),
		community("y", "city:duluth-ga"),
	],
};

describe("preferScope", () => {
	it("returns the pool by identity when no scope is picked", () => {
		expect(preferScope(pool, null)).toBe(pool);
	});

	it("moves the scoped unit's content first and keeps everything else", () => {
		const out = preferScope(pool, "city:duluth-ga");
		expect(out.listings.map((l) => l.id)).toEqual(["b", "d", "a", "c"]);
		expect(out.communities.map((c) => c.id)).toEqual(["y", "x"]);
		// Nothing is dropped — a scope is a ranking, not a filter.
		expect(out.listings).toHaveLength(pool.listings.length);
		expect(out.communities).toHaveLength(pool.communities.length);
	});

	it("preserves server order within each side of the partition", () => {
		const out = preferScope(pool, "city:duluth-ga");
		// b before d in scope, a before c out of scope — both as they arrived.
		expect(out.listings.map((l) => l.id)).toEqual(["b", "d", "a", "c"]);
	});

	it("returns the pool by identity when the scope matches nothing", () => {
		expect(preferScope(pool, "city:nowhere-ga")).toBe(pool);
	});
});

describe("scopeChoices", () => {
	const units = [
		{ level: "city", communityCount: 27, name: "Johns Creek" },
		{ level: "city", communityCount: 731, name: "Atlanta" },
		{ level: "zip", communityCount: 999, name: "30096" },
		{ level: "city", communityCount: 356, name: "Alpharetta" },
	];

	it("keeps city units only, densest first", () => {
		expect(scopeChoices(units, 10).map((u) => u.name)).toEqual([
			"Atlanta",
			"Alpharetta",
			"Johns Creek",
		]);
	});

	it("caps the list", () => {
		expect(scopeChoices(units, 2)).toHaveLength(2);
	});

	it("does not mutate its input", () => {
		const before = units.map((u) => u.name);
		scopeChoices(units, 10);
		expect(units.map((u) => u.name)).toEqual(before);
	});
});
