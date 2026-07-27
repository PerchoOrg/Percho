/**
 * §1.7 rhythm — the multi-page invariants.
 *
 * ## Why these tests exist
 *
 * `generate-feed.test.ts` had 36 passing tests and the engine still shipped a
 * session that degenerated to **39 consecutive area cards** on device. Every one
 * of those tests composed ONE page from a full pool, and page 0 is always clean.
 * The collapse only appears once `seenIds` has consumed the finite client-side
 * tables (stage 0 has 21 asks and 7 trade-offs) and every subsequent slot falls
 * through to the single fill that still has inventory.
 *
 * So the unit of testing here is a SESSION, not a page: compose repeatedly with an
 * accumulating `seenIds` and a rotating cursor, exactly as the feed screen does,
 * then assert on the whole emitted sequence. That is the only shape in which these
 * bugs are visible.
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
import { EMPTY_SIGNALS, type SignalState } from "./signals";

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
	highlights: [],
	attributes: {},
}));

/** Listings carry `communityId` so stage 3's "inside a liked community" preview
 * slot can actually fill — without it stage 3 has no listing source and the
 * composer is forced into a community run, which is a DATA gap, not a rhythm bug.
 *
 * Sized for a 10-page (120-card) session: a fixture that runs dry mid-test makes
 * the assertion measure the fixture rather than the engine. Real Atlanta metro has
 * 8680 communities, so 200 here is still conservative. */
const listings = Array.from({ length: 240 }, (_, i) => ({
	kind: "listing" as const,
	id: `l${i}`,
	addr: `${i} Main St`,
	city: `City ${i % 12}`,
	state: "GA",
	price: 400000 + i * 1000,
	heroUrl: "https://example.test/l.jpg",
	beds: 3,
	baths: 2,
	communityId: `cm${i % 200}`,
}));

const FULL_POOL: FeedPool = {
	...EMPTY_POOL,
	geoUnits: cities,
	communities: communities as never,
	listings: listings as never,
};

/**
 * A buyer deep in stage 3-4 has liked a lot of communities — that is what got them
 * there. 8 liked communities means only ~16 of 240 listings are eligible for
 * stage 3's "inside a liked community" preview slot, so the slot starves after one
 * page and the composer has nothing but communities left. That is a DATA
 * constraint (§1.7 scopes the preview to liked communities on purpose), not a
 * rhythm defect, and a fixture that hits it measures the fixture.
 */
const LIKED: SignalState = {
	...EMPTY_SIGNALS,
	likedCommunityIds: communities.slice(0, 60).map((c) => c.id),
};

