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
import { geoSignalFor, isLayerSuppressed } from "./signals";

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
	/**
	 * The same detail photos keyed by ROOM TYPE (`pickRoomPhotos`), for the
	 * questions that name a room rather than one of the eleven dims. Up to six
	 * per room, because a side with a `match` filters them down here.
	 */
	roomPhotos?: Readonly<Record<string, readonly DoorPhoto[]>>;
	/**
	 * `/api/mobile/similar` — "buyers who liked yours also liked", 0..1 per
	 * listing id (`useCfScores`). The one cross-user signal in the ranking.
	 * Optional: offline, cold-start, or a buyer with no likes simply ranks
	 * without it.
	 */
	cfScores?: Readonly<Record<string, number>>;
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
 * How many slots of `fill` the mix schedules before `rotate` — the per-kind
 * ordinal of a slot position. `loopedFallback` indexes each kind's list by
 * this rather than by the shared `rotate`: the community slots sit 5 apart in
 * the 9-slot table, so with 5 communities in the pool `rotate % 5` handed both
 * slots of a cycle the SAME row (owner 2026-09-08: the deck repeated one
 * community back-to-back and Windward surfaced ~37 cards deep). The ordinal
 * advances by exactly one per slot of the kind, so each list is a strict
 * round-robin whatever its length — no coprimality condition on the table.
 */
function slotOrdinal(
	mix: readonly Slot[],
	rotate: number,
	fill: Slot["fill"],
): number {
	if (mix.length === 0) return 0;
	const perCycle = mix.filter((s) => s.fill === fill).length;
	let partial = 0;
	for (let i = 0; i < rotate % mix.length; i++) {
		if (mix[i]?.fill === fill) partial += 1;
	}
	return Math.floor(rotate / mix.length) * perCycle + partial;
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
		(passed.has(c.id) ? -100 : 0) +
		dimScore(c) +
		geoAffinity(signals, c.geoUnitId) +
		scopeAffinity(signals, c.geoUnitId);
	return stableRank(communities, score);
}

/**
 * Sort by score, ties keeping the POOL's order — `Array.prototype.sort` is
 * stable, so no explicit tie-break is needed.
 *
 * This replaces the old `a.id < b.id` tie-break, which was quietly the wrong
 * arbiter: on equal scores it reshuffled the list into uuid order, throwing
 * away both the server's newest-first ordering and `preferScope`'s partition
 * (the phase140 scope sheet reordered a pool that the very next sort un-ordered
 * whenever ranking ran). Input order IS deterministic — same pool, same result
 * — which is all the id comparison was there to guarantee.
 */
function stableRank<T>(items: readonly T[], score: (item: T) => number): T[] {
	return [...items].sort((a, b) => score(b) - score(a));
}

/**
 * The explicit scope pick, as a score — the §1.3 "soft ordering signal".
 *
 * Worth more than every inferred signal combined (community ±4/−2, geo ±3,
 * dims ±8, profile ≤4 — max 19) because it is the one thing the buyer SAID
 * rather than something we observed; and less than the ±100 swipe demotions,
 * because a scope narrows a search and a thumb decides a house. Without this
 * term the scope only lived in `preferScope`'s pool reorder, which any ranked
 * sort promptly discarded.
 */
const SCOPE_BOOST = 20;

