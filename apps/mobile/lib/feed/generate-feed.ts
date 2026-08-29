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
import type { DimKey } from "@percho/shared/types";
import type {
	CommunityCardV3,
	DoorPhoto,
	FeedCardV3,
	FunnelStage,
	ListingCardV3,
	TradeoffCardV3,
	TradeoffSideV3,
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
	/**
	 * Up to three interior DETAIL photos per dimension, keyed by `DimKey`
	 * (`apps/web/lib/feed/dim-photos.ts`). Optional: an older server, or a page
	 * whose listings have no tagged photos, simply sends none and the trade-off
	 * card draws unlit doors.
	 */
	dimPhotos?: Readonly<Record<string, readonly DoorPhoto[]>>;
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

/**
 * The photograph behind one trade-off door.
 *
 * ── Why this is not a hero any more (owner, 2026-08-29) ─────────────────────
 *
 * The first version borrowed the `heroUrl` of a pool row claiming the dim. On
 * device that reads as nothing at all: a listing hero is a front-elevation
 * shot, and no front elevation says "move-in ready" — two of them side by side
 * say nothing about the choice. 「it doesnt make sense to put some home tour
 * hero pic into one of the trade off」.
 *
 * So the door is lit in two ways, in this order, and never by a listing hero:
 *
 *   1. `pool.dimPhotos[dim]` — an INTERIOR detail photo the server picked by
 *      room type (a kitchen for `move_in`, a living room for `space`), with the
 *      vision tagger's own sentence describing the frame. This is the one that
 *      depicts the concept.
 *   2. a COMMUNITY hero claiming the dim — for the five dims that describe a
 *      PLACE (`schools`, `walkable`, `trails`, `hip`, `nightlife`), where no
 *      room inside a house shows the thing but a tour poster genuinely is a
 *      photograph of the neighbourhood.
 *
 * Neither available leaves the door unlit, which is the honest answer.
 * Borrowing an unrelated picture would be the engine authoring content.
 */
function placePhotoForDim(
	ctx: FillContext,
	dim: DimKey,
	taken: ReadonlySet<string>,
): string | undefined {
	for (const row of ctx.communityRanked) {
		if (row.dims?.includes(dim) !== true) continue;
		if (row.heroUrl === "" || taken.has(row.heroUrl)) continue;
		return row.heroUrl;
	}
	return undefined;
}

/** "342000" → "$342,000". Local because this module imports nothing. */
function priceLabel(value: number): string {
	return `$${Math.round(value)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/**
 * Fewer than this many homes and the median is noise, not a fact about the
 * market — the card prints the count alone rather than a number it would have
 * to caveat.
 */
const MEDIAN_FLOOR = 3;

/** What the pool says a dimension is worth: how many homes, and their median. */
function statsForDim(
	ctx: FillContext,
	dim: DimKey,
): { homes: number; medianLabel?: string } {
	const prices: number[] = [];
	let homes = 0;
	for (const row of ctx.listingRanked) {
		if (row.dims?.includes(dim) !== true) continue;
		homes += 1;
		if (row.price !== undefined) prices.push(row.price);
	}
	if (prices.length < MEDIAN_FLOOR) return { homes };
	prices.sort((a, b) => a - b);
	const mid = Math.floor(prices.length / 2);
	const median =
		prices.length % 2 === 1
			? (prices[mid] as number)
			: ((prices[mid - 1] as number) + (prices[mid] as number)) / 2;
	return { homes, medianLabel: priceLabel(median) };
}

/** Everything one door shows beyond its label. */
function lightSide(
	ctx: FillContext,
	side: TradeoffSideV3,
	/** Photos the other door already took, so no picture appears twice. */
	taken: ReadonlySet<string>,
): TradeoffSideV3 {
	const detail = (ctx.pool.dimPhotos?.[side.dim] ?? []).filter(
		(photo) => !taken.has(photo.url),
	);

	let photos: readonly DoorPhoto[] = detail;
	if (photos.length === 0) {
		// No room depicts this dimension — it is about the PLACE. One community
		// tour poster, which carries no tagger sentence.
		const place = placePhotoForDim(ctx, side.dim, taken);
		photos = place === undefined ? [] : [{ url: place }];
	}

	const stats = statsForDim(ctx, side.dim);
	return {
		...side,
		...(photos.length === 0 ? {} : { photos }),
		...(stats.homes === 0 ? {} : { homes: stats.homes }),
		...(stats.medianLabel === undefined
			? {}
			: { medianLabel: stats.medianLabel }),
	};
}

/**
 * True when the pool has nothing a trade-off could borrow from.
 *
 * A trade-off is the one card in the mix that is authored rather than projected
 * from a pool row, which historically made it the deck's escape hatch: with no
 * inventory the engine could fill every slot with questions. That is the
 * 39-card single-kind run `rhythm.test.ts` exists to prevent, and since
 * 2026-08-22 it is also the wrong product answer — no inventory means the §1.9
 * terminal card, not an interview.
 */
function poolIsBare(ctx: FillContext): boolean {
	return ctx.listingRanked.length === 0 && ctx.communityRanked.length === 0;
}

/** Lights both doors. See `lightSide`. */
function withLitDoors(ctx: FillContext, card: TradeoffCardV3): TradeoffCardV3 {
	const left = lightSide(ctx, card.left, new Set());
	const right = lightSide(
		ctx,
		card.right,
		new Set((left.photos ?? []).map((photo) => photo.url)),
	);
	return { ...card, left, right };
}

/**
 * Prefer a question both of whose doors can be lit.
 *
 * Not a filter — every question stays askable, and a pair with one dark door is
 * still a real trade-off. But the pool measured on 2026-08-29 lights
 * `move_in` and `space` and leaves `entertaining` and `hip` dark, so without
 * this the buyer's FIRST trade-off is as likely to be the empty-looking one as
 * the good one. Ordering costs nothing and shows the design at its best.
 */
function bestLit(
	ctx: FillContext,
	cards: readonly TradeoffCardV3[],
): TradeoffCardV3 | null {
	let fallback: TradeoffCardV3 | null = null;
	for (const card of cards) {
		const lit = withLitDoors(ctx, card);
		if (
			(lit.left.photos?.length ?? 0) > 0 &&
			(lit.right.photos?.length ?? 0) > 0
		) {
			return lit;
		}
		if (fallback === null) fallback = lit;
	}
	return fallback;
}

function pickTradeoff(ctx: FillContext, rotate: number): TradeoffCardV3 | null {
	if (poolIsBare(ctx)) return null;

	const scope = ctx.stage >= 3 ? "property" : "life";
	const unseen = (pool: readonly TradeoffCardV3[]): TradeoffCardV3[] => {
		const out: TradeoffCardV3[] = [];
		for (let i = 0; i < pool.length; i++) {
			const item = pool[(rotate + i) % pool.length];
			if (item !== undefined && !ctx.seen.has(item.id)) out.push(item);
		}
		return out;
	};

	const preferred = unseen(TRADEOFFS.filter((t) => t.scope === scope));
	return bestLit(ctx, preferred.length > 0 ? preferred : unseen(TRADEOFFS));
}

/**
 * The looped trade-off — same card, same doors, same guard.
 *
 * `loopedFallback` used to push `anyItem(TRADEOFFS, rotate)` straight into its
 * candidate list, which bypassed both: a looped question could arrive with two
 * unlit doors while the pool had photos for them, and an empty pool could loop
 * questions forever behind the terminal card.
 */
function loopedTradeoff(
	ctx: FillContext,
	rotate: number,
): TradeoffCardV3 | null {
	if (poolIsBare(ctx)) return null;
	const card = anyItem(TRADEOFFS, rotate);
	return card === null ? null : withLitDoors(ctx, card);
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
 *
 * ── 2026-08-23: listings loop too, and the loop walks the whole pool ─────────
 *
 * Owner: "why cant i see listing videos multiple times, but community videos i
 * can see multiple times on ios, they should be same"; then, on what the loop
 * is FOR — "it is for testing, we should see all ready ones in a loop, later we
 * will recommendations, and some of them will be filtered".
 *
 * Listings were the one kind excluded here, so past the end of the pool every
 * card was a community. With `videosOnly` the phone's whole inventory is 16
 * listings and 4 communities, so that end arrives around card 20 of a session
 * and the deck then showed the same four communities forever.
 *
 * Two things had to change, not one:
 *
 *   · `listing` joins the candidates, which is the parity the owner asked for.
 *   · the looped card now comes from the slot the MIX wanted at this rotation,
 *     not from the stalest kind. Staleness alternates the kinds 1:1, and
 *     `anyItem` indexes each kind's list by the same `rotate` — so a kind
 *     picked on every other card steps through its list two at a time and
 *     reaches only half of it. Following the table instead keeps the 5:2 ratio
 *     AND makes `rotate` advance by one within each kind often enough to reach
 *     every row: the mix is 7 long, gcd(7, 16) = gcd(7, 4) = 1, so the cycle
 *     visits all 16 listings and all 4 communities before repeating.
 *
 * Staleness still orders whatever the intended slot could not supply, which is
 * the case its own note was written for.
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

	if (permitted.has("listing")) {
		candidates.push(anyItem(ctx.listingRanked, rotate));
	}
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
		candidates.push(loopedTradeoff(ctx, rotate));
	}

	const real = candidates.filter((c): c is FeedCardV3 => c !== null);
	// The table's own choice for this rotation first — see the header. This is
	// not a fixed preference order (the thing the staleness note rules out);
	// it is the same rotation that governs every FRESH card, applied to the
	// looped tail so the tail keeps the deck's shape.
	const wantedKind = kindForFill(mix[rotate % mix.length]?.fill ?? "");
	const ordered = [
		...real.filter((c) => c.kind === wantedKind),
		// Least-recently-seen kind for the rest: once the finite tables are
		// consumed, looping is the only remaining source, so a static priority
		// would hand every leftover slot to whichever kind sits highest.
		...byStaleness(
			emitted,
			real.filter((c) => c.kind !== wantedKind),
		),
	];
	// Prefer a loop that also respects the run limit; fall back to the stalest
	// real card rather than emitting nothing (a repeat is bad, a blank is worse).
	const legal = ordered.find((c) => rhythmAllows(emitted, c, limits));
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