/** Compose `pages` pages the way the screen does: accumulating seenIds, rotating. */
function session(
	stage: FunnelStage,
	pages: number,
	pool: FeedPool = FULL_POOL,
	signals: SignalState = LIKED,
): FeedCardV3[] {
	let rotate = 0;
	const seen: string[] = [];
	const out: FeedCardV3[] = [];
	for (let p = 0; p < pages; p++) {
		const r = generateFeed({
			stage,
			signals,
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

const STAGES: FunnelStage[] = [0, 1, 2, 3, 4];

// ─── the regression ──────────────────────────────────────────────────

describe("§1.7 rhythm — no stage collapses into one card kind", () => {
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

	it.each(STAGES)(
		"stage %i never runs longer than the wall over 5 pages",
		(s) => {
			expect(longestRun(session(s, 5)).length).toBeLessThanOrEqual(WALL);
		},
	);

	it.each(STAGES)("stage %i holds over a long 10-page session", (s) => {
		expect(longestRun(session(s, 10)).length).toBeLessThanOrEqual(WALL);
	});

	/**
	 * The exact pool shape that produced the 39-run: real geo units, no listings,
	 * no communities. This is also today's PRODUCTION shape — 8680 communities
	 * aggregate to city units, and only 3 of 260 listings carry a `community_id`.
	 *
	 * Scoped to stages 0-2 on purpose. Stages 3-4 are *defined* over community and
	 * listing inventory (§1.7: `community ×6`, `listing ×5`), so a pool with
	 * neither leaves them nothing but the client-side trade-off table — and §1.7's
	 * own layer-fatigue rule says "靠 trade-off 侧写补偿" is the correct response to
	 * having nothing else. Asserting a rhythm there would be asserting that the
	 * engine invent inventory it does not have.
	 */
	it("holds with a geo-only pool for the stages that can run on one", () => {
		const geoOnly: FeedPool = { ...EMPTY_POOL, geoUnits: cities };
		for (const s of [0, 1, 2] as FunnelStage[]) {
			const run = longestRun(session(s, 5, geoOnly, EMPTY_SIGNALS));
			expect(
				run.length,
				`stage ${s} ran ${run.length}x ${run.kind}`,
			).toBeLessThanOrEqual(WALL);
		}
	});

	it("stage 0 on a geo-only pool is the 39-run case specifically", () => {
		const geoOnly: FeedPool = { ...EMPTY_POOL, geoUnits: cities };
		const cards = session(0, 5, geoOnly, EMPTY_SIGNALS);
		const run = longestRun(cards);
		// Pre-fix: 39x area. Post-fix: no geo card at all, and no wall.
		expect(cards.map((c) => c.kind)).not.toContain("area");
		expect(run.length).toBeLessThanOrEqual(WALL);
	});

	it("keeps a healthy pool comfortably inside the per-stage limit", () => {
		// With inventory for every fill there is no excuse for exceeding the guard.
		for (const s of [0, 1, 2] as FunnelStage[]) {
			expect(longestRun(session(s, 5)).length).toBeLessThanOrEqual(
				MAX_RUN_LIMIT,
			);
		}
	});

	it("emits more than one kind per stage — never a single-kind deck", () => {
		for (const s of STAGES) {
			const kinds = new Set(session(s, 5).map((c) => c.kind));
			expect(kinds.size, `stage ${s}`).toBeGreaterThan(1);
		}
	});

	it("no single kind exceeds two thirds of a long session", () => {
		for (const s of STAGES) {
			const cards = session(s, 8);
			const counts = new Map<string, number>();
			for (const c of cards) {
				counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
			}
			const dominant = Math.max(...counts.values());
			expect(
				dominant / cards.length,
				`stage ${s} was ${dominant}/${cards.length} one kind`,
			).toBeLessThanOrEqual(0.67);
		}
	});
});

describe("§1.7 stage gate survives the whole session, not just page 1", () => {
	/**
	 * The other half of the 39-run bug: `loopedFallback` reached for a geo card
	 * whenever the pool had one, ignoring the stage. §1.7 stage 0 is "零地理".
	 */
	it("stage 0 emits ZERO geo cards across a long session", () => {
		const kinds = session(0, 10).map((c) => c.kind);
		expect(kinds).not.toContain("area");
	});

	it("stage 0 emits zero listings across a long session (§1.7 零房源)", () => {
		const kinds = session(0, 10).map((c) => c.kind);
		expect(kinds).not.toContain("listing");
	});

	it("stage 0 emits zero challenge cards (§1.6 — needs geo context)", () => {
		const kinds = session(0, 10).map((c) => c.kind);
		expect(kinds).not.toContain("challenge");
	});

	it("stage 0 and 1 emit zero community cards (community starts at stage 3)", () => {
		for (const s of [0, 1] as FunnelStage[]) {
			expect(session(s, 10).map((c) => c.kind)).not.toContain("community");
		}
	});

	it("every emitted kind is one the stage's own mix permits, or a milestone", () => {
		for (const s of STAGES) {
			const declaredFills = new Set<string>(STAGE_MIX[s].map((x) => x.fill));
			const permitted = new Set(
				STAGE_MIX[s]
					.map((slot) => kindForFill(slot.fill))
					.filter((k): k is FeedCardV3["kind"] => k !== null),
			);
			for (const c of session(s, 6)) {
				if (c.kind === "milestone") continue;
				// insight / challenge come from fills that map to null, so they are
				// legal only where the mix declares that fill by name.
				const ok = permitted.has(c.kind) || declaredFills.has(c.kind);
				expect(ok, `stage ${s} emitted unexpected ${c.kind}`).toBe(true);
			}
		}
	});
});

describe("§1.7 the declared ratio still holds after the guard", () => {
	it("stage 0 stays ask-dominant (ask ×7 · trade-off ×3)", () => {
		const kinds = session(0, 5).map((c) => c.kind);
		const asks = kinds.filter((k) => k === "ask").length;
		const trades = kinds.filter((k) => k === "tradeoff").length;
		expect(asks).toBeGreaterThan(trades);
	});

	it("stage 1 stays geo-dominant (area/city ×5 is the largest share)", () => {
		const kinds = session(1, 5).map((c) => c.kind);
		const areas = kinds.filter((k) => k === "area").length;
		for (const other of ["ask", "tradeoff", "listing"]) {
			expect(areas).toBeGreaterThanOrEqual(
				kinds.filter((k) => k === other).length,
			);
		}
	});

	it("stage 4 stays listing-dominant (listing ×5)", () => {
		const kinds = session(4, 5).map((c) => c.kind);
		const l = kinds.filter((k) => k === "listing").length;
		expect(l).toBeGreaterThan(kinds.filter((k) => k === "community").length);
	});

	it("stage 1-2 keep the tease at roughly 1 per 10 (§1.7), never more", () => {
		for (const s of [1, 2] as FunnelStage[]) {
			const cards = session(s, 5);
			const teases = cards.filter((c) => c.kind === "listing").length;
			// 60 cards -> at most 1 per 10, with a little slack for page boundaries.
			expect(teases).toBeLessThanOrEqual(Math.ceil(cards.length / 10) + 2);
		}
	});
});

// ─── the pure helpers ────────────────────────────────────────────────

const card = (kind: FeedCardV3["kind"], id = kind): FeedCardV3 =>
	({ kind, id }) as FeedCardV3;

describe("trailingRun", () => {
	it("counts only the tail, not total occurrences", () => {
		const cards = [card("ask"), card("area"), card("ask"), card("ask")];
		expect(trailingRun(cards, "ask")).toBe(2);
	});

	it("is 0 when the tail is a different kind", () => {
		expect(trailingRun([card("ask"), card("area")], "ask")).toBe(0);
	});

	it("is 0 on an empty deck", () => {
		expect(trailingRun([], "ask")).toBe(0);
	});
});

describe("rhythmAllows", () => {
	it("blocks a third consecutive card of a kind at limit 2", () => {
		const two = [card("area"), card("area")];
		expect(rhythmAllows(two, card("area"), 2)).toBe(false);
		expect(rhythmAllows(two, card("ask"), 2)).toBe(true);
	});

	it("permits a pair at limit 2", () => {
		expect(rhythmAllows([card("area")], card("area"), 2)).toBe(true);
	});

	it("exempts milestones — their placement is decided by insertMilestone", () => {
		const wall = [card("milestone"), card("milestone"), card("milestone")];
		expect(rhythmAllows(wall, card("milestone"), 2)).toBe(true);
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
		for (const s of STAGES) {
			const limits = runLimitsFor(STAGE_MIX[s]);
			for (const slot of STAGE_MIX[s]) {
				expect(limits.has(slot.fill)).toBe(true);
			}
		}
	});

	it("never exceeds the ceiling or drops below the floor", () => {
		for (const s of STAGES) {
			for (const limit of runLimitsFor(STAGE_MIX[s]).values()) {
				expect(limit).toBeGreaterThanOrEqual(2);
				expect(limit).toBeLessThanOrEqual(MAX_RUN_LIMIT);
			}
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

	it("returns null for the budget-limited kinds", () => {
		expect(kindForFill("insight")).toBeNull();
		expect(kindForFill("challenge")).toBeNull();
	});

	it("returns null for an unknown fill rather than guessing", () => {
		expect(kindForFill("nonsense")).toBeNull();
	});
});

describe("distanceSinceKind / byStaleness", () => {
	it("reports 1 for the immediately preceding card", () => {
		expect(distanceSinceKind([card("ask"), card("area")], "area")).toBe(1);
	});

	it("reports Infinity for a kind never emitted", () => {
		expect(distanceSinceKind([card("ask")], "listing")).toBe(
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
		const ordered = byStaleness([], [card("area"), card("ask")]);
		expect(ordered.map((c) => c.kind)).toEqual(["area", "ask"]);
	});
});