function scopeAffinity(
	signals: SignalState,
	unitId: string | undefined,
): number {
	if (signals.scope === undefined || unitId === undefined) return 0;
	return unitId === signals.scope.unitId ? SCOPE_BOOST : 0;
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

/**
 * What the swipe ledger is worth when ordering a house. Three place signals
 * and one house-shape signal, each on the scale its specificity earns:
 *
 *   · a swiped COMMUNITY is the most specific place statement a thumb can
 *     make, so it moves the most: `+4` for a home inside a liked community,
 *     `−2` inside a passed one — the same 2:1 for/against ratio every other
 *     weight here uses.
 *   · the CITY tally (`right − left` across every swipe that credited the
 *     unit) is the coarsest, so it is clamped tightest. Without a cap a
 *     buyer's tenth Atlanta right-swipe would drown every other signal —
 *     tallies grow without bound, preferences do not.
 *   · the LIKED-HOME PROFILE: once three homes are liked (the same floor
 *     `lib/listing/fit.ts` uses before it claims a pattern), a home earns
 *     `+1` apiece for landing inside the liked-median price band (±8%),
 *     sqft band (±10%), on the liked-median bed count, or on the liked
 *     homes' plurality visual style — the bands are `fit.ts`'s, so the deck
 *     and the FitCard tell one story.
 *
 * All of it is a REORDER, never a filter, for the same reason `answerScore`
 * is: a left swipe said "less of this", not "never again", and a hard filter
 * under a swipe rhythm empties the feed.
 */
const COMMUNITY_LIKED = 4;
const COMMUNITY_PASSED = 2;
const GEO_CAP = 3;
const PROFILE_MIN_LIKES = 3;
const PROFILE_PRICE_BAND = 0.08;
const PROFILE_SQFT_BAND = 0.1;

/** The city tally's contribution, shared by listing and community ranking. */
function geoAffinity(signals: SignalState, unitId: string | undefined): number {
	if (unitId === undefined) return 0;
	const g = geoSignalFor(signals, unitId);
	if (g === undefined) return 0;
	return Math.max(-GEO_CAP, Math.min(GEO_CAP, g.right - g.left));
}

/** The medians of the homes the buyer right-swiped, when there are enough. */
export interface LikedHomeProfile {
	price?: number;
	sqft?: number;
	beds?: number;
	/**
	 * The PLURALITY visual style among the liked homes (`styleTag`, the vision
	 * tagger's five-word vocabulary) — present only when at least two liked
	 * homes share it, because one tagged home is an anecdote, not a taste.
	 */
	styleTag?: string;
}

/**
 * Everything `swipeScore` needs that is derived from the POOL rather than
 * from the listing under scoring — built once per rank, not once per compare.
 *
 * `likedCommunityIds` records the community CARD's id (the row uuid) while a
 * listing carries its community's SLUG (see `ListingCardV3.communityId`), so
 * the liked/passed sets are resolved to slugs through the pool's communities.
 * A liked community that later drops out of the pool simply stops boosting —
 * soft by construction, like every other signal here.
 */
export interface SwipeAffinity {
	likedCommunitySlugs: ReadonlySet<string>;
	passedCommunitySlugs: ReadonlySet<string>;
	profile: LikedHomeProfile | null;
	/** See `FeedPool.cfScores`. Absent when the server had nothing to say. */
	cf?: Readonly<Record<string, number>>;
}

/**
 * What one co-like point is worth. The server's scores live in 0..1, so the
 * whole term stays inside ±2 — a taste hint from OTHER buyers ranks below
 * every statement this buyer made themselves (community ±4, scope +20).
 */
const CF_WEIGHT = 2;

export function swipeAffinity(
	listings: readonly ListingCardV3[],
	communities: readonly CommunityCardV3[],
	signals: SignalState,
	cfScores?: Readonly<Record<string, number>>,
): SwipeAffinity {
	const likedIds = new Set(signals.likedCommunityIds);
	const passedIds = new Set(signals.passedCommunityIds);
	const likedCommunitySlugs = new Set<string>();
	const passedCommunitySlugs = new Set<string>();
	for (const c of communities) {
		if (likedIds.has(c.id)) likedCommunitySlugs.add(c.slug);
		if (passedIds.has(c.id)) passedCommunitySlugs.add(c.slug);
	}

	const likedListings = new Set(signals.likedListingIds);
	const rows = listings.filter((l) => likedListings.has(l.id));
	let profile: LikedHomeProfile | null = null;
	if (rows.length >= PROFILE_MIN_LIKES) {
		profile = {};
		const price = median(
			rows.flatMap((l) => (l.price === undefined ? [] : [l.price])),
		);
		const sqft = median(
			rows.flatMap((l) => (l.sqft === undefined ? [] : [l.sqft])),
		);
		const beds = median(
			rows.flatMap((l) => (l.beds === undefined ? [] : [l.beds])),
		);
		if (price !== undefined) profile.price = price;
		if (sqft !== undefined) profile.sqft = sqft;
		if (beds !== undefined) profile.beds = beds;
		const style = pluralityStyle(rows);
		if (style !== undefined) profile.styleTag = style;
	}

	return {
		likedCommunitySlugs,
		passedCommunitySlugs,
		profile,
		...(cfScores === undefined ? {} : { cf: cfScores }),
	};
}

/**
 * The style the liked homes lean toward: most common `styleTag`, ties broken
 * by nothing — a tie means no lean, and claiming one would be invention.
 * Requires two homes agreeing; see `LikedHomeProfile.styleTag`.
 */
function pluralityStyle(rows: readonly ListingCardV3[]): string | undefined {
	const counts = new Map<string, number>();
	for (const row of rows) {
		if (row.styleTag === undefined) continue;
		counts.set(row.styleTag, (counts.get(row.styleTag) ?? 0) + 1);
	}
	let best: string | undefined;
	let bestN = 1; // floor of 2: beats 1, so a lone tagged home never leads
	let tied = false;
	for (const [style, n] of counts) {
		if (n > bestN) {
			best = style;
			bestN = n;
			tied = false;
		} else if (n === bestN && best !== undefined) {
			tied = true;
		}
	}
	return tied ? undefined : best;
}

/** Inside the profile band? Missing data on either side is neutral, never a demotion. */
function inBand(
	value: number | undefined,
	center: number | undefined,
	band: number,
): boolean {
	if (value === undefined || center === undefined || center === 0) return false;
	return Math.abs(value - center) / center <= band;
}

/**
 * How strongly the swipes so far favour this house. See the weight table
 * above `COMMUNITY_LIKED` for what each term is worth and why.
 */
export function swipeScore(
	listing: ListingCardV3,
	signals: SignalState,
	affinity: SwipeAffinity,
): number {
	let score = 0;

	if (listing.communityId !== undefined) {
		if (affinity.likedCommunitySlugs.has(listing.communityId))
			score += COMMUNITY_LIKED;
		if (affinity.passedCommunitySlugs.has(listing.communityId))
			score -= COMMUNITY_PASSED;
	}

	score += geoAffinity(signals, listing.geoUnitId);

	// The lifestyle dims the trade-off swipes accumulated, on the same clamp
	// `rankCommunities` has always used for them.
	let dims = 0;
	for (const dim of listing.dims ?? []) dims += signals.dims[dim] ?? 0;
	score += Math.max(-ANSWER_CAP, Math.min(ANSWER_CAP, dims));

	const p = affinity.profile;
	if (p !== null) {
		if (inBand(listing.price, p.price, PROFILE_PRICE_BAND)) score += 1;
		if (inBand(listing.sqft, p.sqft, PROFILE_SQFT_BAND)) score += 1;
		if (
			listing.beds !== undefined &&
			p.beds !== undefined &&
			listing.beds === p.beds
		)
			score += 1;
		if (
			listing.styleTag !== undefined &&
			p.styleTag !== undefined &&
			listing.styleTag === p.styleTag
		)
			score += 1;
	}

	score += CF_WEIGHT * (affinity.cf?.[listing.id] ?? 0);

	return score;
}

function rankListings(pool: FeedPool, signals: SignalState): ListingCardV3[] {
	const listings = pool.listings;
	const liked = new Set(signals.likedListingIds);
	const medians = poolMedians(listings);
	const affinity = swipeAffinity(
		listings,
		pool.communities,
		signals,
		pool.cfScores,
	);
	// `-100` keeps an already-liked house out of the way whatever the answers
	// say; the answer and swipe scores only order everything else.
	const score = (l: ListingCardV3): number =>
		(liked.has(l.id) ? -100 : 0) +
		answerScore(l, signals, medians) +
		swipeScore(l, signals, affinity) +
		scopeAffinity(signals, l.geoUnitId);
	return stableRank(listings, score);
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
	/** The rotation this call STARTED at — the looped cursors' cross-page base. */
	rotate0: number;
}

/** How many plates a door shows at most. The server's `DIM_PICKS`, client-side. */
const DOOR_PLATES = 3;

/**
 * The photographs behind one trade-off door.
 *
 * Never a listing hero (owner 2026-08-29 — a front-elevation shot cannot say
 * "move-in ready"). Three sources, in order:
 *
 *   1. `pool.dimPhotos[dim]` — up to three INTERIOR room photos the server
 *      matched to the dimension, with the tagger's sentence for each frame.
 *   2. COMMUNITY heroes, for the dims that describe a PLACE — a tour poster is
 *      a real photograph of the neighbourhood.
 *   3. `pool.roomPhotos[room]` — for a side that names a room instead of a dim.
 *      See `side.rooms` in `card-types.ts`.
 *
 * ── Three posters, not one (2026-09-12) ─────────────────────────────────────
 *
 * A place door used to take exactly ONE community poster while a room door took
 * three, so every question pairing a place dim against a room dim levelled to
 * one plate a side. Three posters from three different neighbourhoods make the
 * same argument three kitchens do: the door is about WALKABLE PLACES, not about
 * that one neighbourhood. The live pool carries 6 walkable / 8 trails / 27
 * quiet communities with a poster, so three is reachable for every place dim
 * the bank asks about.
 */
function placePhotosForDim(
	ctx: FillContext,
	dim: DimKey,
	taken: ReadonlySet<string>,
): DoorPhoto[] {
	const out: DoorPhoto[] = [];
	for (const row of ctx.communityRanked) {
		if (out.length === DOOR_PLATES) break;
		if (row.dims?.includes(dim) !== true) continue;
		if (row.heroUrl === "" || taken.has(row.heroUrl)) continue;
		out.push({ url: row.heroUrl });
	}
	return out;
}

function median(values: readonly number[]): number | undefined {
	if (values.length === 0) return undefined;
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 === 1
		? (s[mid] as number)
		: ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

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

/** Is this listing on this side of the question? */
function onSide(
	row: ListingCardV3,
	side: TradeoffSideV3,
	medians: PoolMedians,
): boolean {
	// `match` first — it is a measured property of the house. `dim` second, for
	// the lifestyle questions that still key off the agent's prose.
	return side.match !== undefined
		? matchesSide(row, side.match, medians)
		: side.dim !== undefined
			? row.dims?.includes(side.dim) === true
			: false;
}

/**
 * How many homes in the pool fall on this side.
 *
 * NOT rendered — the card printed "18 homes · median $342,000" under each door
 * until the owner cut it on 2026-09-12 (「no need to show that, just asking
 * preference」). It survives as the input to `grounding`, which prefers
 * questions this pool can actually act on.
 */
function homesOnSide(
	ctx: FillContext,
	side: TradeoffSideV3,
	medians: PoolMedians,
): number {
	let homes = 0;
	for (const row of ctx.listingRanked) {
		if (onSide(row, side, medians)) homes += 1;
	}
	return homes;
}

/**
 * The photos for a side that names ROOMS rather than a dim.
 *
 * Two filters, both of them about honesty rather than looks:
 *
 *   · the side's own `match`, when it has one. "Newer build" is `yearBuilt >=
 *     2005`, so it may only draw rooms from homes that satisfy it — a 1974
 *     kitchen under that label is a lie the buyer would act on. A match that
 *     leaves nothing standing leaves the door UNLIT: there is no fallback to
 *     unfiltered rooms, because the unfiltered photo is the wrong photo.
 *   · one frame per home, across the whole door. Three views of one house is
 *     the anchoring `pickDimPhotos` was written to remove.
 */
function roomPhotosForSide(
	ctx: FillContext,
	side: TradeoffSideV3,
	taken: ReadonlySet<string>,
	medians: PoolMedians,
): DoorPhoto[] {
	const rooms = side.rooms ?? [];
	if (rooms.length === 0) return [];

	const byId = new Map(ctx.listingRanked.map((row) => [row.id, row]));
	const qualifies = (photo: DoorPhoto): boolean => {
		if (side.match === undefined) return true;
		const row =
			photo.listingId === undefined ? undefined : byId.get(photo.listingId);
		return row !== undefined && matchesSide(row, side.match, medians);
	};

	const out: DoorPhoto[] = [];
	const seenListings = new Set<string>();
	// Rooms are ordered best-first, so a door exhausts its most depictive room
	// before borrowing from the next one.
	for (const room of rooms) {
		for (const photo of ctx.pool.roomPhotos?.[room] ?? []) {
			if (out.length === DOOR_PLATES) return out;
			if (taken.has(photo.url)) continue;
			if (photo.listingId !== undefined && seenListings.has(photo.listingId))
				continue;
			if (!qualifies(photo)) continue;
			if (photo.listingId !== undefined) seenListings.add(photo.listingId);
			out.push(photo);
		}
	}
	return out;
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
		if (photos.length === 0) photos = placePhotosForDim(ctx, side.dim, taken);
	}
	// A side with no dim, or a dim this pool could light neither way, falls to
	// the rooms it names. Both are real photographs of the thing the label says.
	if (photos.length === 0)
		photos = roomPhotosForSide(ctx, side, taken, medians);

	const homes = homesOnSide(ctx, side, medians);
	return {
		...side,
		...(photos.length === 0 ? {} : { photos: photos.slice(0, DOOR_PLATES) }),
		...(homes === 0 ? {} : { homes }),
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
 * Every source aims at three now, but a door can still come up short: a room
 * only two homes in the pool photographed (`office`, `garage`), a `match` that
 * only one home satisfies, or a frame lost to the other door's dedupe. Three
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
	const cursor = hasPreferenceSignal(ctx.signals) ? 0 : rotate;
	return firstUnseen(ctx.communityRanked, (c) => c.id, ctx.seen, cursor);
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
 *
 * "Told us something" was originally answered trade-offs only — the one input
 * `rankListings` scored at the time. Now that the swipe ledger scores too, any
 * signal `applySwipe` records switches the cursor: a buyer one right-swipe in
 * has a ranking worth reading from the top, and leaving them on rotation was
 * the rule-03 bug for swipes instead of answers.
 */
function hasPreferenceSignal(signals: SignalState): boolean {
	return (
		(signals.answers?.length ?? 0) > 0 ||
		signals.geo.length > 0 ||
		signals.likedCommunityIds.length > 0 ||
		signals.passedCommunityIds.length > 0 ||
		signals.likedListingIds.length > 0 ||
		Object.keys(signals.dims).length > 0 ||
		// An explicit scope pick is a stated preference too — the ranked list
		// leads with the scoped city (`scopeAffinity`), so read it from the top.
		signals.scope !== undefined
	);
}

function pickListing(ctx: FillContext, rotate: number): ListingCardV3 | null {
	const cursor = hasPreferenceSignal(ctx.signals) ? 0 : rotate;
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
 *     not from the stalest kind, so the tail keeps the table's 5:2 ratio.
 *
 * Staleness still orders whatever the intended slot could not supply, which is
 * the case its own note was written for.
 *
 * ── 2026-09-08: each kind walks its own list, not the shared rotate ──────────
 *
 * Indexing every kind's list by the same `rotate` aliased when the pool grew to
 * 5 communities: the table's community slots are 5 apart, so `rotate % 5` gave
 * both slots of a cycle the same row — the owner saw one community twice in a
 * row and Windward not at all until ~card 37. Each kind's cursor is now the
 * slot ORDINAL (how many slots of that kind the table scheduled before this
 * rotation, based at the call's `rotate0`) plus how many cards of that kind
 * this composition has already emitted — a strict round-robin over each list,
 * whatever its length, that still threads across pages via `rotate0`.
 */
function loopedFallback(
	ctx: FillContext,
	rotate: number,
	mix: readonly Slot[],
	emitted: readonly FeedCardV3[],
	limits: ReadonlyMap<string, number>,
): FeedCardV3 | null {
	const permitted = new Set(mix.map((s) => s.fill));

	// See the 2026-09-08 header note: the cursor is per KIND, not the shared
	// rotate, so each list is walked one row per emission of that kind.
	const cursor = (fill: Slot["fill"], kind: FeedCardV3["kind"]): number =>
		slotOrdinal(mix, ctx.rotate0, fill) +
		emitted.filter((c) => c.kind === kind).length;

	// The fresh phase entered each list at `firstUnseen`'s rotation, not at the
	// cursor, so the loop's first pick can land on the very card just shown —
	// step one past it. With a single-row list the repeat stands: a repeat is
	// bad, a blank is worse.
	const nextLooped = <T extends { id: string }>(
		items: readonly T[],
		fill: Slot["fill"],
		kind: FeedCardV3["kind"],
	): T | null => {
		const at = cursor(fill, kind);
		const pick = anyItem(items, at);
		if (pick === null) return null;
		for (let i = emitted.length - 1; i >= 0; i--) {
			const prev = emitted[i];
			if (prev === undefined || prev.kind !== kind) continue;
			return prev.id === pick.id ? anyItem(items, at + 1) : pick;
		}
		return pick;
	};

	/** Candidates in stage-preference order, each already stage-legal. */
	const candidates: (FeedCardV3 | null)[] = [];

	if (permitted.has("listing")) {
		candidates.push(nextLooped(ctx.listingRanked, "listing", "listing"));
	}
	if (permitted.has("community")) {
		const c = nextLooped(ctx.communityRanked, "community", "community");
		if (c !== null && !isLayerSuppressed(ctx.signals, "community")) {
			candidates.push(c);
		}
	}
	if (
		permitted.has("geo") &&
		ctx.level !== null &&
		!isLayerSuppressed(ctx.signals, ctx.level)
	) {
		const u = anyItem(
			unitsAtLevel(ctx.geoRanked, ctx.level),
			cursor("geo", "area"),
		);
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
		listingRanked: rankListings(pool, signals),
		loopedIds: [],
		rotate0,
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

/**
 * How many positions past the new active card `rerankTail` must not touch:
 * `SwipeStack` mounts activeIndex−1‥+2, so +2 is on the glass and +3 is one
 * card of slack for a fast second swipe landing before the re-rank commits.
 */
export const RERANK_HOLD = 3;

/**
 * Re-order the deck's unswiped tail to the CURRENT ranking — the per-swipe
 * half of the recommendation loop. Composition (`appendPage`) already reads
 * fresh signals, but only every ~7 swipes; this closes the gap so the very
 * next unmounted cards follow the swipe that just happened.
 *
 * Three invariants, each load-bearing:
 *
 *   · positions `< from` are returned byte-for-byte: the mounted window keeps
 *     its cards, so the deck-key contract ("a card's position never changes"
 *     — for a MOUNTED card) and the mid-gesture peek both hold.
 *   · each kind is reordered only among its OWN slots. The mix table and the
 *     rhythm run-limits are properties of the kind sequence, which a
 *     kind-preserving permutation cannot disturb. Trade-offs and areas keep
 *     their exact positions.
 *   · a deck that has begun LOOPING (any duplicate id) is returned untouched:
 *     reordering duplicates can seat the same card twice in a row, and past
 *     the pool's end there is nothing left for ranking to say anyway.
 *
 * Returns the input deck by identity when nothing moves, so the caller's
 * `setDeck` can skip a render.
 */
export function rerankTail(
	deck: readonly FeedCardV3[],
	from: number,
	signals: SignalState,
	pool: FeedPool,
): readonly FeedCardV3[] {
	if (from < 0 || from >= deck.length) return deck;
	const ids = deck.map((c) => c.id);
	if (new Set(ids).size !== ids.length) return deck;

	const rankOf = new Map<string, number>();
	rankListings(pool, signals).forEach((l, i) => rankOf.set(l.id, i));
	rankCommunities(pool.communities, signals).forEach((c, i) =>
		rankOf.set(c.id, i),
	);

	const next = [...deck];
	let moved = false;
	for (const kind of ["listing", "community"] as const) {
		const at: number[] = [];
		for (let i = from; i < deck.length; i++) {
			if (deck[i]?.kind === kind) at.push(i);
		}
		if (at.length < 2) continue;
		const cards = at.map((i) => deck[i] as FeedCardV3);
		// Stable, so cards the ranking cannot place keep their deck order.
		const sorted = [...cards].sort(
			(a, b) =>
				(rankOf.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
				(rankOf.get(b.id) ?? Number.MAX_SAFE_INTEGER),
		);
		for (let j = 0; j < at.length; j++) {
			const pos = at[j] as number;
			const card = sorted[j] as FeedCardV3;
			if (next[pos] !== card) moved = true;
			next[pos] = card;
		}
	}
	return moved ? next : deck;
}
