import { describe, expect, it } from "vitest";
import type {
	CommunityCardV3,
	FeedCardV3,
	ListingCardV3,
	TradeoffCardV3,
} from "./card-types";
import { TRADEOFFS } from "./content";
import type { FeedPool } from "./generate-feed";
import {
	answerScore,
	generateFeed,
	mixFor,
	swipeAffinity,
	swipeScore,
} from "./generate-feed";
import type { GeoUnit } from "./geo-unit";
import { STAGE_MIX, WINDOW } from "./ratios";
import type { SignalState } from "./signals";
import { EMPTY_SIGNALS, applySwipe } from "./signals";

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

/** A listing with the structured axes the v2 bank measures. */
function built(id: string, yearBuilt: number, price: number): ListingCardV3 {
	return {
		...listing(id),
		yearBuilt,
		price,
		sqft: 1600 + price / 1000,
		beds: 3,
	};
}

/**
 * Every question EXCEPT the one under test, marked seen.
 *
 * The engine prefers whichever question its data can ground, so a test that
 * wants a specific one has to clear the field rather than hope for a rotation.
 */
const except = (id: string): string[] =>
	TRADEOFFS.filter((q) => q.id !== id).map((q) => q.id);
const EXCEPT_ERA = except("to-era");
const EXCEPT_SPREAD = except("to-spread-vs-upkeep");
const EXCEPT_DENSITY = except("to-quiet-vs-walkable");

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

	it("asks exactly one trade-off per cycle", () => {
		// The length was load-bearing while `loopedFallback` indexed every list
		// by the shared rotation (coprimality — see the note in `ratios.ts`);
		// the per-kind cursors of 2026-09-08 lifted that, so only the trade-off
		// rate is asserted here.
		expect(STAGE_MIX[4].filter((s) => s.fill === "tradeoff")).toHaveLength(1);
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

	it("round-robins each kind in the loop — no community twice running", () => {
		// Owner 2026-09-08: with 5 filmed communities live, the deck showed the
		// same community twice in a row and Windward only ~37 cards deep. The
		// mix's community slots are 5 apart, so indexing the ranked list by the
		// SHARED rotate collapsed both slots of a cycle onto one row (their
		// rotates are congruent mod 5). The per-kind slot-ordinal cursor is what
		// this pins down: a strict lap first, and never an immediate repeat.
		const pool: FeedPool = {
			geoUnits: [],
			listings: Array.from({ length: 15 }, (_, i) => listing(`vl${i}`)),
			communities: ["cw1", "cw2", "cw3", "cw4", "cw5"].map((id) =>
				community(id),
			),
		};
		const everything = [
			...pool.listings.map((l) => l.id),
			...pool.communities.map((c) => c.id),
		];
		const all = generateFeed({
			stage: 4,
			signals: EMPTY_SIGNALS,
			pool,
			seenIds: everything,
			count: 60,
		});
		const seq = all.cards.filter((c) => c.kind === "community");
		expect(seq.length).toBeGreaterThanOrEqual(10);
		// Strict lap: the first five community cards are the five communities.
		expect(new Set(seq.slice(0, 5).map((c) => c.id)).size).toBe(5);
		// And never the same community twice running.
		for (let i = 1; i < seq.length; i++) {
			expect(seq[i]?.id).not.toBe(seq[i - 1]?.id);
		}

		// The fresh→loop seam too: the fresh phase enters each list at
		// `firstUnseen`'s rotation, so the loop's first pick could land on the
		// card just shown. A brand-new user must not see that either.
		const fresh = generateFeed({
			stage: 4,
			signals: EMPTY_SIGNALS,
			pool,
			seenIds: [],
			count: 60,
		});
		const freshSeq = fresh.cards.filter((c) => c.kind === "community");
		for (let i = 1; i < freshSeq.length; i++) {
			expect(freshSeq[i]?.id).not.toBe(freshSeq[i - 1]?.id);
		}
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

describe("the v2 trade-off bank", () => {
	const LIVING = "https://img/living.jpg";

	/** Homes with the era axis populated on both sides of 2005/2000. */
	const ERA_POOL: FeedPool = {
		geoUnits: CITIES,
		/*
		 * Ids are chosen so the DEFAULT order (alphabetical, the engine's
		 * tie-break) is the opposite of what answering "Newer build" should
		 * produce. A fixture whose default order already matches the expected
		 * one cannot tell a working reorder from a no-op — the first version of
		 * this pool did exactly that and the rule-03 test passed vacuously.
		 */
		listings: [
			built("a-old-1998", 1998, 300_000),
			built("a-old-1995", 1995, 290_000),
			built("a-old-1985", 1985, 280_000),
			built("a-old-1978", 1978, 270_000),
			built("a-old-1972", 1972, 260_000),
			built("b-new-2012", 2012, 400_000),
			built("b-new-2008", 2008, 420_000),
			built("b-new-2006", 2006, 380_000),
		],
		communities: [community("c1")],
		dimPhotos: {},
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

	const allTradeoffs = (pool: FeedPool, count: number): TradeoffCardV3[] =>
		generateFeed({
			stage: 4,
			signals: EMPTY_SIGNALS,
			pool,
			seenIds: [],
			count,
		}).cards.filter((c): c is TradeoffCardV3 => c.kind === "tradeoff");

	it("counts each side from the structured axis, not from prose", () => {
		// `to-era` splits on `yearBuilt`, which no dim and no agent adjective can
		// supply. The count is never drawn (the owner cut the market line on
		// 2026-09-12) — it is what `grounding` ranks the question bank by.
		const card = firstTradeoff(ERA_POOL, EXCEPT_ERA);
		expect(card?.id).toBe("to-era");
		expect(card?.left.homes).toBe(3);
		expect(card?.right.homes).toBe(5);
	});

	it("NEVER falls back to a listing hero", () => {
		// The regression the whole photo rewrite exists for (owner, 2026-08-29):
		// a front-elevation shot cannot depict "move-in ready".
		const card = firstTradeoff(ERA_POOL);
		expect(card).toBeDefined();
		const heroes = ERA_POOL.listings.map((l) => l.heroUrl);
		for (const photo of [
			...(card?.left.photos ?? []),
			...(card?.right.photos ?? []),
		]) {
			expect(heroes).not.toContain(photo.url);
		}
	});

	it("lights a door that has a dim with the server's room photos", () => {
		const lit: FeedPool = {
			...ERA_POOL,
			dimPhotos: {
				space: [
					{ url: LIVING, caption: "Living area with large patio doors" },
					{ url: `${LIVING}?2` },
				],
			},
		};
		// `to-spread-vs-upkeep`'s left side carries dim `space`.
		const card = firstTradeoff(lit, EXCEPT_SPREAD);
		expect(card?.id).toBe("to-spread-vs-upkeep");
		expect(card?.left.photos?.map((p) => p.url)).toEqual([
			LIVING,
			`${LIVING}?2`,
		]);
		// Its right side has no dim at all — copy only, and that is fine.
		expect(card?.right.photos).toBeUndefined();
		expect(card?.right.support.length).toBeGreaterThan(0);
	});

	it("lights a PLACE dim with a community hero and no caption", () => {
		const places: FeedPool = {
			geoUnits: CITIES,
			listings: [listing("l1")],
			communities: [
				community("c-quiet", ["quiet"]),
				community("c-walk", ["walkable"]),
			],
			dimPhotos: {},
		};
		const card = firstTradeoff(places, EXCEPT_DENSITY);
		expect(card?.id).toBe("to-quiet-vs-walkable");
		expect(card?.left.photos?.map((p) => p.url)).toEqual([
			"https://img/c-quiet.jpg",
		]);
		// A tour poster carries no tagger sentence.
		expect(card?.left.photos?.[0]?.caption).toBeUndefined();
	});

	it("never lets one photograph light both doors", () => {
		const shared: FeedPool = {
			geoUnits: CITIES,
			listings: [listing("l1")],
			communities: [community("c-both", ["quiet", "walkable"])],
			dimPhotos: {},
		};
		const card = firstTradeoff(shared, EXCEPT_DENSITY);
		expect(card?.left.photos?.map((p) => p.url)).toEqual([
			"https://img/c-both.jpg",
		]);
		expect(card?.right.photos).toBeUndefined();
	});

	it("shows the same number of plates on both doors", () => {
		// Owner on device: 1 plate against 3 read as a broken card, and made the
		// fuller side look like the recommended answer.
		const lopsided: FeedPool = {
			...ERA_POOL,
			communities: [community("c-quiet", ["quiet"])],
			dimPhotos: {
				walkable: [
					{ url: "https://img/w1.jpg" },
					{ url: "https://img/w2.jpg" },
					{ url: "https://img/w3.jpg" },
				],
			},
		};
		const card = firstTradeoff(lopsided, EXCEPT_DENSITY);
		expect(card?.id).toBe("to-quiet-vs-walkable");
		// `quiet` has one community poster; `walkable` has three room photos.
		expect(card?.left.photos).toHaveLength(1);
		expect(card?.right.photos).toHaveLength(1);
	});

	it("leaves an unlit door alone rather than blanking a good one", () => {
		// An unlit field is a designed treatment, not a short stack — levelling
		// to it would throw away the only picture the card has.
		const oneSided: FeedPool = {
			...ERA_POOL,
			communities: [community("c1")],
			dimPhotos: {
				space: [{ url: "https://img/s1.jpg" }, { url: "https://img/s2.jpg" }],
			},
		};
		const card = firstTradeoff(oneSided, EXCEPT_SPREAD);
		expect(card?.id).toBe("to-spread-vs-upkeep");
		expect(card?.left.photos).toHaveLength(2);
		expect(card?.right.photos).toBeUndefined();
	});

	it("gives a PLACE dim three posters from three different communities", () => {
		// Until 2026-09-12 a place door took exactly ONE poster while a room door
		// took three, so every place-against-room question levelled to 1 and 1.
		const many: FeedPool = {
			geoUnits: CITIES,
			listings: [listing("l1")],
			communities: [
				community("c-q1", ["quiet"]),
				community("c-q2", ["quiet"]),
				community("c-q3", ["quiet"]),
				community("c-q4", ["quiet"]),
				community("c-w1", ["walkable"]),
				community("c-w2", ["walkable"]),
				community("c-w3", ["walkable"]),
			],
			dimPhotos: {},
		};
		const card = firstTradeoff(many, EXCEPT_DENSITY);
		expect(card?.id).toBe("to-quiet-vs-walkable");
		expect(card?.left.photos?.map((p) => p.url)).toEqual([
			"https://img/c-q1.jpg",
			"https://img/c-q2.jpg",
			"https://img/c-q3.jpg",
		]);
		expect(card?.right.photos).toHaveLength(3);
	});

	it("lights a door that names a ROOM but carries no dim", () => {
		// Owner, 2026-09-12: 「If no real rooms, can we show some pictures instead
		// the empty card?」 `to-office-vs-guest` has no dim on either side — it
		// names `office` and `bedroom`.
		const rooms: FeedPool = {
			geoUnits: CITIES,
			listings: [listing("l1"), listing("l2")],
			communities: [community("c1")],
			dimPhotos: {},
			roomPhotos: {
				office: [{ url: "https://img/office.jpg", listingId: "l1" }],
				bedroom: [{ url: "https://img/bed.jpg", listingId: "l2" }],
			},
		};
		const card = firstTradeoff(rooms, except("to-office-vs-guest"));
		expect(card?.id).toBe("to-office-vs-guest");
		expect(card?.left.photos?.map((p) => p.url)).toEqual([
			"https://img/office.jpg",
		]);
		expect(card?.right.photos?.map((p) => p.url)).toEqual([
			"https://img/bed.jpg",
		]);
	});

	it("draws a room only from homes that satisfy the side's match", () => {
		// "Newer build" is `yearBuilt >= 2005`. A 1978 kitchen under that label is
		// a lie the buyer would act on.
		const mixed: FeedPool = {
			...ERA_POOL,
			roomPhotos: {
				kitchen: [
					{ url: "https://img/k-old.jpg", listingId: "a-old-1978" },
					{ url: "https://img/k-new.jpg", listingId: "b-new-2012" },
				],
				living: [{ url: "https://img/lv-old.jpg", listingId: "a-old-1995" }],
			},
		};
		const card = firstTradeoff(mixed, EXCEPT_ERA);
		expect(card?.id).toBe("to-era");
		// Left is "Newer build" — the 2012 kitchen only.
		expect(card?.left.photos?.map((p) => p.url)).toEqual([
			"https://img/k-new.jpg",
		]);
		// Right is "Older character" — its own rooms are living-first.
		for (const photo of card?.right.photos ?? []) {
			expect(photo.url).not.toBe("https://img/k-new.jpg");
		}
	});

	it("leaves the door unlit when the match rules every room photo out", () => {
		// No fallback to the unfiltered room: the unfiltered photo is the WRONG
		// photo, and an unlit field is the honest answer.
		const allOld: FeedPool = {
			...ERA_POOL,
			roomPhotos: {
				kitchen: [{ url: "https://img/k-old.jpg", listingId: "a-old-1978" }],
			},
		};
		const card = firstTradeoff(allOld, EXCEPT_ERA);
		expect(card?.id).toBe("to-era");
		expect(card?.left.photos).toBeUndefined();
	});

	it("never lights a side whose choice no photograph can depict", () => {
		// "No pool to look after" names no room on purpose — no frame depicts an
		// absence — so publishing every room in the pool must not light it.
		const pooled: FeedPool = {
			geoUnits: CITIES,
			listings: [listing("l1"), listing("l2")],
			communities: [community("c1")],
			dimPhotos: {},
			roomPhotos: {
				pool: [{ url: "https://img/pool.jpg", listingId: "l1" }],
				backyard: [{ url: "https://img/yard.jpg", listingId: "l2" }],
				living: [{ url: "https://img/living.jpg", listingId: "l2" }],
			},
		};
		const card = firstTradeoff(pooled, except("to-pool"));
		expect(card?.id).toBe("to-pool");
		expect(card?.left.photos?.map((p) => p.url)).toEqual([
			"https://img/pool.jpg",
		]);
		expect(card?.right.photos).toBeUndefined();
	});

	it("never draws two frames of the same home on one door", () => {
		const sameHome: FeedPool = {
			geoUnits: CITIES,
			listings: [listing("l1")],
			communities: [community("c1")],
			dimPhotos: {},
			roomPhotos: {
				// `to-topofbudget-vs-room` names kitchen AND living on one side.
				kitchen: [{ url: "https://img/k.jpg", listingId: "l1" }],
				living: [{ url: "https://img/lv.jpg", listingId: "l1" }],
			},
		};
		const card = firstTradeoff(sameHome, except("to-topofbudget-vs-room"));
		expect(card?.id).toBe("to-topofbudget-vs-room");
		const urls = [
			...(card?.left.photos ?? []),
			...(card?.right.photos ?? []),
		].map((p) => p.url);
		expect(new Set(urls).size).toBe(urls.length);
		expect(card?.left.photos?.length ?? 0).toBeLessThanOrEqual(1);
	});

	it("asks at most one question per axis in a session", () => {
		const asked = allTradeoffs(ERA_POOL, 120);
		const axes = asked.map((c) => c.axis);
		expect(new Set(axes).size).toBe(axes.length);
	});

	it("never asks the same question twice", () => {
		const asked = allTradeoffs(ERA_POOL, 120);
		const ids = asked.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("holds the mix's one-in-nine rate over a long session", () => {
		// A trade-off fills its own slot and no other: it is not `findAlt`
		// filler and not loop material. Before that rule a 120-card session
		// came back with 32 of them.
		const { cards } = generateFeed({
			stage: 4,
			signals: EMPTY_SIGNALS,
			pool: ERA_POOL,
			seenIds: [],
			count: 120,
		});
		const n = cards.filter((c) => c.kind === "tradeoff").length;
		expect(n).toBeLessThanOrEqual(15);
		expect(n).toBeGreaterThanOrEqual(10);
	});

	it("an answer actually reorders the feed — rule 03, enforced", () => {
		/*
		 * The bank's third rule is "it must move the feed": a question whose two
		 * answers rank the same homes is decoration. Now that answers score, the
		 * rule is a test rather than a judgement call.
		 */
		const before = generateFeed({
			stage: 4,
			signals: EMPTY_SIGNALS,
			pool: ERA_POOL,
			seenIds: [],
			count: 20,
		}).cards.filter((c) => c.kind === "listing");

		const answered = applySwipe(
			EMPTY_SIGNALS,
			TRADEOFFS.find((q) => q.id === "to-era") as TradeoffCardV3,
			"left", // "Newer build"
		);
		const after = generateFeed({
			stage: 4,
			signals: answered,
			pool: ERA_POOL,
			seenIds: [],
			count: 20,
		}).cards.filter((c) => c.kind === "listing");

		const moved = before.filter((c, i) => after[i]?.id !== c.id).length;
		expect(moved).toBeGreaterThanOrEqual(2);

		/*
		 * And it moved the RIGHT way — measured as a DISTRIBUTION, not as a
		 * strict order.
		 *
		 * A `SideMatch` is a membership test rather than a gradient, so every
		 * home built after 2005 scores alike and keeps its order among the
		 * others — the assertion is about which SIDE leads, never which id.
		 *
		 * This is also the test that caught `firstUnseen`'s rotation defeating
		 * the ranking entirely: before `hasStatedPreference`, positions moved
		 * and the front of the deck did not.
		 */
		expect(after.slice(0, 3).every((c) => (c.yearBuilt ?? 0) >= 2005)).toBe(
			true,
		);
	});

	it("an answer never outranks a house the buyer liked", () => {
		// A stated preference reorders; a thumb decides. `o3` is the oldest home
		// in the pool and the answer is "newer", but it was liked.
		const answered = applySwipe(
			{ ...EMPTY_SIGNALS, likedListingIds: ["a-old-1972"] },
			TRADEOFFS.find((q) => q.id === "to-era") as TradeoffCardV3,
			"left",
		);
		const ranked = generateFeed({
			stage: 4,
			signals: answered,
			pool: ERA_POOL,
			seenIds: [],
			count: 20,
		}).cards.filter((c) => c.kind === "listing");
		// `-100` keeps a liked house OUT of the fresh deck's front, whatever the
		// answers say — it is demoted, not promoted, and stays demoted.
		expect(ranked.map((c) => c.id).indexOf("a-old-1972")).not.toBe(0);
	});

	it("records the answer as a fact, not a weight", () => {
		const card = TRADEOFFS.find((q) => q.id === "to-era") as TradeoffCardV3;
		const s = applySwipe(EMPTY_SIGNALS, card, "right");
		expect(s.answers).toEqual([
			{ axis: "year", cardId: "to-era", chose: "right" },
		]);
		// Neither side of `to-era` carries a dim — nothing to bump, and nothing
		// invented.
		expect(s.dims).toEqual({});
	});

	it("scores a home neutral when it has no data for the axis", () => {
		// A listing with no `yearBuilt` must not be buried for OUR missing data.
		const answered = applySwipe(
			EMPTY_SIGNALS,
			TRADEOFFS.find((q) => q.id === "to-era") as TradeoffCardV3,
			"left",
		);
		const medians = { sqft: 1600, price: 350_000, sqftPerBed: 500 };
		expect(answerScore(listing("blank"), answered, medians)).toBe(0);
	});

	it("asks nothing at all when the pool is bare", () => {
		// No inventory is the §1.9 terminal card, never an interview.
		expect(
			firstTradeoff({ geoUnits: CITIES, listings: [], communities: [] }),
		).toBeUndefined();
	});

	it("every question in the bank passes the shape contract", () => {
		for (const q of TRADEOFFS) {
			expect(q.prompt.length).toBeGreaterThan(0);
			expect(q.axis.length).toBeGreaterThan(0);
			for (const side of [q.left, q.right]) {
				expect(side.label.length).toBeGreaterThan(0);
				// An unlit door has nothing but its support line — it must exist.
				expect(side.support.length).toBeGreaterThan(0);
			}
			// Rule 1: the two sides must not be the same claim.
			expect(q.left.label).not.toBe(q.right.label);
		}
	});

	it("no two questions share an id", () => {
		const ids = TRADEOFFS.map((q) => q.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

// ─── Swipe-history ranking ────────────────────────────────────────────────────

describe("swipe-history ranking", () => {
	/**
	 * A pool of two communities, four homes. The community CARD ids are uuids
	 * while the listings carry the community SLUG, exactly like the wire — a
	 * fixture where the two matched by accident would pass with the slug
	 * resolution broken.
	 */
	const brookA: CommunityCardV3 = {
		...community("uuid-brook"),
		slug: "brookhaven-manor",
		name: "Brookhaven Manor",
	};
	const vinB: CommunityCardV3 = {
		...community("uuid-vin"),
		slug: "vinings-walk",
		name: "Vinings Walk",
	};
	const SWIPE_POOL: FeedPool = {
		geoUnits: CITIES,
		listings: [
			listing("a1", "brookhaven-manor"),
			listing("a2", "brookhaven-manor"),
			listing("b1", "vinings-walk"),
			listing("b2", "vinings-walk"),
		],
		communities: [brookA, vinB],
	};

	const frontListings = (signals: SignalState, pool: FeedPool = SWIPE_POOL) =>
		generateFeed({ stage: 4, signals, pool, seenIds: [], count: 12 })
			.cards.filter((c) => c.kind === "listing")
			.map((c) => c.id);

	it("liking a community moves its homes to the front of the deck", () => {
		const signals = applySwipe(EMPTY_SIGNALS, brookA, "right");
		expect(frontListings(signals).slice(0, 2).sort()).toEqual(["a1", "a2"]);
	});

	it("passing a community sinks its homes — softly, never out", () => {
		const signals = applySwipe(EMPTY_SIGNALS, brookA, "left");
		const ids = frontListings(signals);
		expect(ids.slice(0, 2).sort()).toEqual(["b1", "b2"]);
		// A reorder, not a filter: every home is still reachable. (The deck may
		// loop past the 4-home pool inside 12 cards, hence the Set.)
		expect([...new Set(ids)].sort()).toEqual(["a1", "a2", "b1", "b2"]);
	});

	it("a city right-swipe lifts that city's other homes", () => {
		const decatur = {
			...listing("d1", "vinings-walk"),
			geoUnitId: "city:decatur-ga",
		};
		const pool: FeedPool = {
			...SWIPE_POOL,
			listings: [
				listing("a1", "brookhaven-manor"),
				decatur,
				{ ...listing("d2"), geoUnitId: "city:decatur-ga" },
				{ ...listing("m1"), geoUnitId: "city:marietta-ga" },
			],
		};
		// Liking d1 credits Decatur; d1 itself is then demoted as already liked.
		const signals = applySwipe(EMPTY_SIGNALS, decatur, "right");
		const ids = frontListings(signals, pool);
		expect(ids[0]).toBe("d2");
		expect(ids.indexOf("d1")).toBeGreaterThan(ids.indexOf("m1"));
	});

	it("a runaway city tally cannot outvote a liked community", () => {
		// Ten Atlanta right-swipes clamp to GEO_CAP; the one community the buyer
		// actually said yes to still leads.
		let signals = applySwipe(EMPTY_SIGNALS, vinB, "right");
		const atlanta = { ...listing("atl"), geoUnitId: "city:atlanta-ga" };
		for (let i = 0; i < 10; i++) {
			signals = applySwipe(signals, { ...atlanta, id: `atl-${i}` }, "right");
		}
		const affinity = swipeAffinity(
			SWIPE_POOL.listings,
			SWIPE_POOL.communities,
			signals,
		);
		const inVinings = swipeScore(
			listing("x", "vinings-walk"),
			signals,
			affinity,
		);
		const inAtlanta = swipeScore(atlanta, signals, affinity);
		expect(inVinings).toBeGreaterThan(inAtlanta);
	});

	it("three liked homes form a profile that promotes similar ones", () => {
		const home = (id: string, price: number, sqft: number): ListingCardV3 => ({
			...listing(id),
			price,
			sqft,
			beds: 3,
		});
		const rows = [
			home("l1", 400_000, 2000),
			home("l2", 410_000, 1950),
			home("l3", 390_000, 2100),
		];
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			likedListingIds: ["l1", "l2", "l3"],
		};
		const affinity = swipeAffinity(rows, [], signals);
		// Inside every band: price ±8%, sqft ±10%, the median bed count.
		expect(swipeScore(home("near", 405_000, 2050), signals, affinity)).toBe(3);
		// A home outside every band scores 0 — never demoted for being unlike.
		const far: ListingCardV3 = {
			...listing("far"),
			price: 900_000,
			sqft: 4500,
			beds: 5,
		};
		expect(swipeScore(far, signals, affinity)).toBe(0);
	});

	it("two likes are not a pattern — no profile below three", () => {
		const rows = [
			{ ...listing("l1"), price: 400_000 },
			{ ...listing("l2"), price: 410_000 },
		];
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			likedListingIds: ["l1", "l2"],
		};
		expect(swipeAffinity(rows, [], signals).profile).toBeNull();
	});

	it("missing data is neutral, never a demotion", () => {
		const signals: SignalState = {
			...EMPTY_SIGNALS,
			likedListingIds: ["l1", "l2", "l3"],
		};
		const rows = [
			{ ...listing("l1"), price: 400_000 },
			{ ...listing("l2"), price: 410_000 },
			{ ...listing("l3"), price: 390_000 },
		];
		const affinity = swipeAffinity(rows, [], signals);
		// No price, no sqft, no beds, no community, no geo: exactly zero.
		expect(swipeScore(listing("blank"), signals, affinity)).toBe(0);
	});

	it("swipe signals alone switch the listing cursor to ranked order", () => {
		/*
		 * The rule-03 generalisation: before this, only an answered trade-off
		 * entered the ranked list at the top — a buyer who had swiped but never
		 * answered kept the rotation, and their ranking reordered a list nobody
		 * read from the front.
		 */
		const signals = applySwipe(EMPTY_SIGNALS, brookA, "right");
		const first = generateFeed({
			stage: 4,
			signals,
			pool: SWIPE_POOL,
			seenIds: [],
			count: 12,
			rotate: 7, // a mid-session rotation must not move the entry point
		}).cards.find((c) => c.kind === "listing");
		expect(["a1", "a2"]).toContain(first?.id);
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
