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

	it("caps the UNFILMED cards of each kind, not the filmed ones", () => {
		// The cap is there so the deck exercises every face quickly. A filmed
		// card is not there to be exercised, it is there to be watched — and a
		// cap of three made twelve finished films unreachable on device.
		const deck = buildSamplerDeck({ pool, stage: 4 });
		const unfilmed = new Map<string, number>();
		for (const card of deck) {
			if ("videoUrl" in card && card.videoUrl) continue;
			unfilmed.set(card.kind, (unfilmed.get(card.kind) ?? 0) + 1);
		}
		for (const [kind, n] of unfilmed) {
			expect(n, kind).toBeLessThanOrEqual(SAMPLER_PER_KIND);
		}
	});

	it("carries EVERY filmed card, however many there are", () => {
		const many: FeedPool = {
			...pool,
			listings: Array.from({ length: 12 }, (_, i) =>
				listing(`v${i}`, `https://videodelivery.net/v${i}/manifest/video.m3u8`),
			),
		};
		const deck = buildSamplerDeck({ pool: many, stage: 4 });
		const filmed = deck.filter((c) => "videoUrl" in c && c.videoUrl);
		expect(filmed).toHaveLength(12 + 1); // 12 listings + the one community
	});

	it("does not drop a card past the third of its kind", () => {
		// The interleave used to run SAMPLER_PER_KIND rounds, which was
		// invisible while every group was capped at three.
		const many: FeedPool = {
			...pool,
			listings: [
				...Array.from({ length: 5 }, (_, i) =>
					listing(
						`v${i}`,
						`https://videodelivery.net/v${i}/manifest/video.m3u8`,
					),
				),
				listing("p1"),
				listing("p2"),
				listing("p3"),
			],
		};
		const deck = buildSamplerDeck({ pool: many, stage: 4 });
		const ids = new Set(deck.map((c) => c.id));
		for (let i = 0; i < 5; i++) expect(ids.has(`v${i}`), `v${i}`).toBe(true);
	});

	it("never repeats a card id (a duplicate key is a device-level bug)", () => {
		const deck = buildSamplerDeck({ pool, stage: 4 });
		const ids = deck.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("covers the kinds the pool can really support", () => {
		// Listings and communities are the whole deck since area and trade-off
		// cards were pulled (2026-08-22) — the sampler carries what the
		// production mix carries, nothing else.
		const kinds = new Set(
			buildSamplerDeck({ pool, stage: 4 }).map((c) => c.kind),
		);
		expect([...kinds].sort()).toEqual(["community", "listing"]);
	});

	it("emits no listing/community cards from an empty pool rather than blanks", () => {
		const empty: FeedPool = { geoUnits: [], listings: [], communities: [] };
		const deck = buildSamplerDeck({ pool: empty, stage: 4 });
		expect(deck.some((c) => c.kind === "listing")).toBe(false);
		expect(deck.some((c) => c.kind === "community")).toBe(false);
		expect(deck.some((c) => c.kind === "area")).toBe(false);
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
