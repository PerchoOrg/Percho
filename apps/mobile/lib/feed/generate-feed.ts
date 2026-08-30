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
	SideMatch,
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
	/**
	 * A community has no `yearBuilt` or `sqft`, so the structured matchers say
	 * nothing about it. The five questions whose sides carry a `dim` still do:
	 * choosing "A quiet street" should move quiet communities up.
	 */
	const dims = signals.dims;
	const dimScore = (c: CommunityCardV3): number => {
		let s = 0;
		for (const dim of c.dims ?? []) s += dims[dim] ?? 0;
		return Math.max(-ANSWER_CAP, Math.min(ANSWER_CAP, s));
	};
	const score = (c: CommunityCardV3): number =>
		(passed.has(c.id) ? -100 : 0) + dimScore(c);
	return [...communities].sort((a, b) => {
		const d = score(b) - score(a);
		return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}

/**
 * What one answered trade-off is worth when ordering a house.
 *
 * `+1` for the side the buyer chose, `−0.5` against the side they discarded —
 * the same ratio the `dims` bump has always used, so the deck does not grow a
 * second tuning scale. A house that matches NEITHER side scores 0: it is
 * neutral on that axis, and a listing whose `yearBuilt` is simply missing must
 * not be buried for our lack of data.
 */
const ANSWER_FOR = 1;
const ANSWER_AGAINST = 0.5;

/**
 * The most the whole ledger may move a house.
 *
 * An explicit swipe is worth `-100`; answers live inside ±8 so a stated
 * preference can reorder the deck but can never outrank what the buyer did with
 * their own thumb. Without a cap, a buyer eight questions in would see a feed
 * shaped more by an interview than by the houses they actually liked.
 */
const ANSWER_CAP = 8;

/**
 * How strongly the answers so far favour this house.
 *
 * Deliberately a REORDER and not a filter. The buyer said "more of this", not
 * "never that": the matchers are coarse (median splits), a filter can empty the
 * feed, and every house stays reachable this way. See `TradeoffAnswer` for why
 * the matchers are read here rather than frozen at vote time.
 */
export function answerScore(
	listing: ListingCardV3,
	signals: SignalState,
	medians: PoolMedians,
): number {
	let score = 0;
	for (const answer of signals.answers ?? []) {
		const card = TRADEOFFS.find((q) => q.id === answer.cardId);
		if (card === undefined) continue;
		const chosen = answer.chose === "right" ? card.right : card.left;
		const discarded = answer.chose === "right" ? card.left : card.right;
		if (
			chosen.match !== undefined &&
			matchesSide(listing, chosen.match, medians)
		) {
			score += ANSWER_FOR;
		} else if (
			discarded.match !== undefined &&
			matchesSide(listing, discarded.match, medians)
		) {
			score -= ANSWER_AGAINST;
		}
	}
	return Math.max(-ANSWER_CAP, Math.min(ANSWER_CAP, score));
}

/** How many loaded homes fall on the side just chosen — the echo's number. */
export function movedUpCount(
	listings: readonly ListingCardV3[],
	card: TradeoffCardV3,
	chose: "left" | "right",
): number {
	const side = chose === "right" ? card.right : card.left;
	if (side.match === undefined) return 0;
	const medians = poolMedians(listings);
	let n = 0;
	for (const row of listings) {
		if (matchesSide(row, side.match, medians)) n += 1;
	}
	return n;
}

function rankListings(
	listings: readonly ListingCardV3[],
	signals: SignalState,
): ListingCardV3[] {
	const liked = new Set(signals.likedListingIds);
	const medians = poolMedians(listings);
	// `-100` keeps an already-liked house out of the way whatever the answers
	// say; the answer score only orders everything else.
	const score = (l: ListingCardV3): number =>
		(liked.has(l.id) ? -100 : 0) + answerScore(l, signals, medians);
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
 * Never a listing hero (owner 2026-08-29 — a front-elevation shot cannot say
 * "move-in ready"). Two sources, in order:
 *
 *   1. `pool.dimPhotos[dim]` — up to three INTERIOR room photos the server
 *      matched to the dimension, with the tagger's sentence for each frame.
 *   2. a COMMUNITY hero, for the dims that describe a PLACE — a tour poster is
 *      a real photograph of the neighbourhood.
 *
 * Most of the v2 bank carries no `dim` at all: "One level / Two stories" is a
 * measurable property of the house, not one of the eleven lifestyle dims. Those
 * doors stay unlit and show their label and support line, which is what the
 * owner asked for — 「if no data it is fine for now」.
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

function median(values: readonly number[]): number | undefined {
	if (values.length === 0) return undefined;
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 === 1
		? (s[mid] as number)
		: ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/**
 * Fewer than this many homes and a median is noise, not a fact about the
 * market — the card prints the count alone rather than a number it would have
 * to caveat.
 */
const MEDIAN_FLOOR = 3;

interface PoolMedians {
	sqft?: number;
	price?: number;
	sqftPerBed?: number;
}

/** The thresholds an `aboveMedian` / `belowMedian` match is measured against. */
function poolMedians(listings: readonly ListingCardV3[]): PoolMedians {
	const sqft: number[] = [];
	const price: number[] = [];
	const perBed: number[] = [];
	for (const row of listings) {
		if (row.sqft !== undefined) sqft.push(row.sqft);
		if (row.price !== undefined) price.push(row.price);
		if (row.sqft !== undefined && row.beds !== undefined && row.beds > 0) {
			perBed.push(row.sqft / row.beds);
		}
	}
	const out: PoolMedians = {};
	const ms = median(sqft);
	const mp = median(price);
	const mb = median(perBed);
	if (ms !== undefined) out.sqft = ms;
	if (mp !== undefined) out.price = mp;
	if (mb !== undefined) out.sqftPerBed = mb;
	return out;
}

/** Does this listing fall on the side the match describes? */
function matchesSide(
	row: ListingCardV3,
	match: SideMatch,
	medians: PoolMedians,
): boolean {
	if (match.field === "yearBuilt") {
		if (row.yearBuilt === undefined) return false;
		return match.op === "gte"
			? row.yearBuilt >= match.value
			: row.yearBuilt <= match.value;
	}
	if (match.field === "beds") {
		if (row.beds === undefined) return false;
		return match.op === "gte"
			? row.beds >= match.value
			: row.beds <= match.value;
	}

	const field: keyof PoolMedians = match.field;
	const threshold = medians[field];
	if (threshold === undefined) return false;
	const value =
		match.field === "sqft"
			? row.sqft
			: match.field === "price"
				? row.price
				: row.sqft !== undefined && row.beds !== undefined && row.beds > 0
					? row.sqft / row.beds
					: undefined;
	if (value === undefined) return false;
	return match.op === "aboveMedian" ? value > threshold : value < threshold;
}

/**
 * How many homes are on this side, and what they cost.
 *
 * `match` first — it is a measured property of the house. `dim` second, for the
 * lifestyle questions that still key off the agent's prose. Neither means the
 * side prints no numbers, which is the honest answer while its field is still
 * missing from the mirror.
 */
function statsForSide(
	ctx: FillContext,
	side: TradeoffSideV3,
	medians: PoolMedians,
): { homes: number; medianLabel?: string } {
	const on = (row: ListingCardV3): boolean =>
		side.match !== undefined
			? matchesSide(row, side.match, medians)
			: side.dim !== undefined
				? row.dims?.includes(side.dim) === true
				: false;

	const prices: number[] = [];
	let homes = 0;
	for (const row of ctx.listingRanked) {
		if (!on(row)) continue;
		homes += 1;
		if (row.price !== undefined) prices.push(row.price);
	}
	if (prices.length < MEDIAN_FLOOR) return { homes };
	const m = median(prices);
	return m === undefined ? { homes } : { homes, medianLabel: priceLabel(m) };
}

/** Everything one door shows beyond its label. */
function lightSide(
	ctx: FillContext,
	side: TradeoffSideV3,
	taken: ReadonlySet<string>,
	medians: PoolMedians,
): TradeoffSideV3 {
	let photos: readonly DoorPhoto[] = [];
	if (side.dim !== undefined) {
		photos = (ctx.pool.dimPhotos?.[side.dim] ?? []).filter(
			(photo) => !taken.has(photo.url),
		);
		if (photos.length === 0) {
			const place = placePhotoForDim(ctx, side.dim, taken);
			photos = place === undefined ? [] : [{ url: place }];
		}
	}

	const stats = statsForSide(ctx, side, medians);
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
 * True when the pool has nothing a trade-off could stand on.
 *
 * A trade-off is the one card in the mix that is authored rather than projected
 * from a pool row, which historically made it the deck's escape hatch: with no
 * inventory the engine could fill every slot with questions. That is the
 * 39-card single-kind run `rhythm.test.ts` exists to prevent, and it is also
 * the wrong product answer — no inventory means the §1.9 terminal card, not an
 * interview.
 */
function poolIsBare(ctx: FillContext): boolean {
	return ctx.listingRanked.length === 0 && ctx.communityRanked.length === 0;
}

/**
 * Both doors show the SAME number of plates.
 *
 * Owner, on device 2026-08-29: 「sometimes the only 1 pic on one side, but 3
 * pics on the other side, is this by design?」 — it was not, it was an artifact.
 * A side backed by room photos gets up to three; a PLACE side gets exactly one
 * community poster; and a side can lose one to the other door's dedupe. Three
 * plates against one reads as a broken card, and worse, it makes the fuller
 * side look like the recommended answer.
 *
 * So the pair is levelled to the thinner side. A door with NO photograph is
 * left alone — an unlit field is a designed treatment, not a short stack, and
 * blanking a good side to match it would throw away the only picture the card
 * has.
 */
function evenPlates(
	left: TradeoffSideV3,
	right: TradeoffSideV3,
): [TradeoffSideV3, TradeoffSideV3] {
	const l = left.photos?.length ?? 0;
	const r = right.photos?.length ?? 0;
	if (l === 0 || r === 0 || l === r) return [left, right];
	const n = Math.min(l, r);
	return [
		{ ...left, photos: (left.photos ?? []).slice(0, n) },
		{ ...right, photos: (right.photos ?? []).slice(0, n) },
	];
}

/** Lights both doors. See `lightSide` and `evenPlates`. */
function withLitDoors(ctx: FillContext, card: TradeoffCardV3): TradeoffCardV3 {
	const medians = poolMedians(ctx.listingRanked);
	const lit = lightSide(ctx, card.left, new Set(), medians);
	const other = lightSide(
		ctx,
		card.right,
		new Set((lit.photos ?? []).map((photo) => photo.url)),
		medians,
	);
	const [left, right] = evenPlates(lit, other);
	return { ...card, left, right };
}

/**
 * One question per axis, per session.
 *
 * A buyer who has answered "another bedroom / bigger rooms" learns nothing from
 * "room to spread out / less to keep up" — both are the same axis — and being
 * asked twice about one thing reads as an interrogation rather than a
 * conversation. Derived from `seen` rather than tracked separately so it
 * survives a deck rebuild.
 */
function axesAsked(seen: ReadonlySet<string>): Set<string> {
	const out = new Set<string>();
	for (const card of TRADEOFFS) {
		if (seen.has(card.id)) out.add(card.axis);
	}
	return out;
}

/**
 * How much a question can say today: 2 when both doors carry real numbers, 1
 * when one does, 0 when it is copy alone.
 *
 * The bank is deliberately larger than the data (owner: 「if no data it is fine
 * for now」), so this is what keeps the deck showing its best questions first
 * without ever removing the others.
 */
function grounding(card: TradeoffCardV3): number {
	return (
		(card.left.homes !== undefined || (card.left.photos?.length ?? 0) > 0
			? 1
			: 0) +
		(card.right.homes !== undefined || (card.right.photos?.length ?? 0) > 0
			? 1
			: 0)
	);
}

function pickTradeoff(ctx: FillContext, rotate: number): TradeoffCardV3 | null {
	if (poolIsBare(ctx)) return null;

	const asked = axesAsked(ctx.seen);
	const fresh: TradeoffCardV3[] = [];
	for (let i = 0; i < TRADEOFFS.length; i++) {
		const card = TRADEOFFS[(rotate + i) % TRADEOFFS.length];
		if (card === undefined || ctx.seen.has(card.id)) continue;
		if (asked.has(card.axis)) continue;
		fresh.push(card);
	}
	// Every axis already covered — allow a repeat axis rather than go silent.
	const pool =
		fresh.length > 0
			? fresh
			: TRADEOFFS.filter((card) => !ctx.seen.has(card.id));
	if (pool.length === 0) return null;

	let best: TradeoffCardV3 | null = null;
	let bestScore = -1;
	for (const card of pool) {
		const lit = withLitDoors(ctx, card);
		const score = grounding(lit);
		if (score > bestScore) {
			best = lit;
			bestScore = score;
		}
		if (score === 2) break;
	}
	return best;
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

/**
 * Rotation is the tie-break when we know nothing; RANK takes over once the
 * buyer has told us something.
 *
 * `firstUnseen` starts at `rotate` and takes the first unseen row, so with a
 * fresh deck it returns `ranked[rotate % len]` — pure round-robin. Rank decided
 * the cycle's ORDER but not where the buyer entered it, which meant a stated
 * preference reordered a list nobody read from the top. The rule-03 test caught
 * exactly that: positions moved and the front of the deck was unchanged.
 *
 * Entering at 0 walks the ranked list in order as `seen` grows, so the homes an
 * answer promoted are the ones that actually arrive next. Rotation is kept for
 * the no-signal case, where it is what stops every buyer seeing the same first
 * five houses and what lets the loop reach every row (see `loopedFallback`).
 */
function hasStatedPreference(signals: SignalState): boolean {
	return (signals.answers?.length ?? 0) > 0;
}

function pickListing(ctx: FillContext, rotate: number): ListingCardV3 | null {
	const cursor = hasStatedPreference(ctx.signals) ? 0 : rotate;
	return firstUnseen(ctx.listingRanked, (x) => x.id, ctx.seen, cursor);
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
	/*
	 * Trade-offs are deliberately NOT offered here.
	 *
	 * This path recycles content once fresh inventory runs out, and a question
	 * is not inventory: the mix table's own trade-off slot already schedules
	 * them at one per nine, and `pickTradeoff` refuses to repeat one. Offering
	 * them here as well let the loop treat the bank as an inexhaustible supply —
	 * with the v2 bank's 32 questions a 120-card session came back with FORTY
	 * trade-offs and stopped recycling houses at all. When the bank is spent the
	 * slot degrades to a real card, which is the correct answer.
	 */

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
		/*
		 * A trade-off fills its OWN slot and no other. The mix asks one question
		 * per nine cards; letting an unfillable listing slot substitute a
		 * question turns a thin pool into an interview — with the v2 bank's 32
		 * questions a 120-card session came back with 32 of them. When a slot
		 * cannot be filled the honest answers are another real card or the loop,
		 * never an extra question.
		 */
		if (alt.fill === "tradeoff") continue;
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
