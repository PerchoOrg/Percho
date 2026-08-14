/**
 * §1.7 rhythm guard — the constraint that keeps a degrading pool from
 * collapsing the deck into one card kind.
 *
 * ## The bug this exists for
 *
 * `generateFeed` fills a slot from the stage mix, and when a slot comes up dry it
 * tries the other fills, then `loopedFallback`. Each of those steps is
 * deterministic and stateless with respect to what was just emitted — so once the
 * finite client-side content runs out (stage 0 has 21 asks and 7 trade-offs), the
 * SAME fallback wins every remaining slot. A real multi-page session produced
 * **39 consecutive area cards** (owner on device: "连着10几个tradeoff 然后连着10几个city").
 *
 * A single-page probe never sees it: page 0 of stage 0 is a clean
 * `ask ask trade ask ask trade …`. The degeneration only appears once `seenIds`
 * has eaten the tables, which is why this shipped.
 *
 * ## The rule
 *
 * §1.7's mix table is a RATIO, and a ratio implies spacing: `trade-off ×3` per 10
 * means roughly every third card, never three in a row. So a candidate is
 * rejected when it would exceed `MAX_RUN` of its own kind, and the composer tries
 * the next candidate. If everything is rejected the guard yields rather than
 * emitting nothing — a repeat is bad, a blank card is worse.
 *
 * This is deliberately about the KIND the buyer perceives, not the slot the
 * engine intended: two area cards for different cities still read as "another
 * city card".
 */
import type { FeedCardV3 } from "./card-types";

/**
 * The card kind a mix slot's fill materialises as, or null when the fill has no
 * single perceived kind. One definition, because the composer needs it both
 * BEFORE the pick (to choose a slot) and AFTER (to check the emitted card), and
 * two copies would let those two disagree.
 *
 * `geo` covers area/city/zip — all three render as one card kind and the buyer
 * reads them as "another place card". `listing` covers tease and full alike.
 */
export function kindForFill(fill: string): FeedCardV3["kind"] | null {
	switch (fill) {
		case "geo":
			return "area";
		case "tradeoff":
			return "tradeoff";
		case "community":
			return "community";
		case "listing":
			return "listing";
		default:
			// No budget-limited fills remain post-collapse.
			return null;
	}
}

/**
 * Floor and ceiling for the per-stage run limit. The floor is 2 (a pair always
 * reads as intentional); the ceiling stops a mix that is nearly all one fill from
 * licensing an unbounded run.
 */
export const MIN_RUN_LIMIT = 2;
export const MAX_RUN_LIMIT = 3;

/**
 * The hard stop. A run this long is never acceptable regardless of inventory: the
 * composer ends the page and the screen shows §1.9's terminal card instead.
 *
 * One above `MAX_RUN_LIMIT`, deliberately. The per-stage limit is a spacing
 * PREFERENCE and is outranked by two harder rules — never recycle while fresh
 * content exists (§1.9: looping is the last resort) and never emit nothing — so a
 * single over-run is correct at the moment a finite table empties. A wall is not.
 */
export const RUN_WALL = MAX_RUN_LIMIT + 1;

/**
 * Back-compat alias for the floor. Prefer `runLimitFor(mix)`.
 */
export const MAX_RUN = MIN_RUN_LIMIT;

/**
 * The run limit implied by a stage's own mix, **per kind**.
 *
 * A single global constant is wrong because §1.7's stages are shaped differently.
 * Stage 0 is `ask ×7 · trade-off ×3`, so asks MUST be able to sit 3 deep — with a
 * flat 2 the composer fights its own ratio every page. Stage 3 is `community ×6 ·
 * listing ×2 · trade-off ×1 · insight ×1`: communities need 3, but a listing
 * appearing 3 times in a row would violate the declared ratio outright.
 *
 * So the limit is per-kind and derived from that kind's OWN share: a fill holding
 * `n` of `len` slots may sit in stretches of about `n / (len - n)`, clamped to
 * [2, 3]. `ask ×7` of 10 → 7/3 → 3. `listing ×2` of 10 → 2/8 → 2. That keeps
 * "连着10几个" impossible everywhere while leaving every declared ratio achievable.
 *
 * Keyed by FILL (the mix's vocabulary), which the engine maps to a card kind.
 */
