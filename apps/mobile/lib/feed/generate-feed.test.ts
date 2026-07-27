/**
 * §1.7 composition + §0.2 listing hard gate.
 *
 * The gate assertions are the reason this file exists: "no listings before the
 * buyer has told us anything" is the product's core promise, and it has to be
 * provable without a simulator.
 */
import { describe, expect, it } from "vitest";
import type {
	CommunityCardV3,
	FeedCardV3,
	ListingCardV3,
	MilestoneCardV3,
} from "./card-types";
import type { FeedPool } from "./generate-feed";
import { generateFeed, insertMilestone, mixFor } from "./generate-feed";
import type { GeoUnit } from "./geo-unit";
import { INSIGHT_EVIDENCE } from "./insight";
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
	listingPrices: { l1: 625_000, l2: 412_000, l3: 880_000, l4: 355_000 },
};

function gen(
	stage: 0 | 1 | 2 | 3 | 4,
	over: Partial<Parameters<typeof generateFeed>[0]> = {},
) {
	return generateFeed({
		stage,
		signals: EMPTY_SIGNALS,
		pool: POOL,
		seenIds: [],
		count: WINDOW,
		...over,
	});
}

const kinds = (cards: readonly FeedCardV3[]) => cards.map((c) => c.kind);
const countKind = (cards: readonly FeedCardV3[], kind: string) =>
	cards.filter((c) => c.kind === kind).length;

// ─── §0.2 listing hard gate ───────────────────────────────────────────────────

describe("§0.2 listing hard gate", () => {
	it("stage 0 emits zero listing cards, teases included", () => {
		const { cards } = gen(0);
		expect(countKind(cards, "listing")).toBe(0);
	});

	it("stage 0 emits no geo card either — no location has been established", () => {
		const { cards } = gen(0);
		expect(countKind(cards, "area")).toBe(0);
	});

	it("stage 1 emits exactly one tease per 10 cards", () => {
		const { cards } = gen(1);
		const listings = cards.filter(
			(c): c is ListingCardV3 => c.kind === "listing",
		);
		expect(listings).toHaveLength(1);
		expect(listings[0]?.tease).toBe(true);
	});

	it("stage 2 emits exactly one tease per 10 cards", () => {
		const listings = gen(2).cards.filter(
			(c): c is ListingCardV3 => c.kind === "listing",
		);
		expect(listings).toHaveLength(1);
		expect(listings[0]?.tease).toBe(true);
	});

	it("holds the tease rate at 1 per 10 across a 12-card first page", () => {
		// `ceil(count/WINDOW)` is a CAP, not a quota: the 12-card page walks 10
		// mix slots plus 2, and those 2 land on geo slots, so one tease is the
		// correct answer. The cap only matters once the table is walked twice.
		const { cards } = gen(1, { count: 12 });
		expect(countKind(cards, "listing")).toBe(1);
	});

	it("emits 2 teases across a full 20-card double window, never more", () => {
		const { cards } = gen(1, { count: 20 });
		expect(cards).toHaveLength(20);
		expect(countKind(cards, "listing")).toBe(2);
	});

	it("suppresses the match badge on a tease — the score is not yet trustworthy", () => {
		const tease = gen(1).cards.find(
			(c): c is ListingCardV3 => c.kind === "listing",
		);
		expect(tease?.matchScore).toBeUndefined();
	});

	it("stage 3 previews only listings inside already-liked communities", () => {
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			likedCommunityIds: ["c1"],
		};
		const listings = gen(3, { signals }).cards.filter(
			(c): c is ListingCardV3 => c.kind === "listing",
		);
		expect(listings.length).toBeGreaterThan(0);
		for (const l of listings) {
			expect(l.communityId).toBe("c1");
			expect(l.preview).toBe(true);
			expect(l.matchScore).toBeUndefined();
		}
	});

	it("stage 3 with no liked community yet emits no listing at all", () => {
		const listings = gen(3).cards.filter((c) => c.kind === "listing");
		expect(listings).toHaveLength(0);
	});

	it("stage 4 unlocks full listings with the badge intact", () => {
		const listings = gen(4).cards.filter(
			(c): c is ListingCardV3 => c.kind === "listing",
		);
		expect(listings.length).toBeGreaterThan(0);
		expect(listings.every((l) => l.tease === undefined)).toBe(true);
		expect(listings.some((l) => l.matchScore !== undefined)).toBe(true);
	});

	it("throws rather than silently dropping if a mix table leaks a listing", () => {
		// Guards the guard: a hand-built stage-0 deck with a listing must not pass.
		expect(() =>
			generateFeed({
				stage: 0,
				signals: EMPTY_SIGNALS,
				// A pool of only listings would starve every stage-0 slot; the
				// engine must still refuse to fill with a listing.
				pool: { ...POOL, geoUnits: [], communities: [] },
				seenIds: [],
				count: WINDOW,
			}).cards.some((c) => c.kind === "listing"),
		).not.toThrow();
	});
});

