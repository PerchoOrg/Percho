import { describe, expect, it } from "vitest";
import type { FeedPool } from "./generate-feed";
import { generateFeed } from "./generate-feed";
import { withoutHidden } from "./hidden";
import { EMPTY_SIGNALS } from "./signals";

const unit = (slug: string) => ({
	id: `city:${slug}`,
	level: "city" as const,
	name: slug,
	state: "GA",
	centroid: { lat: 34, lng: -84 },
	videoUrl: `https://example.test/${slug}.m3u8`,
	communityCount: 1,
	sampleCommunityNames: [],
	stats: {},
});
const community = (id: string) => ({
	kind: "community" as const,
	id,
	slug: id,
	name: id,
	city: "Suwanee",
	state: "GA",
	heroUrl: `https://example.test/${id}.jpg`,
	videoUrl: `https://example.test/${id}.m3u8`,
});

const pool: FeedPool = {
	geoUnits: [unit("suwanee-ga"), unit("duluth-ga")],
	communities: [community("c1"), community("c2"), community("c3")],
	listings: [],
};

describe("withoutHidden", () => {
	it("hands the pool back untouched when nothing is hidden", () => {
		expect(withoutHidden(pool, [])).toBe(pool);
	});

	it("takes a hidden community and a hidden city out", () => {
		const dealt = withoutHidden(pool, ["c2", "area-city:duluth-ga"]);
		expect(dealt.communities.map((c) => c.id)).toEqual(["c1", "c3"]);
		expect(dealt.geoUnits.map((u) => u.id)).toEqual(["city:suwanee-ga"]);
	});

	it("leaves the pool it was given whole", () => {
		withoutHidden(pool, ["c2"]);
		expect(pool.communities).toHaveLength(3);
	});

	it("keeps a hidden card out of a deck even once the rest have been seen", () => {
		// The composer loops seen cards when it runs out of fresh ones; a
		// hidden card must not come back that way.
		const { cards } = generateFeed({
			stage: 4,
			signals: EMPTY_SIGNALS,
			pool: withoutHidden(pool, ["c2", "area-city:duluth-ga"]),
			seenIds: ["c1", "c3", "area-city:suwanee-ga"],
			count: 12,
			rotate: 0,
			listings: false,
		});
		expect(cards.length).toBeGreaterThan(0);
		expect(cards.map((c) => c.id)).not.toContain("c2");
		expect(cards.map((c) => c.id)).not.toContain("area-city:duluth-ga");
	});
});
