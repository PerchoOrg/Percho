/**
 * `generateFeed` — the discovery composition engine.
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
 * 2026-08-15: the funnel collapsed to a single unlocked stage 4 mix of the 4
 * surviving kinds (area / listing / community / trade-off). The ask,
 * challenge, insight and milestone machinery is gone.
 *
 * Pure: no react/react-native/expo/zustand imports.
 */
import type {
	CommunityCardV3,
	FeedCardV3,
	FunnelStage,
	ListingCardV3,
	TradeoffCardV3,
} from "./card-types";
import { TRADEOFFS } from "./content";
import type { GeoLevel, GeoUnit } from "./geo-unit";
import { finestAvailableLevel, unitsAtLevel } from "./geo-unit";
import type { Slot } from "./ratios";
import { STAGE_MIX } from "./ratios";
import {
	byStaleness,
	kindForFill,
	rhythmAllows,
	runLimitsFor,
	trailingRun,
} from "./rhythm";
import type { SignalState } from "./signals";
import { isLayerSuppressed } from "./signals";

/** Server-supplied inventory. */
export interface FeedPool {
	geoUnits: readonly GeoUnit[];
	listings: readonly ListingCardV3[];
	communities: readonly CommunityCardV3[];
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
}

export interface GenerateFeedResult {
	cards: readonly FeedCardV3[];
	nextRotate: number;
	/**
	 * True when every slot had to reuse already-seen content, i.e. the pool is
	 * exhausted and the caller should show the §1.9 terminal card.
	 */
	exhausted: boolean;
	/**
	 * Which ids were recycled rather than served fresh.
	 */
	loopedIds: readonly string[];
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

/** Same rotation, but ignores `seen` — the loop-with-badge path. */
function anyItem<T>(items: readonly T[], rotate: number): T | null {
	if (items.length === 0) return null;
	return items[rotate % items.length] ?? null;
}

/**
 * Soft geo ordering: a left-swiped unit sinks but is never removed, and dim
 * affinity lifts units whose sample communities match. Stable sort on id keeps
 * it deterministic.
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
	const score = (c: CommunityCardV3): number => (passed.has(c.id) ? -100 : 0);
	return [...communities].sort((a, b) => {
		const d = score(b) - score(a);
		return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}

function rankListings(
	listings: readonly ListingCardV3[],
	signals: SignalState,
): ListingCardV3[] {
	const liked = new Set(signals.likedListingIds);
	const score = (l: ListingCardV3): number => (liked.has(l.id) ? -100 : 0);
	return [...listings].sort((a, b) => {
		const d = score(b) - score(a);
		return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}

/**
 * The stage's slot table. Stage is pinned at 4 post-collapse, so this is
 * effectively the single mix.
 */
export function mixFor(stage: FunnelStage, _level: GeoLevel | null): Slot[] {
	return [...STAGE_MIX[stage]];
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
	loopedIds: string[];
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

function pickListing(ctx: FillContext, rotate: number): ListingCardV3 | null {
	return firstUnseen(ctx.listingRanked, (x) => x.id, ctx.seen, rotate);
}

function fillSlot(
	ctx: FillContext,
	slot: Slot,
	rotate: number,
): FeedCardV3 | null {
	switch (slot.fill) {
		case "tradeoff":
			return pickTradeoff(ctx, rotate);
		case "geo":
			return pickGeo(ctx, rotate);
		case "community":
			return pickCommunity(ctx, rotate);
		case "listing":
			return pickListing(ctx, rotate);
	}
}

/**
 * Last resort when no slot in the table can be filled with unseen content: loop
 * a real card the user has already seen, preferring the stage's own material.
 * Returns null only when the pool is genuinely empty, in which case the caller
 * shows the terminal card.
 */
function loopedFallback(
	ctx: FillContext,
	rotate: number,
	mix: readonly Slot[],
	emitted: readonly FeedCardV3[],
	limits: ReadonlyMap<string, number>,
): FeedCardV3 | null {
	const permitted = new Set(mix.map((s) => s.fill));

	/** Candidates in stage-preference order, each already stage-legal. */
	const candidates: (FeedCardV3 | null)[] = [];

	if (permitted.has("community")) {
		const c = anyItem(ctx.communityRanked, rotate);
		if (c !== null && !isLayerSuppressed(ctx.signals, "community")) {
			candidates.push(c);
		}
	}
	if (
		permitted.has("geo") &&
		ctx.level !== null &&
		!isLayerSuppressed(ctx.signals, ctx.level)
	) {
		const u = anyItem(unitsAtLevel(ctx.geoRanked, ctx.level), rotate);
		if (u !== null) {
			candidates.push({ kind: "area", id: `area-${u.id}`, unit: u });
		}
	}
	if (permitted.has("tradeoff")) {
		candidates.push(anyItem(TRADEOFFS, rotate));
	}

	// Least-recently-seen kind first. A fixed preference order is wrong HERE
	// specifically: once the finite tables are consumed, looping is the only
	// remaining source, so a static priority hands every slot to whichever kind
	// sits highest.
	const real = byStaleness(
		emitted,
		candidates.filter((c): c is FeedCardV3 => c !== null),
	);
	// Prefer a loop that also respects the run limit; fall back to the stalest
	// real card rather than emitting nothing (a repeat is bad, a blank is worse).
	const legal = real.find((c) => rhythmAllows(emitted, c, limits));
	if (legal !== undefined) return legal;
	return null;
}

/**
 * Whether a card is genuinely new to this composition.
 */
function isFresh(ctx: FillContext, card: FeedCardV3 | null): boolean {
	return card !== null && !ctx.seen.has(card.id);
}

/**
 * Search the mix for a fill OTHER than the intended slot that yields a card.
 */
function findAlt(
	ctx: FillContext,
	mix: readonly Slot[],
	intended: Slot,
	rotate: number,
	emitted: readonly FeedCardV3[],
	spaced: boolean,
	limits: ReadonlyMap<string, number>,
): FeedCardV3 | null {
	for (const alt of mix) {
		if (alt === intended) continue;
		const card = fillSlot(ctx, alt, rotate);
		if (card === null || ctx.seen.has(card.id)) continue;
		if (spaced && !rhythmAllows(emitted, card, limits)) continue;
		return card;
	}
	return null;
}

/**
 * Pick the slot to fill, honouring the table's rotation but skipping ahead when
 * the intended slot would break the rhythm.
 */
function pickSlot(
	mix: readonly Slot[],
	rotate: number,
	emitted: readonly FeedCardV3[],
	limits: ReadonlyMap<string, number>,
): { slot: Slot; rotate: number } | null {
	const intended = mix[rotate % mix.length];
	if (intended === undefined) return null;
	if (kindAllowedForFill(emitted, intended, limits)) {
		return { slot: intended, rotate };
	}

	// Walk forward through the rotation so the table's own ordering still governs
	// the substitute — never a fixed preference that would bias the ratio.
	for (let step = 1; step < mix.length; step++) {
		const at = rotate + step;
		const alt = mix[at % mix.length];
		if (alt === undefined) continue;
		if (kindAllowedForFill(emitted, alt, limits))
			return { slot: alt, rotate: at };
	}
	return { slot: intended, rotate };
}

/**
 * Whether a slot's fill could produce a rhythm-legal card, judged on the FILL so
 * this can run before the expensive pick.
 */
function kindAllowedForFill(
	emitted: readonly FeedCardV3[],
	slot: Slot,
	limits: ReadonlyMap<string, number>,
): boolean {
	const kind = kindForFill(slot.fill);
	if (kind === null) return true;
	return trailingRun(emitted, kind) < (limits.get(slot.fill) ?? 2);
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
		loopedIds: [],
	};

	const cards: FeedCardV3[] = [];
	let exhausted = false;
	const runLimit = runLimitsFor(mix);

	for (let i = 0; i < count; i++) {
		const wanted = rotate0 + i;
		const picked = pickSlot(mix, wanted, cards, runLimit);
		if (picked === null) continue;
		const { slot, rotate } = picked;

		let card = fillSlot(ctx, slot, rotate);
		if (!isFresh(ctx, card)) card = null;

		if (card !== null && !rhythmAllows(cards, card, runLimit)) {
			const spaced = findAlt(ctx, mix, slot, rotate, cards, true, runLimit);
			if (spaced !== null) {
				card = spaced;
			} else {
				exhausted = true;
				break;
			}
		}

		if (card === null) {
			card =
				findAlt(ctx, mix, slot, rotate, cards, true, runLimit) ??
				findAlt(ctx, mix, slot, rotate, cards, false, runLimit);
		}

		if (card === null) {
			card = loopedFallback(ctx, rotate, mix, cards, runLimit);
			if (card === null) break;
			if (!rhythmAllows(cards, card, runLimit)) {
				exhausted = true;
				break;
			}
			exhausted = true;
			ctx.loopedIds.push(card.id);
		}

		cards.push(card);
		seen.add(card.id);
	}

	return {
		cards,
		nextRotate: rotate0 + count,
		exhausted,
		loopedIds: ctx.loopedIds,
	};
}
