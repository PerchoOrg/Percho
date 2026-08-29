import { describe, expect, it } from "vitest";
import type {
	CommunityCardV3,
	FeedCardV3,
	ListingCardV3,
	TradeoffCardV3,
} from "./card-types";
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

function listing(
	id: string,
	communityId?: string,
	dims: ListingCardV3["dims"] = undefined,
	price?: number,
): ListingCardV3 {
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
		...(dims ? { dims } : {}),
		...(price === undefined ? {} : { price }),
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
	it("the mix table holds listing, community and trade-off slots", () => {
		// 2026-08-22 removed the geo AND trade-off slots; 2026-08-29 put the
		// trade-off back with the Two Doors face. Geo is still out.
		expect(new Set(STAGE_MIX[4].map((s) => s.fill))).toEqual(
			new Set(["listing", "community", "tradeoff"]),
		);
		expect(STAGE_MIX[4].length).toBeLessThanOrEqual(WINDOW);
	});

	it("asks exactly one trade-off per cycle, and the cycle is odd", () => {
		// The length is load-bearing, not cosmetic: `loopedFallback` reaches every
		// pool row only when the table length and the pool size are coprime, and
		// the live video-only inventory is 16 listings / 4 communities. An even
		// table loops a subset forever — see the note in `ratios.ts`.
		expect(STAGE_MIX[4].filter((s) => s.fill === "tradeoff")).toHaveLength(1);
		expect(STAGE_MIX[4].length % 2).toBe(1);
	});

	it("stage 4 is listing-dominant", () => {
		const { cards } = gen(4);
		expect(countKind(cards, "listing")).toBeGreaterThanOrEqual(4);
	});

	it("emits the three surviving kinds and nothing else", () => {
		const { cards } = gen(4);
		expect(countKind(cards, "listing")).toBeGreaterThan(0);
		expect(countKind(cards, "community")).toBeGreaterThan(0);
		expect(countKind(cards, "tradeoff")).toBeGreaterThan(0);
		expect(countKind(cards, "area")).toBe(0);
	});

	it("mixFor returns the stage-4 table", () => {
		expect(mixFor(4, "city")).toHaveLength(STAGE_MIX[4].length);
		expect(mixFor(4, "zip")).toHaveLength(STAGE_MIX[4].length);
	});

	it("always returns exactly the requested count when the pool can fill it", () => {
		expect(gen(4, { count: 12 }).cards).toHaveLength(12);
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
		// POOL holds 12 real cards (4 listings + 8 communities), so a 10-card
		// first page leaves exactly TWO unseen — and two cards is the whole of
		// "while fresh content exists". A longer second page is the looped tail,
		// which repeats on purpose; that contract is the next test.
		//
		// This asked for ten before 2026-08-23 and passed for the wrong reason:
		// the tail could only loop communities, and a looped community straight
		// after the fresh ones broke the run limit, so `loopedFallback` returned
		// null and the page ended early with nothing to overlap.
		const first = gen(4, { count: 10 });
		const firstIds = first.cards.map((c) => c.id);
		const second = gen(4, {
			count: 2,
			seenIds: firstIds,
			rotate: first.nextRotate,
		});
		const overlap = second.cards
			.map((c) => c.id)
			.filter((id) => firstIds.includes(id));
		expect(overlap).toEqual([]);
		expect(second.loopedIds).toEqual([]);
	});

	it("loops LISTINGS too, and walks the whole pool doing it", () => {
		// Owner 2026-08-23: "why cant i see listing videos multiple times, but
		// community videos i can see multiple times… they should be same", and
		// on what the loop is for — "it is for testing, we should see all ready
		// ones in a loop". Listings were the one kind `loopedFallback` refused,
		// so past the end of the pool every card was a community.
		const long = generateFeed({
			stage: 4,
			signals: EMPTY_SIGNALS,
			pool: POOL,
			seenIds: [],
			count: 120,
		});
		expect(long.cards).toHaveLength(120);
		const looped = new Set(long.loopedIds);
		// Every ready card comes back round, not just the communities.
		for (const l of POOL.listings) expect(looped.has(l.id)).toBe(true);
		for (const c of POOL.communities) expect(looped.has(c.id)).toBe(true);
		// And the tail still looks like the deck: the 5:2 table governs the
		// looped cards too, so it does not collapse to alternating kinds.
		const tail = long.cards.slice(12);
		const listings = tail.filter((c) => c.kind === "listing").length;
		expect(listings).toBeGreaterThan(tail.length / 2);
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
		// Both surviving kinds come from the pool — with the static trade-off
		// table out of the mix there is nothing left to fall back on, so an
		// empty pool means an empty deck and the §1.9 terminal card.
		expect(res.cards).toEqual([]);
	});
});

// ─── Trade-off doors (2026-08-29 Two Doors face) ──────────────────────────────

