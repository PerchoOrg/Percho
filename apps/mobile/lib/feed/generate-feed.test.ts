/**
 * §1.7 composition — the single unlocked stage 4 mix.
 *
 * 2026-08-15: the funnel collapsed. There is no listing hard gate (stage 4 is
 * listing-dominant by design), no stage 0-3 mixes, no tease/preview gating, no
 * insight, no milestone. What survives is the composition contract: window
 * length, seenIds dedupe, determinism, exhaustion/looping, and fatigue.
 */
import { describe, expect, it } from "vitest";
import type { CommunityCardV3, FeedCardV3, ListingCardV3 } from "./card-types";
import type { FeedPool } from "./generate-feed";
import { generateFeed, mixFor } from "./generate-feed";
import type { GeoUnit } from "./geo-unit";
import { STAGE_MIX, WINDOW } from "./ratios";
import type { SignalState } from "./signals";
import { EMPTY_SIGNALS } from "./signals";

// ─── Fixtures: shaped like the real Supabase rows, no invented stats ──────────

function unit(id: string, level: GeoUnit["level"], name: string): GeoUnit {
	return {
		id: `${level}:${id}`,
		level,
		name,
		state: "GA",
		centroid: { lat: 33.7, lng: -84.4 },
		communityCount: 12,
		sampleCommunityNames: ["Waterside", "Vinings Estates"],
		stats: {},
	};
}

function community(
	id: string,
	dims: CommunityCardV3["dims"] = [],
): CommunityCardV3 {
	return {
		kind: "community",
		id,
		slug: id,
		name: `Community ${id}`,
		city: "Atlanta",
		state: "GA",
		heroUrl: `https://img/${id}.jpg`,
		geoUnitId: "city:atlanta-ga",
		dims,
	};
}

function listing(id: string, communityId?: string): ListingCardV3 {
	return {
		kind: "listing",
		id,
		slug: id,
		address: `${id} Peachtree St`,
		priceLabel: "$625,000",
		bedBathSqft: "4 bd · 3 ba · 2,400 sqft",
		heroUrl: `https://img/${id}.jpg`,
		matchScore: 88,
		...(communityId ? { communityId } : {}),
	};
}

const CITIES = [
	unit("atlanta-ga", "city", "Atlanta"),
	unit("decatur-ga", "city", "Decatur"),
	unit("marietta-ga", "city", "Marietta"),
	unit("alpharetta-ga", "city", "Alpharetta"),
	unit("smyrna-ga", "city", "Smyrna"),
	unit("roswell-ga", "city", "Roswell"),
];

const POOL: FeedPool = {
	geoUnits: CITIES,
	listings: [
		listing("l1", "c1"),
		listing("l2", "c2"),
		listing("l3", "c1"),
		listing("l4"),
	],
	communities: [
		community("c1", ["schools"]),
		community("c2", ["walkable"]),
		community("c3", ["quiet"]),
		community("c4"),
		community("c5"),
		community("c6"),
		community("c7"),
		community("c8"),
	],
};

function gen(stage: 4, over: Partial<Parameters<typeof generateFeed>[0]> = {}) {
	return generateFeed({
		stage,
		signals: EMPTY_SIGNALS,
		pool: POOL,
		seenIds: [],
		count: WINDOW,
		...over,
	});
}

const countKind = (cards: readonly FeedCardV3[], kind: string) =>
	cards.filter((c) => c.kind === kind).length;

// ─── §1.7 the stage-4 mix ─────────────────────────────────────────────────────

describe("§1.7 stage 4 mix", () => {
	it("the mix table is exactly one window long", () => {
		expect(STAGE_MIX[4]).toHaveLength(WINDOW);
	});

	it("stage 4 is listing-dominant", () => {
		const { cards } = gen(4);
		expect(countKind(cards, "listing")).toBeGreaterThanOrEqual(4);
	});

	it("emits a healthy mix of all 4 kinds", () => {
		const { cards } = gen(4);
		expect(countKind(cards, "area")).toBeGreaterThan(0);
		expect(countKind(cards, "community")).toBeGreaterThan(0);
		expect(countKind(cards, "tradeoff")).toBeGreaterThan(0);
	});

	it("mixFor returns the stage-4 window", () => {
		expect(mixFor(4, "city")).toHaveLength(WINDOW);
		expect(mixFor(4, "zip")).toHaveLength(WINDOW);
	});

	it("always returns exactly the requested count when the pool can fill it", () => {
		expect(gen(4, { count: 12 }).cards).toHaveLength(12);
	});

	it("uses city units when the pool has no zips", () => {
		const areas = gen(4).cards.filter((c) => c.kind === "area");
		expect(areas.length).toBeGreaterThan(0);
		for (const a of areas) {
			if (a.kind === "area") expect(a.unit.level).toBe("city");
		}
	});

	it("emits no geo card when the pool has no units at all", () => {
		const { cards } = gen(4, { pool: { ...POOL, geoUnits: [] } });
		expect(countKind(cards, "area")).toBe(0);
		expect(cards).toHaveLength(WINDOW);
	});
});

// ─── seenIds / determinism / exhaustion (§1.9) ────────────────────────────────

describe("seenIds and exhaustion", () => {
	it("never re-emits a seen card while fresh content exists", () => {
		const first = gen(4, { count: 10 });
		const firstIds = first.cards.map((c) => c.id);
		const second = gen(4, {
			count: 10,
			seenIds: firstIds,
			rotate: first.nextRotate,
		});
		const overlap = second.cards
			.map((c) => c.id)
			.filter((id) => firstIds.includes(id));
		expect(overlap).toEqual([]);
	});

	it("emits no duplicates within a single page", () => {
		const ids = gen(4, { count: 12 }).cards.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("is deterministic — same input twice, same output", () => {
		const a = gen(4, { count: 12 });
		const b = gen(4, { count: 12 });
		expect(a.cards.map((c) => c.id)).toEqual(b.cards.map((c) => c.id));
	});

	it("loops with a looped-id list once everything has been seen", () => {
		const thin: FeedPool = {
			geoUnits: [CITIES[0] as GeoUnit],
			listings: [],
			communities: [community("c1")],
		};
		const all = generateFeed({
			stage: 4,
			signals: EMPTY_SIGNALS,
			pool: thin,
			seenIds: [],
			count: 60,
		});
		expect(all.exhausted).toBe(true);
		expect(all.loopedIds.length).toBeGreaterThan(0);
	});

	it("returns an empty deck, not a crash, on a completely empty pool", () => {
		const res = generateFeed({
			stage: 4,
			signals: EMPTY_SIGNALS,
			pool: { geoUnits: [], listings: [], communities: [] },
			seenIds: [],
			count: 10,
		});
		// The trade-off table is static content, so there is always something.
		expect(res.cards.length).toBeGreaterThan(0);
	});
});

// ─── Fatigue (§1.7) ───────────────────────────────────────────────────────────

describe("layer fatigue", () => {
	it("emits no area card for a fatigued geo layer", () => {
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			dryStreak: { city: 15 },
		};
		expect(countKind(gen(4, { signals }).cards, "area")).toBe(0);
	});

	it("compensates a fatigued layer with other fills, not blank slots", () => {
		const signals: SignalState = { ...EMPTY_SIGNALS, dryStreak: { city: 15 } };
		expect(gen(4, { signals }).cards).toHaveLength(WINDOW);
	});
});
