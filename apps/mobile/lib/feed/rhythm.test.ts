/**
 * §1.7 rhythm — the multi-page invariants for the single unlocked stage 4.
 *
 * ## Why these tests exist
 *
 * `generate-feed.test.ts` had 36 passing tests and the engine still shipped a
 * session that degenerated to **39 consecutive area cards** on device. Every one
 * of those tests composed ONE page from a full pool, and page 0 is always clean.
 *
 * So the unit of testing here is a SESSION, not a page: compose repeatedly with an
 * accumulating `seenIds` and a rotating cursor, exactly as the feed screen does,
 * then assert on the whole emitted sequence. That is the only shape in which these
 * bugs are visible.
 *
 * 2026-08-15: the funnel collapsed to a single stage 4 mix (listing-dominant).
 * All stage-gate assertions are gone; the rhythm rules themselves survive.
 */
import { describe, expect, it } from "vitest";
import type { FeedCardV3, FunnelStage } from "./card-types";
import { EMPTY_POOL, type FeedPool, generateFeed } from "./generate-feed";
import type { GeoUnit } from "./geo-unit";
import { STAGE_MIX } from "./ratios";
import {
	MAX_RUN_LIMIT,
	byStaleness,
	distanceSinceKind,
	kindForFill,
	rhythmAllows,
	runLimitsFor,
	trailingRun,
} from "./rhythm";
import { EMPTY_SIGNALS } from "./signals";

// ─── fixtures ────────────────────────────────────────────────────────

const cities: GeoUnit[] = Array.from({ length: 12 }, (_, i) => ({
	id: `city:c${i}`,
	level: "city",
	name: `City ${i}`,
	state: "GA",
	centroid: { lat: 33 + i * 0.1, lng: -84 - i * 0.1 },
	communityCount: 40 - i,
	sampleCommunityNames: ["a", "b"],
	stats: {},
}));

const communities = Array.from({ length: 200 }, (_, i) => ({
	kind: "community" as const,
	id: `cm${i}`,
	name: `CM ${i}`,
	city: `City ${i % 12}`,
	state: "GA",
	heroUrl: "https://example.test/h.jpg",
}));

const listings = Array.from({ length: 240 }, (_, i) => ({
	kind: "listing" as const,
	id: `l${i}`,
	slug: `l${i}`,
	address: `${i} Main St`,
	priceLabel: `$${400000 + i * 1000}`,
	bedBathSqft: "3 bd · 2 ba",
	heroUrl: "https://example.test/l.jpg",
	geoUnitId: `city:c${i % 12}`,
}));

const FULL_POOL: FeedPool = {
	...EMPTY_POOL,
	geoUnits: cities,
	communities: communities as never,
	listings: listings as never,
};

/** Compose `pages` pages the way the screen does: accumulating seenIds, rotating. */
function session(
	stage: FunnelStage,
	pages: number,
	pool: FeedPool = FULL_POOL,
): FeedCardV3[] {
	let rotate = 0;
	const seen: string[] = [];
	const out: FeedCardV3[] = [];
	for (let p = 0; p < pages; p++) {
		const r = generateFeed({
			stage,
			signals: EMPTY_SIGNALS,
			pool,
			seenIds: seen.slice(),
			count: 12,
			rotate,
		});
		rotate = r.nextRotate;
		for (const c of r.cards) {
			seen.push(c.id);
			out.push(c);
		}
	}
	return out;
}

function longestRun(cards: readonly FeedCardV3[]): {
	length: number;
	kind: string;
} {
	let run = 1;
	let best = { length: cards.length === 0 ? 0 : 1, kind: cards[0]?.kind ?? "" };
	for (let i = 1; i < cards.length; i++) {
		if (cards[i]?.kind === cards[i - 1]?.kind) {
			run++;
			if (run > best.length) {
				best = { length: run, kind: cards[i]?.kind ?? "" };
			}
		} else run = 1;
	}
	return best;
}

describe("§1.7 rhythm — the single stage 4 mix never collapses into one kind", () => {
	/**
	 * THE regression: pre-fix, stage 0 produced a run of **39** over 5 pages and
	 * the deck was effectively one card kind.
	 *
	 * The bound is 4, not `MAX_RUN_LIMIT`. The guard is a spacing PREFERENCE and it
	 * is deliberately outranked by two harder rules: never recycle a card while
	 * fresh content exists (§1.9 — looping is the last resort), and never emit
	 * nothing. So at the moment a finite table runs dry, one over-long run is the
	 * correct trade. What must never happen again is a WALL.
	 */
	const WALL = 4;

	it("never runs longer than the wall over 5 pages", () => {
		expect(longestRun(session(4, 5)).length).toBeLessThanOrEqual(WALL);
	});

	it("holds over a long 10-page session", () => {
		expect(longestRun(session(4, 10)).length).toBeLessThanOrEqual(WALL);
	});

	/**
	 * The exact pool shape that produced the 39-run: real geo units, no listings,
	 * no communities. Post-collapse the stage-4 mix is listing-dominant, so with
	 * no listings the engine must fall back to the other fills without walling.
	 */
	it("holds with a geo-only pool — no listings, no communities", () => {
		const geoOnly: FeedPool = { ...EMPTY_POOL, geoUnits: cities };
		const run = longestRun(session(4, 5, geoOnly));
		expect(run.length).toBeLessThanOrEqual(WALL);
	});

	it("keeps a healthy pool comfortably inside the per-stage limit", () => {
		expect(longestRun(session(4, 5)).length).toBeLessThanOrEqual(MAX_RUN_LIMIT);
	});

	it("emits more than one kind — never a single-kind deck", () => {
		const kinds = new Set(session(4, 5).map((c) => c.kind));
		expect(kinds.size).toBeGreaterThan(1);
	});

	it("no single kind exceeds two thirds of a long session", () => {
		const cards = session(4, 8);
		const counts = new Map<string, number>();
		for (const c of cards) {
			counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
		}
		const dominant = Math.max(...counts.values());
		expect(dominant / cards.length).toBeLessThanOrEqual(0.67);
	});
});

