/**
 * Stand-in homes for a development bundle (phase404.4) — and the proof that
 * no other bundle has any.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEST_HOMES } from "../listings-in-app";
import type { CommunityCardV3, ListingCardV3 } from "./card-types";
import { cardsWithin, placeDeck } from "./follow";
import type { FeedPool } from "./generate-feed";
import {
	placePool,
	poolAround,
	standInHomes,
	withTestHomes,
} from "./test-homes";

const edinburgh: CommunityCardV3 = {
	kind: "community",
	id: "c-1",
	slug: "edinburgh",
	name: "Edinburgh",
	city: "Suwanee",
	state: "GA",
	county: "Gwinnett",
	heroUrl: "https://example.test/e.jpg",
	geoUnitId: "city:suwanee-ga",
};

const sandbox: ListingCardV3 = {
	kind: "listing",
	id: "l-1",
	slug: "l-1",
	address: "No street address",
	priceLabel: "$299,900",
	bedBathSqft: "4 bd · 3 ba · 2,910 sqft",
	heroUrl: "https://example.test/l.jpg",
	locality: "Dekalb County, GA",
	zip: "30084",
	geoUnitId: "city:dekalb-county-ga",
};

const pool: FeedPool = { geoUnits: [], listings: [], communities: [edinburgh] };
const NOTHING = {
	seenIds: new Set<string>(),
	passedIds: new Set<string>(),
	recentIds: new Set<string>(),
};

describe("the switch", () => {
	it("is off wherever this is not a development bundle", () => {
		expect(TEST_HOMES).toBe(false);
	});

	it("cannot be on in a release bundle: it is gated on __DEV__", () => {
		const source = readFileSync("lib/listings-in-app.ts", "utf8");
		const flag = source.slice(source.indexOf("export const TEST_HOMES"));
		expect(flag).toMatch(
			/__DEV__ &&\s+process\.env\.EXPO_PUBLIC_TEST_HOMES === "1"/,
		);
	});
});

describe("standInHomes", () => {
	it("re-addresses a test home to the neighbourhood, keeping its own id", () => {
		const [home] = standInHomes([sandbox], edinburgh);
		expect(home).toMatchObject({
			id: "l-1",
			priceLabel: "$299,900",
			communityId: "edinburgh",
			communityName: "Edinburgh",
			communityCounty: "Gwinnett",
			geoUnitId: "city:suwanee-ga",
		});
		// Where the sandbox row really is would contradict the card above it.
		expect(home).not.toHaveProperty("locality");
		expect(home).not.toHaveProperty("zip");
	});
});

describe("withTestHomes / poolAround / placePool", () => {
	it("hands the pool back untouched when there are no test homes", () => {
		expect(withTestHomes(pool, edinburgh, [])).toBe(pool);
		expect(poolAround(pool, edinburgh, [])).toBe(pool);
		expect(
			placePool(
				pool,
				{ kind: "community", id: "edinburgh", name: "Edinburgh" },
				[],
			),
		).toBe(pool);
	});

	it("gives a liked neighbourhood homes to follow with", () => {
		const around = poolAround(pool, edinburgh, [sandbox]);
		expect(cardsWithin(edinburgh, around, NOTHING).map((c) => c.id)).toEqual([
			"l-1",
		]);
	});

	it("gives no homes to a card that is not a neighbourhood", () => {
		expect(poolAround(pool, sandbox, [sandbox])).toBe(pool);
		expect(poolAround(pool, undefined, [sandbox])).toBe(pool);
	});

	it("fills a neighbourhood's own page, and leaves a city's alone", () => {
		const page = placePool(
			pool,
			{ kind: "community", id: "edinburgh", name: "Edinburgh" },
			[sandbox],
		);
		expect(placeDeck(page, "community", NOTHING).map((c) => c.id)).toEqual([
			"l-1",
		]);
		const city = {
			kind: "city" as const,
			id: "city:suwanee-ga",
			name: "Suwanee",
		};
		expect(placePool(pool, city, [sandbox])).toBe(pool);
	});

	it("names the neighbourhood from the page when the pool does not carry it", () => {
		const bare: FeedPool = { ...pool, communities: [] };
		const page = placePool(
			bare,
			{ kind: "community", id: "edinburgh", name: "Edinburgh" },
			[sandbox],
		);
		expect(page.listings[0]).toMatchObject({
			communityId: "edinburgh",
			communityName: "Edinburgh",
		});
	});
});
