import { describe, expect, it } from "vitest";
import type { CommunityCardV3, ListingCardV3 } from "./card-types";
import {
	SAMPLER_PER_KIND,
	buildSamplerDeck,
	samplerLabel,
} from "./dev-sampler";
import type { FeedPool } from "./generate-feed";
import type { GeoUnit } from "./geo-unit";

function listing(id: string, videoUrl?: string): ListingCardV3 {
	return {
		kind: "listing",
		id,
		slug: id,
		address: `${id} Street`,
		priceLabel: "$419K",
		bedBathSqft: "3 bd · 3 ba · 1,870 sqft",
		heroUrl: `https://example.test/${id}.jpg`,
		...(videoUrl ? { videoUrl } : {}),
	};
}

function community(id: string, videoUrl?: string): CommunityCardV3 {
	return {
		kind: "community",
		id,
		slug: id,
		name: `Community ${id}`,
		city: "Duluth",
		state: "GA",
		heroUrl: `https://example.test/${id}.jpg`,
		...(videoUrl ? { videoUrl } : {}),
	};
}

function unit(id: string): GeoUnit {
	return {
		id,
		level: "city",
		name: id,
		state: "GA",
		centroid: { lat: 34, lng: -84 },
		communityCount: 10,
		sampleCommunityNames: [],
		stats: {},
	};
}

const pool: FeedPool = {
	geoUnits: [unit("a"), unit("b"), unit("c"), unit("d")],
	listings: [
		listing("l1"),
		listing("l2", "https://videodelivery.net/x/manifest/video.m3u8"),
		listing("l3"),
		listing("l4"),
		listing("l5"),
	],
	communities: [
		community("c1"),
		community("c2"),
		community("c3", "https://videodelivery.net/y/manifest/video.m3u8"),
	],
	listingPrices: { l1: 419000, l2: 505000, l3: 380000 },
};

describe("buildSamplerDeck", () => {
	it("puts EVERY video-bearing card at the very front", () => {
		// The whole point of the flag (owner: "把带视频的卡片放到前面来让我测试").
		const deck = buildSamplerDeck({ pool, stage: 4 });
		const videoIdx = deck
			.map((c, i) => ("videoUrl" in c && c.videoUrl ? i : -1))
			.filter((i) => i >= 0);
		expect(videoIdx.length).toBe(2);
		expect(videoIdx).toEqual([0, 1]);
	});

	it("emits at most SAMPLER_PER_KIND cards of each kind", () => {
		const deck = buildSamplerDeck({ pool, stage: 4 });
		const counts = new Map<string, number>();
		for (const card of deck) {
			counts.set(card.kind, (counts.get(card.kind) ?? 0) + 1);
		}
		for (const [kind, n] of counts) {
			expect(n, kind).toBeLessThanOrEqual(SAMPLER_PER_KIND);
		}
	});

	it("never repeats a card id (a duplicate key is a device-level bug)", () => {
		const deck = buildSamplerDeck({ pool, stage: 4 });
		const ids = deck.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("covers the kinds the pool can really support", () => {
		const kinds = new Set(
			buildSamplerDeck({ pool, stage: 4 }).map((c) => c.kind),
		);
		expect(kinds).toContain("listing");
		expect(kinds).toContain("community");
		expect(kinds).toContain("area");
		expect(kinds).toContain("ask");
		expect(kinds).toContain("tradeoff");
		expect(kinds).toContain("challenge");
	});

	it("strips tease/preview so a sampled listing renders as a full card", () => {
		const teased: FeedPool = {
			...pool,
			listings: [{ ...listing("t1"), tease: true as const }],
		};
		const card = buildSamplerDeck({ pool: teased, stage: 4 }).find(
			(c) => c.kind === "listing",
		);
		expect(card && "tease" in card ? card.tease : undefined).toBeUndefined();
	});

	it("emits no listing/community cards from an empty pool rather than blanks", () => {
		const empty: FeedPool = { geoUnits: [], listings: [], communities: [] };
		const deck = buildSamplerDeck({ pool: empty, stage: 4 });
		expect(deck.some((c) => c.kind === "listing")).toBe(false);
		expect(deck.some((c) => c.kind === "community")).toBe(false);
		expect(deck.some((c) => c.kind === "area")).toBe(false);
	});

	it("omits challenge cards for listings with no known price", () => {
		const noPrices: FeedPool = { ...pool, listingPrices: {} };
		const deck = buildSamplerDeck({ pool: noPrices, stage: 4 });
		expect(deck.some((c) => c.kind === "challenge")).toBe(false);
	});
});

describe("samplerLabel", () => {
	it("reports the deck size and how many carry video", () => {
		const deck = buildSamplerDeck({ pool, stage: 4 });
		expect(samplerLabel(deck)).toBe(
			`DEV SAMPLER · ${deck.length} cards · 2 with video`,
		);
	});
});
