/**
 * A like steps down a level (phase404.3).
 *
 * Owner, 2026-11-25: 「我应该可以在喜欢某一个city之后 … 使得feed局限在这个city
 * 同理 也应该可以在喜欢某个community之后 进一步看这个社区的房子」; then, on
 * `/demos/feed-focus-v1` and `-v2`: "1+3", and the way in belongs on the
 * Explore page. So two things, and this file is both of their rules:
 *
 *   · **The feed follows a like.** Like a city and its neighbourhoods are the
 *     next cards; like a neighbourhood and its homes are (where the pool
 *     carries homes). No control — `followStep`.
 *   · **A place has a deck of its own**, opened from its Explore page: the
 *     same cards, only that place, with an end — `placeDeck`.
 *
 * ── Where the followed cards go ─────────────────────────────────────────────
 *
 * `SwipeStack` mounts the top card and the one behind it. The one behind is
 * already on the glass when a like commits — the buyer watched it rise under
 * their thumb — so it stays, and the place's cards are queued right after it,
 * at a position nothing has mounted yet. That keeps `deckKey`'s contract (a
 * mounted card never changes position) without the three-card wait
 * `rerankTail` keeps.
 *
 * ── When it stops ───────────────────────────────────────────────────────────
 *
 * When the queued cards have been swiped, or when two of them in a row were
 * passed: the buyer liked the place and not what is in it, and the rest go
 * back to the end of the deck rather than being pressed on them.
 *
 * Pure: no react, no store, no clock — same contract as the rest of `lib/feed`.
 */
import type { FeedCardV3, SwipeVerdict } from "./card-types";
import type { FeedPool } from "./generate-feed";

/** How many of a place's cards one like queues. */
export const FOLLOW_MAX = 4;
/** Passes in a row, on followed cards, that end the run. */
export const FOLLOW_STOP_PASSES = 2;

/** The cards a like queued and the buyer has not reached yet. */
export interface FollowRun {
	ids: readonly string[];
	/** Followed cards passed in a row. A like on one resets it. */
	passes: number;
}

/** What the buyer has already been shown, and what they turned down. */
export interface SwipeHistory {
	/** Every card shown, on any day. */
	seenIds: ReadonlySet<string>;
	passedIds: ReadonlySet<string>;
	/** Swiped since the app was opened — `swipedThisRun` in the session store. */
	recentIds: ReadonlySet<string>;
}

/** Those not seen yet, then those that were, then those that were passed. */
function freshFirst<T extends { id: string }>(
	items: readonly T[],
	history: SwipeHistory,
): T[] {
	const passed = (c: T) => history.passedIds.has(c.id);
	const seen = (c: T) => history.seenIds.has(c.id);
	return [
		...items.filter((c) => !passed(c) && !seen(c)),
		...items.filter((c) => !passed(c) && seen(c)),
		...items.filter(passed),
	];
}

/**
 * What a like may queue: nothing the buyer passed, and nothing they swiped
 * since opening the app — following a like must not replay the cards they
 * just went through on the place's own page.
 */
function worthFollowing<T extends { id: string }>(
	items: readonly T[],
	history: SwipeHistory,
): T[] {
	return freshFirst(
		items.filter(
			(c) => !history.passedIds.has(c.id) && !history.recentIds.has(c.id),
		),
		history,
	);
}

/**
 * The cards one level down from `card`, in the order to show them: a city's
 * neighbourhoods, a neighbourhood's homes. Empty for every other card.
 */
export function cardsWithin(
	card: FeedCardV3,
	pool: FeedPool,
	history: SwipeHistory,
): FeedCardV3[] {
	if (card.kind === "area") {
		return worthFollowing(
			pool.communities.filter((c) => c.geoUnitId === card.unit.id),
			history,
		);
	}
	if (card.kind === "community") {
		// A listing names its community by slug (`PoolListingDTO.communityId`).
		return worthFollowing(
			pool.listings.filter((l) => l.communityId === card.slug),
			history,
		);
	}
	return [];
}

export interface FollowStepInput {
	deck: readonly FeedCardV3[];
	/** The swiped card's position — the active index before it advances. */
	index: number;
	verdict: SwipeVerdict;
	run: FollowRun | null;
	pool: FeedPool;
	history: SwipeHistory;
}

export interface FollowStepResult {
	/** The input deck by identity when nothing moved. */
	deck: readonly FeedCardV3[];
	run: FollowRun | null;
}

/** Everything after the card behind the swiped one, without `ids`; then `put` at `at`. */
function rearrange(
	deck: readonly FeedCardV3[],
	index: number,
	ids: ReadonlySet<string>,
	put: (tail: FeedCardV3[]) => void,
): FeedCardV3[] {
	// `head` ends with the card behind the swiped one: mounted, so it stays.
	const head = deck.slice(0, index + 2);
	const tail = deck.slice(index + 2).filter((c) => !ids.has(c.id));
	put(tail);
	return [...head, ...tail];
}

