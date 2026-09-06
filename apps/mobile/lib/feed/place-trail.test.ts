/**
 * The header's per-card place trail (phase182) — what replaced the community
 * strip's card ↔ place connection.
 */
import { describe, expect, it } from "vitest";
import type {
	AreaCardV3,
	CommunityCardV3,
	ListingCardV3,
	TradeoffCardV3,
} from "./card-types";
import type { GeoUnit } from "./geo-unit";
import { placeTrail } from "./place-trail";

const unit = (id: string, name: string): GeoUnit => ({
	id,
	level: "city",
	name,
	state: "GA",
	centroid: { lat: 34, lng: -84 },
	communityCount: 3,
	sampleCommunityNames: [],
	stats: {},
});

const community = (
	id: string,
	name: string,
	city: string,
): CommunityCardV3 => ({
	kind: "community",
	id,
	slug: id,
	name,
	city,
	state: "GA",
	heroUrl: `https://example.test/${id}.jpg`,
});

const listing = (over: Partial<ListingCardV3> = {}): ListingCardV3 => ({
	kind: "listing",
	id: "l1",
	slug: "l1",
	address: "9155 Nesbit Ferry Road",
	priceLabel: "$339,000",
	bedBathSqft: "3 bd · 3 ba · 1,386 sqft",
	heroUrl: "https://example.test/l1.jpg",
	...over,
});

const UNITS = [unit("city:johns-creek-ga", "Johns Creek")];
const COMMUNITIES = [community("c1", "Bellmoore Park", "Johns Creek")];

describe("placeTrail", () => {
	it("gives a home its city and community", () => {
		const card = listing({
			geoUnitId: "city:johns-creek-ga",
			communityId: "c1",
		});
		expect(placeTrail(card, UNITS, COMMUNITIES)).toEqual([
			"Johns Creek",
			"Bellmoore Park",
		]);
	});

	it("shows a real-or-absent chain when the community link is unpopulated", () => {
		// `listings.community_id` is almost entirely NULL today — the common case.
		const card = listing({ geoUnitId: "city:johns-creek-ga" });
		expect(placeTrail(card, UNITS, COMMUNITIES)).toEqual(["Johns Creek"]);
	});

	it("skips a segment the pool cannot resolve rather than inventing it", () => {
		const card = listing({ geoUnitId: "city:elsewhere", communityId: "c404" });
		expect(placeTrail(card, UNITS, COMMUNITIES)).toEqual([]);
	});

	it("gives a community card its city — the card itself is the community", () => {
		const card = community("c1", "Bellmoore Park", "Johns Creek");
		expect(placeTrail(card, UNITS, COMMUNITIES)).toEqual(["Johns Creek"]);
	});

	it("gives a city card the metro alone", () => {
		const card: AreaCardV3 = {
			kind: "area",
			id: "city:johns-creek-ga",
			unit: unit("city:johns-creek-ga", "Johns Creek"),
		};
		expect(placeTrail(card, UNITS, COMMUNITIES)).toEqual([]);
	});

	it("returns null for a trade-off and for no card — the scope line takes over", () => {
		const tradeoff: TradeoffCardV3 = {
			kind: "tradeoff",
			id: "t1",
			theme: "era",
			axis: "era",
			prompt: "What matters more?",
			left: { label: "Old", support: "Character" },
			right: { label: "New", support: "Warranty" },
		};
		expect(placeTrail(tradeoff, UNITS, COMMUNITIES)).toBeNull();
		expect(placeTrail(undefined, UNITS, COMMUNITIES)).toBeNull();
	});
});
