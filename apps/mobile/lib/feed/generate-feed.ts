import { VISIBLE_WINDOW } from "../gesture/stack-layer";
/**
 * `generateFeed` — the §1.7 composition engine.
 *
 * Pure and deterministic: same (stage, signals, pool, seen) in, same cards out.
 * That is what makes the whole funnel testable on Linux without a simulator,
 * and it is why this file takes a `rotate` cursor instead of calling Math.random.
 *
 * The engine's job is *ordering and rationing*, not authoring. Every card it
 * emits is either static content (`content.ts`) or a projection of a real pool
 * row. When the pool cannot fill a slot the slot degrades to another real card
 * — it never emits a placeholder.
 *
 * ── The listing hard gate (§0.2) ────────────────────────────────────────────
 * The single most important invariant here. Stage 0 shows no listing at all;
 * stages 1–2 show at most one *tease* per 10 cards; stage 3 shows previews only
 * inside already-liked communities; only stage 4 is unlocked. `assertGate` below
 * enforces this on the way out, after composition, so a future change to a mix
 * table cannot quietly leak listings into the top of the funnel.
 *
 * Pure: no react/react-native/expo/zustand imports.
 */
import type {
	AskCardV3,
	CommunityCardV3,
	FeedCardV3,
	FunnelStage,
	ListingCardV3,
	MilestoneCardV3,
	TradeoffCardV3,
} from "./card-types";
import {
	PREFERENCE_ASKS,
	TRADEOFFS,
	challengeFromListing,
	geoAskFor,
	nextBudgetAsk,
} from "./content";
import type { GeoLevel, GeoUnit } from "./geo-unit";
import { finestAvailableLevel, unitsAtLevel } from "./geo-unit";
import { earnInsight } from "./insight";
import type { Slot } from "./ratios";
import { STAGE_2_GEO_FALLBACK, STAGE_MIX, WINDOW } from "./ratios";
import type { SignalState } from "./signals";
import { dimScore, isLayerSuppressed } from "./signals";

/** Server-supplied inventory (PLAN §4). Ask/tradeoff/challenge are client-side. */
export interface FeedPool {
	geoUnits: readonly GeoUnit[];
	listings: readonly ListingCardV3[];
	communities: readonly CommunityCardV3[];
	/** Real listing prices, keyed by listing id — the challenge card's source. */
	listingPrices?: Readonly<Record<string, number>>;
}

export const EMPTY_POOL: FeedPool = {
	geoUnits: [],
	listings: [],
	communities: [],
};

export interface GenerateFeedInput {
	stage: FunnelStage;
	signals: SignalState;
	pool: FeedPool;
	/** Card ids already emitted this session; never re-emitted while fresh exists. */
	seenIds: readonly string[];
	count: number;
	/**
	 * Rotation cursor, so consecutive pages continue the mix table rather than
	 * restarting it. Pass the previous result's `nextRotate`.
	 */
	rotate?: number;
	/** §1.5 milestones already shown, so one never repeats (PLAN B3). */
	milestonesShown?: readonly string[];
}

export interface GenerateFeedResult {
	cards: readonly FeedCardV3[];
	nextRotate: number;
	/**
	 * True when every slot had to reuse already-seen content, i.e. the pool is
	 * exhausted and the caller should show the §1.9 terminal card. Looped cards
	 * carry `looped` ids in `loopedIds` so the UI can put a `seen` micro-badge
	 * on them (§1.9).
	 */
	exhausted: boolean;
	loopedIds: readonly string[];
}

/** §1.7: teases start at stage 1. Stage 0 is a hard zero. */
function teaseAllowed(stage: FunnelStage): boolean {
	return stage === 1 || stage === 2;
}

/**
 * Post-composition enforcement of §0.2. Throws rather than filtering, because a
 * violation means a mix table is wrong and silently dropping the card would hide
 * the bug until it reached a device.
 */
function assertGate(
	stage: FunnelStage,
	cards: readonly FeedCardV3[],
	likedCommunityIds: readonly string[],
): void {
	const listings = cards.filter(
		(c): c is ListingCardV3 => c.kind === "listing",
	);
	if (stage === 0) {
		if (listings.length > 0) {
			throw new Error("§0.2 violation: stage 0 emitted a listing card");
		}
		return;
	}
	if (stage === 1 || stage === 2) {
		const nonTease = listings.filter((l) => l.tease !== true);
		if (nonTease.length > 0) {
			throw new Error(
				`§0.2 violation: stage ${stage} emitted a non-tease listing`,
			);
		}
		const perWindow = Math.ceil(cards.length / WINDOW);
		if (listings.length > perWindow) {
			throw new Error(
				`§0.2 violation: stage ${stage} emitted ${listings.length} teases, cap ${perWindow}`,
			);
		}
		return;
	}
	if (stage === 3) {
		const liked = new Set(likedCommunityIds);
		for (const l of listings) {
			if (l.preview !== true) {
				throw new Error(
					"§0.2 violation: stage 3 emitted a non-preview listing",
				);
			}
			if (l.communityId === undefined || !liked.has(l.communityId)) {
				throw new Error(
					"§0.2 violation: stage 3 preview outside a liked community",
				);
			}
		}
	}
}