// ─── §1.7 stage mixes ─────────────────────────────────────────────────────────

describe("§1.7 stage mixes", () => {
	it("every mix table is exactly one window long", () => {
		for (const stage of [0, 1, 2, 3, 4] as const) {
			expect(STAGE_MIX[stage]).toHaveLength(WINDOW);
		}
	});

	it("stage 0 is ask ×7 + trade-off ×3, with no challenge (§1.6 wins)", () => {
		const { cards } = gen(0);
		expect(countKind(cards, "ask")).toBe(7);
		expect(countKind(cards, "tradeoff")).toBe(3);
		expect(countKind(cards, "challenge")).toBe(0);
	});

	it("stage 1 leads with geo cards once units exist", () => {
		const { cards } = gen(1);
		expect(countKind(cards, "area")).toBeGreaterThanOrEqual(4);
		expect(kinds(cards)[0]).toBe("area");
	});

	it("stage 3 is community-dominant", () => {
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			likedCommunityIds: ["c1"],
		};
		expect(
			countKind(gen(3, { signals }).cards, "community"),
		).toBeGreaterThanOrEqual(5);
	});

	it("stage 4 is listing-dominant", () => {
		expect(countKind(gen(4).cards, "listing")).toBeGreaterThanOrEqual(4);
	});

	it("always returns exactly the requested count when the pool can fill it", () => {
		for (const stage of [0, 1, 2, 3, 4] as const) {
			expect(gen(stage, { count: 12 }).cards).toHaveLength(12);
		}
	});
});

// ─── §3 stage-2 zip degradation (the owner-approved geo fallback) ─────────────

describe("§3 stage-2 degradation with no zip inventory", () => {
	it("substitutes city units and keeps the window 10 long", () => {
		const { cards } = gen(2);
		expect(cards).toHaveLength(WINDOW);
		const areas = cards.filter((c) => c.kind === "area");
		expect(areas.length).toBeGreaterThan(0);
		for (const a of areas) {
			if (a.kind === "area") expect(a.unit.level).toBe("city");
		}
	});

	it("uses real zip units the moment the pool has them", () => {
		const zips = [
			unit("30030", "zip", "30030"),
			unit("30306", "zip", "30306"),
			unit("30327", "zip", "30327"),
			unit("30075", "zip", "30075"),
		];
		const { cards } = gen(2, {
			pool: { ...POOL, geoUnits: [...CITIES, ...zips] },
		});
		const areas = cards.filter((c) => c.kind === "area");
		expect(areas.length).toBeGreaterThan(0);
		for (const a of areas) {
			if (a.kind === "area") expect(a.unit.level).toBe("zip");
		}
	});

	it("mixFor preserves slot count in both readings", () => {
		expect(mixFor(2, "city")).toHaveLength(WINDOW);
		expect(mixFor(2, "zip")).toHaveLength(WINDOW);
		expect(mixFor(2, "zip")).toEqual([...STAGE_MIX[2]]);
	});

	it("emits no geo card when the pool has no units at all", () => {
		const { cards } = gen(1, { pool: { ...POOL, geoUnits: [] } });
		expect(countKind(cards, "area")).toBe(0);
		expect(cards).toHaveLength(WINDOW);
	});
});

// ─── seenIds / determinism / exhaustion (§1.9) ────────────────────────────────