describe("§1.7 the declared ratio holds after the guard", () => {
	it("stage 4 stays listing-dominant (listing ×5)", () => {
		const kinds = session(4, 5).map((c) => c.kind);
		const l = kinds.filter((k) => k === "listing").length;
		expect(l).toBeGreaterThan(kinds.filter((k) => k === "community").length);
		expect(l).toBeGreaterThan(kinds.filter((k) => k === "area").length);
		expect(l).toBeGreaterThan(kinds.filter((k) => k === "tradeoff").length);
	});

	it("every emitted kind is one the mix permits", () => {
		const permitted = new Set(
			STAGE_MIX[4]
				.map((slot) => kindForFill(slot.fill))
				.filter((k): k is FeedCardV3["kind"] => k !== null),
		);
		for (const c of session(4, 6)) {
			expect(permitted.has(c.kind), `emitted unexpected ${c.kind}`).toBe(true);
		}
	});
});

// ─── the pure helpers ────────────────────────────────────────────────

const card = (kind: FeedCardV3["kind"], id = kind): FeedCardV3 =>
	({ kind, id }) as FeedCardV3;

describe("trailingRun", () => {
	it("counts only the tail, not total occurrences", () => {
		const cards = [
			card("area"),
			card("area"),
			card("tradeoff"),
			card("area"),
			card("area"),
		];
		expect(trailingRun(cards, "area")).toBe(2);
	});

	it("is 0 when the tail is a different kind", () => {
		expect(trailingRun([card("area"), card("tradeoff")], "area")).toBe(0);
	});

	it("is 0 on an empty deck", () => {
		expect(trailingRun([], "area")).toBe(0);
	});
});

describe("rhythmAllows", () => {
	it("blocks a third consecutive card of a kind at limit 2", () => {
		const two = [card("area"), card("area")];
		expect(rhythmAllows(two, card("area"), 2)).toBe(false);
		expect(rhythmAllows(two, card("listing"), 2)).toBe(true);
	});

	it("permits a pair at limit 2", () => {
		expect(rhythmAllows([card("area")], card("area"), 2)).toBe(true);
	});

	it("accepts a per-fill limit map as well as a flat number", () => {
		const limits = new Map([["geo", 3]]);
		const two = [card("area"), card("area")];
		expect(rhythmAllows(two, card("area"), limits)).toBe(true);
		expect(rhythmAllows([...two, card("area")], card("area"), limits)).toBe(
			false,
		);
	});
});

describe("runLimitsFor", () => {
	it("returns a limit for every fill the mix declares", () => {
		const limits = runLimitsFor(STAGE_MIX[4]);
		for (const slot of STAGE_MIX[4]) {
			expect(limits.has(slot.fill)).toBe(true);
		}
	});

	it("never exceeds the ceiling or drops below the floor", () => {
		for (const limit of runLimitsFor(STAGE_MIX[4]).values()) {
			expect(limit).toBeGreaterThanOrEqual(2);
			expect(limit).toBeLessThanOrEqual(MAX_RUN_LIMIT);
		}
	});

	it("handles an empty mix without throwing", () => {
		expect(runLimitsFor([]).size).toBe(0);
	});
});

describe("kindForFill", () => {
	it("maps every geo granularity to the one perceived kind", () => {
		expect(kindForFill("geo")).toBe("area");
	});

	it("returns null for an unknown fill rather than guessing", () => {
		expect(kindForFill("nonsense")).toBeNull();
	});
});

describe("distanceSinceKind / byStaleness", () => {
	it("reports 1 for the immediately preceding card", () => {
		expect(distanceSinceKind([card("listing"), card("area")], "area")).toBe(1);
	});

	it("reports Infinity for a kind never emitted", () => {
		expect(distanceSinceKind([card("area")], "listing")).toBe(
			Number.POSITIVE_INFINITY,
		);
	});

	/**
	 * The invariant behind the residual 4-runs: when looping is the only source
	 * left, a FIXED preference order hands every slot to the same kind. Staleness
	 * ordering is what spreads them.
	 */
	it("orders the least-recently-seen kind first", () => {
		const emitted = [card("tradeoff"), card("area")];
		const ordered = byStaleness(emitted, [card("area"), card("tradeoff")]);
		expect(ordered[0]?.kind).toBe("tradeoff");
	});

	it("puts a never-seen kind ahead of any seen one", () => {
		const ordered = byStaleness(
			[card("area")],
			[card("area"), card("listing")],
		);
		expect(ordered[0]?.kind).toBe("listing");
	});

	it("is stable for equal staleness, so caller preference breaks ties", () => {
		const ordered = byStaleness([], [card("area"), card("listing")]);
		expect(ordered.map((c) => c.kind)).toEqual(["area", "listing"]);
	});
});
