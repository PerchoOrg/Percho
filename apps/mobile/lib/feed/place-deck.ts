/**
 * A place's own deck (phase404.3): a city's neighbourhoods, or a
 * neighbourhood's homes, opened from the place's card on the feed and from its
 * Explore page.
 *
 * Owner, 2026-11-25: 「我应该可以在喜欢某一个city之后 … 使得feed局限在这个city
 * 同理 也应该可以在喜欢某个community之后 进一步看这个社区的房子」.
 *
 * There was a second half — the feed following a like, queueing a liked
 * city's neighbourhoods behind the next card (phase404.3–404.6). The owner
 * took it out on 2026-11-26 until it is designed: 「先不要默认喜欢city或者
 * community后接着放这个社区或者房子的内容 这部分推荐等设计好了再做」.
 *
 * Pure: no react, no store, no clock — same contract as the rest of `lib/feed`.
 */
import type { FeedCardV3 } from "./card-types";
import type { FeedPool } from "./generate-feed";

/** What the buyer has already been shown, and what they turned down. */
export interface SwipeHistory {
	/** Every card shown, on any day. */
	seenIds: ReadonlySet<string>;
	passedIds: ReadonlySet<string>;
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
 * Coming back to a deck from a place's page: the cards swiped there leave the
 * part of this deck nothing has mounted, so the buyer is not handed them
 * again. The input deck by identity when nothing goes.
 *
 * @param index the active index — it and the card behind it are mounted
 */
export function withoutSwipedAway(
	deck: readonly FeedCardV3[],
	index: number,
	swipedAway: ReadonlySet<string>,
): readonly FeedCardV3[] {
	if (swipedAway.size === 0) return deck;
	const kept = deck.filter((c, i) => i <= index + 1 || !swipedAway.has(c.id));
	return kept.length === deck.length ? deck : kept;
}

/** One place: a city (by its unit id) or a neighbourhood (by slug). */
export interface PlaceFocus {
	kind: "city" | "community";
	id: string;
	name: string;
}

/**
 * The part of a pool that is one place's — what the server would answer for
 * it (`apps/web/lib/feed/pool-focus.ts`), cut from a pool the phone already
 * holds. A place's page opens on this instead of on a skeleton (phase404.10;
 * owner, 2026-11-26: 「点击communities … 到下一层的时候有点慢 提前可以缓存」),
 * and the server's own answer replaces it when it lands.
 */
export function narrowPool(pool: FeedPool, focus: PlaceFocus): FeedPool {
	if (focus.kind === "city") {
		return {
			geoUnits: pool.geoUnits.filter((u) => u.id === focus.id),
			communities: pool.communities.filter((c) => c.geoUnitId === focus.id),
			listings: pool.listings.filter((l) => l.geoUnitId === focus.id),
		};
	}
	const community = pool.communities.find((c) => c.slug === focus.id);
	return {
		geoUnits: pool.geoUnits.filter((u) => u.id === community?.geoUnitId),
		communities: community ? [community] : [],
		listings: pool.listings.filter((l) => l.communityId === focus.id),
	};
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

/**
 * What a place's own page says at its top (phase404.13). The city and state
 * stay in it — the line above every feed card says them, and the page has no
 * such line (owner, 2026-11-27: 「进了community和home 也保留这个city state 在
 * title 里」):
 *
 *     Suwanee, GA          a city's page
 *     Communities
 *
 *     Edinburgh            a neighbourhood's page
 *     Homes · Suwanee, GA
 *
 * Read from the page's own pool, which carries the city's unit and the
 * neighbourhood's row; the place's name alone until it has landed.
 */
export function placeHeader(
	focus: PlaceFocus,
	pool: Pick<FeedPool, "geoUnits" | "communities">,
): { title: string; subtitle: string } {
	const holds = placeLinkLabel(focus);
	if (focus.kind === "city") {
		const unit = pool.geoUnits.find((u) => u.id === focus.id);
		const name = unit?.name ?? focus.name;
		return {
			title: unit?.state ? `${name}, ${unit.state}` : name,
			subtitle: holds,
		};
	}
	const community = pool.communities.find((c) => c.slug === focus.id);
	const where =
		community?.city && community.state
			? `${community.city}, ${community.state}`
			: community?.city;
	return {
		title: community?.name ?? focus.name,
		subtitle: where ? `${holds} · ${where}` : holds,
	};
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