describe("trade-off doors show a detail photo, never a hero", () => {
	const LIVING = "https://img/living.jpg";
	const KITCHEN = "https://img/kitchen.jpg";

	/** A pool the server has lit: two property dims with real room photos. */
	const LIT: FeedPool = {
		geoUnits: CITIES,
		listings: [
			listing("l-space1", undefined, ["space"], 300_000),
			listing("l-space2", undefined, ["space"], 342_000),
			listing("l-space3", undefined, ["space"], 400_000),
			listing("l-movein", undefined, ["move_in"], 500_000),
			listing("l-plain"),
		],
		communities: [community("c-plain")],
		dimPhotos: {
			space: [
				{ url: LIVING, caption: "Living area with large patio doors" },
				{ url: `${LIVING}?2` },
				{ url: `${LIVING}?3` },
			],
			move_in: [
				{
					url: KITCHEN,
					caption: "Modern kitchen with white cabinetry and center island",
				},
				{ url: `${KITCHEN}?2` },
			],
		},
	};

	const firstTradeoff = (
		pool: FeedPool,
		seenIds: string[] = [],
	): TradeoffCardV3 | undefined =>
		generateFeed({
			stage: 4,
			signals: EMPTY_SIGNALS,
			pool,
			seenIds,
			count: WINDOW,
		}).cards.find((c): c is TradeoffCardV3 => c.kind === "tradeoff");

	it("lights each door with every room photo the server sent", () => {
		const card = firstTradeoff(LIT);
		expect(card?.id).toBe("to-space-vs-movein");
		// Three plates on one side, two on the other — fewer is correct when the
		// pool cannot supply three DIFFERENT homes.
		expect(card?.left.photos?.map((p) => p.url)).toEqual([
			LIVING,
			`${LIVING}?2`,
			`${LIVING}?3`,
		]);
		expect(card?.right.photos).toHaveLength(2);
		// The tagger sentence rides its own frame, not the side.
		expect(card?.left.photos?.[0]?.caption).toBe(
			"Living area with large patio doors",
		);
	});

	it("NEVER falls back to a listing hero", () => {
		// The regression this whole rewrite exists for (owner, 2026-08-29): a
		// front-elevation shot cannot depict "move-in ready". Listings claim both
		// dims here and every one of them has a heroUrl — the doors must still be
		// dark, because no ROOM photo and no place photo exists for them.
		const noPhotos: FeedPool = { ...LIT, dimPhotos: {} };
		const card = firstTradeoff(noPhotos);
		expect(card).toBeDefined();
		const heroes = noPhotos.listings.map((l) => l.heroUrl);
		for (const photo of [
			...(card?.left.photos ?? []),
			...(card?.right.photos ?? []),
		]) {
			expect(heroes).not.toContain(photo.url);
		}
		expect(card?.left.photos).toBeUndefined();
		expect(card?.right.photos).toBeUndefined();
	});

	it("lights a PLACE dim with a community hero, and no caption", () => {
		// No room inside a house shows "trail access". Seeing every property pair
		// pushes the engine onto the life-scope bank, where communities are the
		// only honest source.
		const places: FeedPool = {
			geoUnits: CITIES,
			listings: [listing("l1")],
			communities: [
				community("c-trails", ["trails"]),
				community("c-walkable", ["walkable"]),
			],
			dimPhotos: {},
		};
		const card = firstTradeoff(places, [
			"to-space-vs-movein",
			"to-kitchen-vs-yard",
			"to-newbuild-vs-character",
		]);
		expect(card?.id).toBe("to-trails-vs-walkable");
		// One poster per door — a place has no three-room set to show.
		expect(card?.left.photos?.map((p) => p.url)).toEqual([
			"https://img/c-trails.jpg",
		]);
		expect(card?.right.photos?.map((p) => p.url)).toEqual([
			"https://img/c-walkable.jpg",
		]);
		// A tour poster carries no tagger sentence.
		expect(card?.left.photos?.[0]?.caption).toBeUndefined();
	});

	it("never lets one photograph light both doors", () => {
		const shared: FeedPool = {
			...LIT,
			dimPhotos: { space: [{ url: LIVING }], move_in: [{ url: LIVING }] },
		};
		// Both other property pairs marked seen, so this one is what comes back
		// even though `bestLit` cannot fully light it.
		const card = firstTradeoff(shared, [
			"to-kitchen-vs-yard",
			"to-newbuild-vs-character",
		]);
		expect(card?.id).toBe("to-space-vs-movein");
		expect(card?.left.photos?.map((p) => p.url)).toEqual([LIVING]);
		expect(card?.right.photos).toBeUndefined();
	});

	it("prefers a question both of whose doors can be lit", () => {
		// `to-space-vs-movein` is lit; the other two property pairs are not. It
		// must come first even though the engine's rotation would reach another.
		expect(firstTradeoff(LIT)?.id).toBe("to-space-vs-movein");
	});

	it("counts the homes behind each side, and medians only above the floor", () => {
		const card = firstTradeoff(LIT);
		// 3 homes claim `space` → a median is a fact worth printing.
		expect(card?.left.homes).toBe(3);
		expect(card?.left.medianLabel).toBe("$342,000");
		// 1 home claims `move_in` → the count stands alone.
		expect(card?.right.homes).toBe(1);
		expect(card?.right.medianLabel).toBeUndefined();
	});

	it("asks nothing at all when the pool is bare", () => {
		// No inventory is the §1.9 terminal card, never an interview.
		expect(
			firstTradeoff({ geoUnits: CITIES, listings: [], communities: [] }),
		).toBeUndefined();
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
