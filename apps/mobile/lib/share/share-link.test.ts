import { describe, expect, it } from "vitest";
import type { AreaCardV3 } from "../feed/card-types";
import {
	appPathForSharedPath,
	shareContent,
	shareTargetForCard,
	shareUrl,
} from "./share-link";

describe("shareUrl", () => {
	it("sends a community to its web page, on www", () => {
		expect(
			shareUrl({ kind: "community", slug: "northbrooke", name: "Northbrooke" }),
		).toBe("https://www.percho.co/c/northbrooke");
	});

	it("sends a city to its city page", () => {
		expect(
			shareUrl({ kind: "city", slug: "suwanee-ga", name: "Suwanee" }),
		).toBe("https://www.percho.co/city/suwanee-ga");
	});

	it("escapes a slug that is not URL-safe", () => {
		expect(shareUrl({ kind: "community", slug: "a b", name: "A" })).toBe(
			"https://www.percho.co/c/a%20b",
		);
	});
});

describe("shareContent", () => {
	it("ends the message with the link, for targets that drop `url`", () => {
		const c = shareContent({
			kind: "city",
			slug: "suwanee-ga",
			name: "Suwanee",
		});
		expect(c.url).toBe("https://www.percho.co/city/suwanee-ga");
		expect(c.message.endsWith(c.url)).toBe(true);
		expect(c.message.startsWith("Suwanee")).toBe(true);
	});
});

describe("appPathForSharedPath", () => {
	it("maps the web community page to the app's community route", () => {
		expect(appPathForSharedPath("/c/northbrooke")).toBe(
			"/community/northbrooke",
		);
		expect(appPathForSharedPath("/c/northbrooke/")).toBe(
			"/community/northbrooke",
		);
	});

	it("takes the whole URL iOS hands over", () => {
		expect(appPathForSharedPath("https://www.percho.co/c/northbrooke")).toBe(
			"/community/northbrooke",
		);
		expect(
			appPathForSharedPath("https://www.percho.co/city/suwanee-ga?x=1"),
		).toBe("/city/suwanee-ga");
		expect(appPathForSharedPath("percho://feed")).toBeNull();
	});

	it("sends the web community feed to the community page", () => {
		expect(appPathForSharedPath("/c/northbrooke/feed")).toBe(
			"/community/northbrooke",
		);
	});

	it("keeps a city on its city route", () => {
		expect(appPathForSharedPath("/city/suwanee-ga")).toBe("/city/suwanee-ga");
	});

	it("drops the query and hash", () => {
		expect(appPathForSharedPath("/c/northbrooke?utm_source=x#top")).toBe(
			"/community/northbrooke",
		);
	});

	it("leaves every other path to the router", () => {
		expect(appPathForSharedPath("/")).toBeNull();
		expect(appPathForSharedPath("/feed")).toBeNull();
		expect(appPathForSharedPath("/community/northbrooke")).toBeNull();
		expect(appPathForSharedPath("/c/")).toBeNull();
		expect(appPathForSharedPath("/c/a/b")).toBeNull();
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
});