export function runLimitsFor(
	mix: readonly { fill: string }[],
): ReadonlyMap<string, number> {
	const counts = new Map<string, number>();
	for (const s of mix) counts.set(s.fill, (counts.get(s.fill) ?? 0) + 1);

	const limits = new Map<string, number>();
	for (const [fill, n] of counts) {
		const others = mix.length - n;
		limits.set(
			fill,
			others <= 0
				? MAX_RUN_LIMIT
				: Math.min(
						MAX_RUN_LIMIT,
						Math.max(MIN_RUN_LIMIT, Math.round(n / others)),
					),
		);
	}
	return limits;
}

/**
 * Kinds exempt from the run limit because they are structurally rare and their
 * placement is decided elsewhere. Post-collapse every kind commits and flows
 * through the composer, so nothing is exempt; kept as an empty set so the
 * rhythm rule reads as "no exemptions" rather than as an accident.
 */
const EXEMPT: ReadonlySet<FeedCardV3["kind"]> = new Set([]);

/**
 * How many cards at the tail of `cards` share the given kind.
 * Exported for the composer's own diagnostics and for the tests.
 */
export function trailingRun(
	cards: readonly FeedCardV3[],
	kind: FeedCardV3["kind"],
): number {
	let n = 0;
	for (let i = cards.length - 1; i >= 0; i--) {
		if (cards[i]?.kind !== kind) break;
		n++;
	}
	return n;
}

/**
 * Whether `candidate` may be appended to `cards` without breaking the rhythm.
 * `false` means "try another candidate", never "emit nothing".
 */
export function rhythmAllows(
	cards: readonly FeedCardV3[],
	candidate: FeedCardV3,
	limits: ReadonlyMap<string, number> | number = MIN_RUN_LIMIT,
): boolean {
	if (EXEMPT.has(candidate.kind)) return true;
	const limit =
		typeof limits === "number"
			? limits
			: (limitForKind(limits, candidate.kind) ?? MIN_RUN_LIMIT);
	return trailingRun(cards, candidate.kind) < limit;
}

/**
 * The limit for a card KIND, looked up through the fill that produces it.
 * Returns null when this stage's mix has no slot for that kind at all — which
 * means the card only exists here as a loop, so the floor applies.
 */
export function limitForKind(
	limits: ReadonlyMap<string, number>,
	kind: FeedCardV3["kind"],
): number | null {
	for (const [fill, limit] of limits) {
		if (kindForFill(fill) === kind) return limit;
	}
	return null;
}

/**
 * How many cards back the given kind last appeared; `Infinity` when it never has.
 * 1 means "the card immediately before this one".
 */
export function distanceSinceKind(
	cards: readonly FeedCardV3[],
	kind: FeedCardV3["kind"],
): number {
	for (let i = cards.length - 1; i >= 0; i--) {
		if (cards[i]?.kind === kind) return cards.length - i;
	}
	return Number.POSITIVE_INFINITY;
}

/**
 * Order candidates least-recently-seen first.
 *
 * This is what the LOOPING path needs, and a fixed preference order is not.
 * Once the finite tables are consumed, looping is the only source left, and a
 * static priority list hands every slot to whichever kind sits highest — which is
 * how a session ended up with runs of 4 area cards even after the run guard was
 * in place. Sorting by staleness spreads the repeats instead, so the recycled
 * stretch keeps a rhythm the buyer reads as intentional.
 *
 * Stable for equal distances, so the caller's own preference still breaks ties.
 */
export function byStaleness(
	cards: readonly FeedCardV3[],
	candidates: readonly FeedCardV3[],
): FeedCardV3[] {
	return candidates
		.map((c, i) => ({ c, i, d: distanceSinceKind(cards, c.kind) }))
		.sort((a, b) => (b.d === a.d ? a.i - b.i : b.d - a.d))
		.map((x) => x.c);
}