/**
 * One swipe's effect on the deck's order: account for a followed card, then —
 * on a like — queue what is inside the liked place.
 */
export function followStep(input: FollowStepInput): FollowStepResult {
	const { index, verdict, pool, history } = input;
	const card = input.deck[index];
	if (card === undefined) return { deck: input.deck, run: input.run };
	let deck = input.deck;
	let run = input.run;

	if (run?.ids.includes(card.id)) {
		const ids = run.ids.filter((id) => id !== card.id);
		const passes = verdict === "left" ? run.passes + 1 : 0;
		if (ids.length === 0) {
			run = null;
		} else if (passes >= FOLLOW_STOP_PASSES) {
			const left = new Set(ids);
			const moved = deck.slice(index + 2).filter((c) => left.has(c.id));
			deck = rearrange(deck, index, left, (tail) => tail.push(...moved));
			run = null;
		} else {
			run = { ids, passes };
		}
	}

	if (verdict === "right") {
		const within = cardsWithin(card, pool, history).slice(0, FOLLOW_MAX);
		if (within.length > 0) {
			const ids = new Set(within.map((c) => c.id));
			const behind = deck[index + 1];
			const queued = within.filter((c) => c.id !== behind?.id);
			deck = rearrange(deck, index, ids, (tail) => tail.unshift(...queued));
			run = { ids: within.map((c) => c.id), passes: 0 };
		}
	}

	return { deck, run };
}

/**
 * Coming back to a deck from a place's page: the cards swiped there leave the
 * part of this deck nothing has mounted, so the buyer is not handed them
 * again, and a run stops waiting for them.
 *
 * @param index the active index — it and the card behind it are mounted
 */
export function withoutSwipedAway(
	deck: readonly FeedCardV3[],
	index: number,
	run: FollowRun | null,
	swipedAway: ReadonlySet<string>,
): FollowStepResult {
	if (swipedAway.size === 0) return { deck, run };
	const kept = deck.filter((c, i) => i <= index + 1 || !swipedAway.has(c.id));
	const ids = run?.ids.filter((id) => !swipedAway.has(id)) ?? [];
	return {
		deck: kept.length === deck.length ? deck : kept,
		run: run && ids.length > 0 ? { ids, passes: run.passes } : null,
	};
}

/** One place: a city (by its unit id) or a neighbourhood (by slug). */
export interface PlaceFocus {
	kind: "city" | "community";
	id: string;
	name: string;
}

/**
 * The place a card is the way into, when the pool holds something inside it:
 * a city with a neighbourhood, a neighbourhood with a home. Whatever the buyer
 * has seen or passed — the link to a place does not wait for a like, and its
 * page shows all of it.
 */
export function placeWithin(
	card: FeedCardV3,
	pool: FeedPool,
): PlaceFocus | null {
	if (card.kind === "area") {
		return pool.communities.some((c) => c.geoUnitId === card.unit.id)
			? { kind: "city", id: card.unit.id, name: card.unit.name }
			: null;
	}
	if (card.kind === "community") {
		return pool.listings.some((l) => l.communityId === card.slug)
			? { kind: "community", id: card.slug, name: card.name }
			: null;
	}
	return null;
}

/**
 * What the link into a place's deck says, on the feed and on its Explore page:
 * what is inside, not the place's name again. It shares the feed's place row
 * with the place line, and "More of Johns Creek" left the line too little
 * room (owner, 2026-11-26: 「如果社区或者city名字长 前半部分就很小」); the name
 * is on the card right under it.
 */
export function placeLinkLabel(focus: PlaceFocus): string {
	return focus.kind === "city" ? "Communities" : "Homes";
}

/** The same link read aloud, where there is no card to say whose. */
export function placeLinkAccessibilityLabel(focus: PlaceFocus): string {
	return `${placeLinkLabel(focus)} in ${focus.name}`;
}

/** A route's params as a focus, or null when they do not name a place. */
export function parsePlaceFocus(params: {
	kind?: string | string[];
	id?: string | string[];
	name?: string | string[];
}): PlaceFocus | null {
	const { kind, id, name } = params;
	if (kind !== "city" && kind !== "community") return null;
	if (typeof id !== "string" || id.length === 0) return null;
	return { kind, id, name: typeof name === "string" ? name : "" };
}

/**
 * A place's own deck, from the pool the server narrowed to it: a city's
 * neighbourhoods, then its homes; a neighbourhood's homes. Never the place's
 * own card — the buyer came here from its page — and no composer: nothing is
 * rationed or looped, the deck simply ends.
 *
 * ALL of the place, in `freshFirst`'s order. A neighbourhood passed weeks ago
 * is still here, last: the buyer asked for this place, and a page of three
 * that shows two reads as broken.
 */
export function placeDeck(
	pool: FeedPool,
	kind: PlaceFocus["kind"],
	history: SwipeHistory,
): FeedCardV3[] {
	return [
		...(kind === "city" ? freshFirst(pool.communities, history) : []),
		...freshFirst(pool.listings, history),
	];
}