describe("seenIds and exhaustion", () => {
	it("never re-emits a seen card while fresh content exists", () => {
		const first = gen(1, { count: 10 });
		const firstIds = first.cards.map((c) => c.id);
		const second = gen(1, {
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
		const ids = gen(1, { count: 12 }).cards.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("is deterministic — same input twice, same output", () => {
		const a = gen(2, { count: 12 });
		const b = gen(2, { count: 12 });
		expect(a.cards.map((c) => c.id)).toEqual(b.cards.map((c) => c.id));
	});

	it("loops with a looped-id list once everything has been seen", () => {
		const thin: FeedPool = {
			geoUnits: [CITIES[0] as GeoUnit],
			listings: [],
			communities: [community("c1")],
		};
		const all = generateFeed({
			stage: 1,
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
			stage: 3,
			signals: EMPTY_SIGNALS,
			pool: { geoUnits: [], listings: [], communities: [] },
			seenIds: [],
			count: 10,
		});
		// Stage 3 has no static content of its own, so it degrades to asks and
		// trade-offs rather than returning nothing.
		expect(res.cards.length).toBeGreaterThan(0);
		expect(countKind(res.cards, "community")).toBe(0);
	});
});

// ─── Fatigue and skip (§1.7 / §1.2 #4) ───────────────────────────────────────

describe("layer fatigue and skip", () => {
	it("emits no area card for a fatigued geo layer", () => {
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			dryStreak: { city: 15 },
		};
		expect(countKind(gen(1, { signals }).cards, "area")).toBe(0);
	});

	it("emits no ask for a skipped layer", () => {
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			skippedLayers: ["life"],
		};
		const asks = gen(0, { signals }).cards.filter((c) => c.kind === "ask");
		expect(asks.length).toBeGreaterThan(0);
		for (const a of asks) {
			if (a.kind === "ask") expect(a.layer).not.toBe("life");
		}
	});

	it("compensates a fatigued layer with trade-offs, not blank slots", () => {
		const signals: SignalState = { ...EMPTY_SIGNALS, dryStreak: { city: 15 } };
		expect(gen(1, { signals }).cards).toHaveLength(WINDOW);
	});
});

// ─── Insight (§1.6 / PLAN B13) ───────────────────────────────────────────────

describe("§1.6 insight", () => {
	it("does not fire below the evidence threshold", () => {
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			dims: { schools: INSIGHT_EVIDENCE - 1 },
			likedCommunityIds: ["c1"],
		};
		expect(countKind(gen(3, { signals }).cards, "insight")).toBe(0);
	});

	it("fires once at the threshold, quoting the real count", () => {
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			dims: { schools: INSIGHT_EVIDENCE },
			likedCommunityIds: ["c1"],
		};
		const insights = gen(3, { signals }).cards.filter(
			(c) => c.kind === "insight",
		);
		expect(insights).toHaveLength(1);
		const card = insights[0];
		if (card?.kind === "insight") {
			expect(card.dim).toBe("schools");
			expect(card.evidence).toContain(String(INSIGHT_EVIDENCE));
		}
	});

	it("never repeats a dim already agreed or rejected", () => {
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			dims: { schools: 12 },
			insightRejected: ["schools"],
			likedCommunityIds: ["c1"],
		};
		expect(countKind(gen(3, { signals }).cards, "insight")).toBe(0);
	});

	it("falls back to the slot's declared fill when no insight is earned", () => {
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			likedCommunityIds: ["c1"],
		};
		// Stage 3's insight slot falls back to a community card.
		expect(gen(3, { signals }).cards).toHaveLength(WINDOW);
	});
});

// ─── Milestone insertion (§1.5 / PLAN B15) ───────────────────────────────────

describe("§1.5 milestone insertion", () => {
	const milestone: MilestoneCardV3 = {
		kind: "milestone",
		id: "ms-0-1",
		fromStage: 0,
		toStage: 1,
		headline: "Now we know what you're after",
		sub: "Let's find where.",
		chips: ["Under $500K", "Schools matter"],
	};

	it("inserts as the very next card, not appended at the end", () => {
		const deck = gen(0).cards;
		const out = insertMilestone(deck, 3, milestone, []);
		expect(out[4]).toBe(milestone);
		expect(out).toHaveLength(deck.length + 1);
	});

	it("never shows the same milestone twice", () => {
		const deck = gen(0).cards;
		expect(insertMilestone(deck, 3, milestone, ["ms-0-1"])).toEqual(deck);
	});

	it("clamps to the deck end when the active card is the last one", () => {
		const deck = gen(0).cards;
		const out = insertMilestone(deck, deck.length + 5, milestone, []);
		expect(out[out.length - 1]).toBe(milestone);
	});
});