/** Picks the first unseen item, else null. Deterministic given the input order. */
function firstUnseen<T>(
	items: readonly T[],
	idOf: (item: T) => string,
	seen: ReadonlySet<string>,
	rotate: number,
): T | null {
	if (items.length === 0) return null;
	for (let i = 0; i < items.length; i++) {
		const item = items[(rotate + i) % items.length];
		if (item !== undefined && !seen.has(idOf(item))) return item;
	}
	return null;
}

/** Same rotation, but ignores `seen` — the §1.9 loop-with-badge path. */
function anyItem<T>(items: readonly T[], rotate: number): T | null {
	if (items.length === 0) return null;
	return items[rotate % items.length] ?? null;
}

/**
 * Soft geo ordering (§1.7 "软排序, 非过滤"): a left-swiped unit sinks but is
 * never removed, and dim affinity lifts units whose sample communities match.
 * Stable sort on id keeps it deterministic.
 */
function rankGeoUnits(
	units: readonly GeoUnit[],
	signals: SignalState,
): GeoUnit[] {
	const score = (u: GeoUnit): number => {
		const sig = signals.geo.find((g) => g.unitId === u.id);
		return sig === undefined ? 0 : sig.right - sig.left;
	};
	return [...units].sort((a, b) => {
		const d = score(b) - score(a);
		return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}

function rankCommunities(
	communities: readonly CommunityCardV3[],
	signals: SignalState,
): CommunityCardV3[] {
	const passed = new Set(signals.passedCommunityIds);
	const score = (c: CommunityCardV3): number => {
		const affinity = (c.dims ?? []).reduce(
			(sum, d) => sum + dimScore(signals, d),
			0,
		);
		return affinity - (passed.has(c.id) ? 100 : 0);
	};
	return [...communities].sort((a, b) => {
		const d = score(b) - score(a);
		return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}

function rankListings(
	listings: readonly ListingCardV3[],
	signals: SignalState,
): ListingCardV3[] {
	const score = (l: ListingCardV3): number =>
		(l.dims ?? []).reduce((sum, d) => sum + dimScore(signals, d), 0);
	return [...listings].sort((a, b) => {
		const d = score(b) - score(a);
		return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}

/**
 * The stage's slot table, with the §3 stage-2 degradation applied when the pool
 * has no zip inventory. Slot count is preserved so the window stays 10 long.
 */
export function mixFor(stage: FunnelStage, level: GeoLevel | null): Slot[] {
	const base = STAGE_MIX[stage];
	if (stage !== 2 || level === "zip") return [...base];

	const fallback = [...STAGE_2_GEO_FALLBACK];
	const out: Slot[] = [];
	for (const slot of base) {
		if (slot.fill === "geo") {
			const sub = fallback.shift();
			out.push(sub ?? slot);
		} else {
			out.push(slot);
		}
	}
	return out;
}

interface FillContext {
	stage: FunnelStage;
	signals: SignalState;
	pool: FeedPool;
	seen: Set<string>;
	level: GeoLevel | null;
	geoRanked: readonly GeoUnit[];
	communityRanked: readonly CommunityCardV3[];
	listingRanked: readonly ListingCardV3[];
	teaseBudget: { left: number };
	insightUsed: { done: boolean };
	loopedIds: string[];
}

function pickAsk(
	ctx: FillContext,
	pool: Slot,
	rotate: number,
): FeedCardV3 | null {
	const kind = pool.fill === "ask" ? pool.pool : "any";
	// A geo ask is only honest once a real unit exists to ask about.
	if (kind === "geo" || kind === "any") {
		const unit = firstUnseen(
			ctx.geoRanked.filter((u) => !isLayerSuppressed(ctx.signals, u.level)),
			(u) => `ask-geo-${u.id}`,
			ctx.seen,
			rotate,
		);
		if (unit !== null) return geoAskFor(unit);
		if (kind === "geo") return null;
	}

	// Budget is captured by binary splits before any other preference ask, so
	// the band exists as early as possible for the 0→1 gate. Still subject to
	// suppression: a skipped `life` layer silences the budget sequence too.
	const budget = nextBudgetAsk(ctx.signals.budget);
	if (
		budget !== null &&
		!ctx.seen.has(budget.id) &&
		!isLayerSuppressed(ctx.signals, budget.layer)
	) {
		return budget;
	}

	const eligible = PREFERENCE_ASKS.filter(
		(a: AskCardV3) => !isLayerSuppressed(ctx.signals, a.layer),
	);
	return firstUnseen(eligible, (a) => a.id, ctx.seen, rotate);
}

function pickTradeoff(ctx: FillContext, rotate: number): TradeoffCardV3 | null {
	const scope = ctx.stage >= 3 ? "property" : "life";
	const preferred = TRADEOFFS.filter((t) => t.scope === scope);
	return (
		firstUnseen(preferred, (t) => t.id, ctx.seen, rotate) ??
		firstUnseen(TRADEOFFS, (t) => t.id, ctx.seen, rotate)
	);
}

function pickGeo(ctx: FillContext, rotate: number): FeedCardV3 | null {
	if (ctx.level === null) return null;
	const units = unitsAtLevel(ctx.geoRanked, ctx.level).filter(
		(u) => !isLayerSuppressed(ctx.signals, u.level),
	);
	const unit = firstUnseen(units, (u) => `area-${u.id}`, ctx.seen, rotate);
	if (unit === null) return null;
	return { kind: "area", id: `area-${unit.id}`, unit };
}

function pickCommunity(
	ctx: FillContext,
	rotate: number,
): CommunityCardV3 | null {
	return firstUnseen(ctx.communityRanked, (c) => c.id, ctx.seen, rotate);
}

/** Stage-gated. Returns null when the gate or the pool says no. */
function pickListing(
	ctx: FillContext,
	variant: "tease" | "preview" | "primary",
	rotate: number,
): ListingCardV3 | null {
	if (variant === "tease") {
		if (!teaseAllowed(ctx.stage) || ctx.teaseBudget.left <= 0) return null;
		const l = firstUnseen(ctx.listingRanked, (x) => x.id, ctx.seen, rotate);
		if (l === null) return null;
		ctx.teaseBudget.left -= 1;
		// Badge suppressed: the score isn't trustworthy this early (§1.7).
		const { matchScore: _drop, ...rest } = l;
		return { ...rest, tease: true };
	}
	if (variant === "preview") {
		const liked = new Set(ctx.signals.likedCommunityIds);
		const inLiked = ctx.listingRanked.filter(
			(l) => l.communityId !== undefined && liked.has(l.communityId),
		);
		const l = firstUnseen(inLiked, (x) => x.id, ctx.seen, rotate);
		if (l === null) return null;
		const { matchScore: _drop, ...rest } = l;
		return { ...rest, preview: true };
	}
	return firstUnseen(ctx.listingRanked, (x) => x.id, ctx.seen, rotate);
}

function pickChallenge(ctx: FillContext, rotate: number): FeedCardV3 | null {
	// §1.6: challenge needs geographic context to land, so stage 0–1 never
	// reaches here via the mix tables. Guard anyway — a mix edit shouldn't leak.
	if (ctx.stage < 2) return null;
	const prices = ctx.pool.listingPrices ?? {};
	const candidates = ctx.listingRanked.filter(
		(l) => prices[l.id] !== undefined && !ctx.seen.has(`ch-price-${l.id}`),
	);
	for (let i = 0; i < candidates.length; i++) {
		const l = candidates[(rotate + i) % candidates.length];
		if (l === undefined) continue;
		const card = challengeFromListing(l, prices[l.id]);
		if (card !== null) return card;
	}
	return null;
}

function fillSlot(
	ctx: FillContext,
	slot: Slot,
	rotate: number,
): FeedCardV3 | null {
	switch (slot.fill) {
		case "ask":
			return pickAsk(ctx, slot, rotate);
		case "tradeoff":
			return pickTradeoff(ctx, rotate);
		case "geo":
			return pickGeo(ctx, rotate);
		case "community":
			return pickCommunity(ctx, rotate);
		case "listing":
			return pickListing(ctx, slot.variant, rotate);
		case "challenge":
			return pickChallenge(ctx, rotate);
		case "insight": {
			if (!ctx.insightUsed.done) {
				const card = earnInsight(ctx.signals);
				if (card !== null && !ctx.seen.has(card.id)) {
					ctx.insightUsed.done = true;
					return card;
				}
			}
			return fillSlot(ctx, slot.fallback, rotate);
		}
	}
}

/**
 * Last resort when no slot in the table can be filled with unseen content: loop
 * a real card the user has already seen (§1.9 "循环 + seen 角标"), preferring the
 * stage's own material. Returns null only when the pool is genuinely empty, in
 * which case the caller shows the terminal card.
 */
function loopedFallback(ctx: FillContext, rotate: number): FeedCardV3 | null {
	if (ctx.stage >= 3) {
		const c = anyItem(ctx.communityRanked, rotate);
		if (c !== null && !isLayerSuppressed(ctx.signals, "community")) return c;
	}
	// Suppression outranks looping: a fatigued or skipped layer must stay silent
	// even when looping is the only way to fill the slot (§1.7). Looping a card
	// from the layer the user just stopped responding to is the exact behaviour
	// fatigue exists to prevent.
	if (ctx.level !== null && !isLayerSuppressed(ctx.signals, ctx.level)) {
		const u = anyItem(unitsAtLevel(ctx.geoRanked, ctx.level), rotate);
		if (u !== null) return { kind: "area", id: `area-${u.id}`, unit: u };
	}
	const t = anyItem(TRADEOFFS, rotate);
	if (t !== null) return t;
	const eligible = PREFERENCE_ASKS.filter(
		(a) => !isLayerSuppressed(ctx.signals, a.layer),
	);
	return anyItem(eligible, rotate);
}

export function generateFeed(input: GenerateFeedInput): GenerateFeedResult {
	const { stage, signals, pool, count } = input;
	const rotate0 = input.rotate ?? 0;
	const seen = new Set(input.seenIds);
	const level = finestAvailableLevel(pool.geoUnits);
	const mix = mixFor(stage, level);

	const ctx: FillContext = {
		stage,
		signals,
		pool,
		seen,
		level,
		geoRanked: rankGeoUnits(pool.geoUnits, signals),
		communityRanked: rankCommunities(pool.communities, signals),
		listingRanked: rankListings(pool.listings, signals),
		// One tease per 10 cards, exactly — computed from the request size so a
		// 12-card first page gets 2, not 1.2 rounded somewhere unpredictable.
		teaseBudget: { left: teaseAllowed(stage) ? Math.ceil(count / WINDOW) : 0 },
		insightUsed: { done: false },
		loopedIds: [],
	};

	const cards: FeedCardV3[] = [];
	let exhausted = false;

	for (let i = 0; i < count; i++) {
		const rotate = rotate0 + i;
		const slot = mix[(rotate0 + i) % mix.length];
		if (slot === undefined) continue;

		let card = fillSlot(ctx, slot, rotate);

		// The table's own slot came up dry — try the other fills before looping,
		// so a thin pool degrades to a different real card rather than a repeat.
		if (card === null) {
			for (const alt of mix) {
				if (alt === slot) continue;
				card = fillSlot(ctx, alt, rotate);
				if (card !== null) break;
			}
		}

		if (card === null) {
			card = loopedFallback(ctx, rotate);
			if (card === null) break;
			exhausted = true;
			ctx.loopedIds.push(card.id);
		}

		cards.push(card);
		seen.add(card.id);
	}

	assertGate(stage, cards, signals.likedCommunityIds);

	return {
		cards,
		nextRotate: rotate0 + count,
		exhausted,
		loopedIds: ctx.loopedIds,
	};
}

/**
 * §1.5 / PLAN B15: the milestone is the very next card after the swipe that
 * earned it, not an append at the end of the deck. Returns the deck unchanged
 * when this milestone was already shown (B3).
 *
 * "Next" means the next card the buyer has NOT ALREADY SEEN, which is not
 * `activeIndex + 1`. `SwipeStack` renders a 3-card window, so by the time a swipe
 * commits, the buyer has been looking at the card behind the top one for the
 * whole gesture — it was peeking out from under the card they were dragging.
 * Splicing at `activeIndex + 1` displaces exactly that card, so on device the
 * card they had already seen was replaced by the milestone a moment after they
 * lifted their finger (owner: "都已经peek到下一张卡片什么样子了 结果一秒之后又自动切换成别的卡片了").
 *
 * So the insert goes after the visible window: the buyer finishes the cards they
 * can already see, then the ceremony. Still "the next card" in any sense the
 * spec cares about — it is 2 swipes away, not 12 — and nothing on screen moves.
 */
export function insertMilestone(
	cards: readonly FeedCardV3[],
	activeIndex: number,
	milestone: MilestoneCardV3,
	milestonesShown: readonly string[],
): readonly FeedCardV3[] {
	if (milestonesShown.includes(milestone.id)) return cards;
	const at = Math.min(Math.max(activeIndex + VISIBLE_WINDOW, 0), cards.length);
	return [...cards.slice(0, at), milestone, ...cards.slice(at)];
}
