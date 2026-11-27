import { describe, expect, it } from "vitest";
import type { AreaCardV3 } from "../feed/card-types";
import type { CommunityCardV3, FeedCardV3 } from "../feed/card-types";
import {
	appPathForSharedPath,
	parseSharedParam,
	putOnTop,
	shareContent,
	shareTargetForCard,
	shareUrl,
	sharedCardInPool,
} from "./share-link";

describe("shareUrl", () => {
	it("sends a community to its film page, on www", () => {
		expect(
			shareUrl({ kind: "community", slug: "northbrooke", name: "Northbrooke" }),
		).toBe("https://www.percho.co/watch/c/northbrooke");
	});

	it("sends a home to its film page, by id", () => {
		expect(shareUrl({ kind: "home", id: "l-1", name: "$685,000" })).toBe(
			"https://www.percho.co/watch/home/l-1",
		);
	});

	it("sends a city to its film page", () => {
		expect(
			shareUrl({ kind: "city", slug: "suwanee-ga", name: "Suwanee" }),
		).toBe("https://www.percho.co/watch/city/suwanee-ga");
	});

	it("escapes a slug that is not URL-safe", () => {
		expect(shareUrl({ kind: "community", slug: "a b", name: "A" })).toBe(
			"https://www.percho.co/watch/c/a%20b",
		);
	});
});

describe("shareContent", () => {
	it("hands the share sheet the link alone, so Messages shows it once", () => {
		expect(
			shareContent({ kind: "city", slug: "suwanee-ga", name: "Suwanee" }),
		).toEqual({ url: "https://www.percho.co/watch/city/suwanee-ga" });
	});
});

describe("appPathForSharedPath", () => {
	it("opens a shared film in the deck, that card on top", () => {
		expect(appPathForSharedPath("/watch/c/northbrooke")).toBe(
			"/feed?shared=community:northbrooke",
		);
		expect(appPathForSharedPath("/watch/city/suwanee-ga")).toBe(
			"/feed?shared=city:suwanee-ga",
		);
	});

	it("opens the web pages in the deck too", () => {
		expect(appPathForSharedPath("/c/northbrooke")).toBe(
			"/feed?shared=community:northbrooke",
		);
		expect(appPathForSharedPath("/c/northbrooke/feed/")).toBe(
			"/feed?shared=community:northbrooke",
		);
		expect(appPathForSharedPath("/city/suwanee-ga")).toBe(
			"/feed?shared=city:suwanee-ga",
		);
	});

	it("takes the whole URL iOS hands over, and drops query and hash", () => {
		expect(
			appPathForSharedPath("https://www.percho.co/watch/c/northbrooke?x=1#t"),
		).toBe("/feed?shared=community:northbrooke");
		expect(appPathForSharedPath("percho://feed")).toBeNull();
	});

	it("opens a shared home on its own page", () => {
		expect(appPathForSharedPath("/watch/home/l-1")).toBe("/listing/l-1");
		expect(
			appPathForSharedPath("https://www.percho.co/watch/home/l-1?x=1"),
		).toBe("/listing/l-1");
	});

	it("leaves every other path to the router", () => {
		expect(appPathForSharedPath("/")).toBeNull();
		expect(appPathForSharedPath("/feed")).toBeNull();
		expect(appPathForSharedPath("/community/northbrooke")).toBeNull();
		expect(appPathForSharedPath("/c/")).toBeNull();
		expect(appPathForSharedPath("/c/a/b")).toBeNull();
		expect(appPathForSharedPath("/watch/x/suwanee-ga")).toBeNull();
	});
});

describe("parseSharedParam", () => {
	it("reads what appPathForSharedPath writes", () => {
		expect(parseSharedParam("community:northbrooke")).toEqual({
			kind: "community",
			slug: "northbrooke",
		});
		expect(parseSharedParam("city:suwanee-ga")).toEqual({
			kind: "city",
			slug: "suwanee-ga",
		});
	});

	it("ignores anything else", () => {
		expect(parseSharedParam(undefined)).toBeNull();
		expect(parseSharedParam(["community:x"])).toBeNull();
		expect(parseSharedParam("listing:x")).toBeNull();
		expect(parseSharedParam("community:")).toBeNull();
	});
});

describe("shareTargetForCard", () => {
	const city = (citySlug?: string): AreaCardV3 => ({
		kind: "area",
		id: "area-city:suwanee-ga",
		unit: {
			id: "city:suwanee-ga",
			level: "city",
			name: "Suwanee",
			state: "GA",
			centroid: { lat: 34.05, lng: -84.07 },
			communityCount: 1,
			sampleCommunityNames: [],
			stats: {},
			...(citySlug ? { citySlug } : {}),
		},
	});

	it("shares a city by its page slug, not its unit id", () => {
		expect(shareTargetForCard(city("suwanee-ga"))).toEqual({
			kind: "city",
			slug: "suwanee-ga",
			name: "Suwanee",
		});
	});

	it("shares nothing for a city with no page", () => {
		expect(shareTargetForCard(city())).toBeNull();
	});

	it("shares a home by its listing id, named by its price", () => {
		expect(
			shareTargetForCard({
				kind: "listing",
				id: "l-1",
				slug: "355-morgans-creek-ct",
				address: "355 Morgans Creek Ct",
				priceLabel: "$685,000",
				bedBathSqft: "4 bd · 3 ba",
				heroUrl: "https://example.test/l.jpg",
			}),
		).toEqual({ kind: "home", id: "l-1", name: "$685,000" });
	});
});

describe("sharedCardInPool", () => {
	const community = {
		kind: "community",
		id: "c-1",
		slug: "northbrooke",
		name: "Northbrooke",
	} as CommunityCardV3;
	const unit = {
		id: "city:suwanee-ga",
		level: "city" as const,
		name: "Suwanee",
		state: "GA",
		centroid: { lat: 0, lng: 0 },
		citySlug: "suwanee-ga",
		communityCount: 1,
		sampleCommunityNames: [],
		stats: {},
	};
	const pool = { communities: [community], geoUnits: [unit] };

	it("finds a community by slug", () => {
		expect(
			sharedCardInPool(pool, { kind: "community", slug: "northbrooke" }),
		).toBe(community);
	});

	it("builds a city's card with the deck's own id", () => {
		expect(
			sharedCardInPool(pool, { kind: "city", slug: "suwanee-ga" }),
		).toEqual({ kind: "area", id: "area-city:suwanee-ga", unit });
	});

	it("is null until the pool has it", () => {
		expect(sharedCardInPool(pool, { kind: "community", slug: "x" })).toBeNull();
		expect(sharedCardInPool(pool, { kind: "city", slug: "x" })).toBeNull();
	});
});

describe("putOnTop", () => {
	const c = (id: string) => ({ kind: "community", id }) as FeedCardV3;

	it("puts the card in front and drops its later copy", () => {
		const deck = [c("a"), c("b"), c("s"), c("d")];
		expect(putOnTop(deck, 1, c("s")).map((x) => x.id)).toEqual([
			"a",
			"s",
			"b",
			"d",
		]);
	});

	it("leaves swiped cards alone", () => {
		expect(putOnTop([c("a"), c("b")], 2, c("s")).map((x) => x.id)).toEqual([
			"a",
			"b",
			"s",
		]);
	});
});
