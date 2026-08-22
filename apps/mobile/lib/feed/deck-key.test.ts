/**
 * Deck key uniqueness, asserted over a REAL multi-page session.
 *
 * This is the test that was missing. `generate-feed.test.ts` asserts that a page
 * contains no duplicate ids, and `rhythm.test.ts` walks a whole session — but
 * neither checked the invariant React actually cares about: that the keys of the
 * accumulated DECK are unique. §1.9's loop-with-badge behaviour guarantees they
 * are not, by design, once fresh inventory runs out.
 *
 * So the composer was right, the stack was right, and the screen was handing
 * React two children with the same key. Deck composition and the key it is
 * mounted under are two separate facts; only the second one is tested here.
 */
import { describe, expect, it } from "vitest";
import type { FeedCardV3 } from "./card-types";
import { deckKey } from "./deck-key";
import { EMPTY_POOL, type FeedPool, generateFeed } from "./generate-feed";
import { FIRST_PAGE_SIZE, PREFETCH_DISTANCE } from "./ratios";
import { EMPTY_SIGNALS } from "./signals";

/**
 * Replays what `app/(tabs)/feed.tsx` actually does: compose a first page, then
 * append another whenever the active card comes within `PREFETCH_DISTANCE` of
 * the end, accumulating into ONE deck that is never rebuilt.
 */
function session(pool: FeedPool, swipes: number): readonly FeedCardV3[] {
	let deck: FeedCardV3[] = [];
	let rotate = 0;

	const first = generateFeed({
		stage: 4,
		signals: EMPTY_SIGNALS,
		pool,
		seenIds: [],
		count: FIRST_PAGE_SIZE,
		rotate: 0,
	});
	rotate = first.nextRotate;
	deck = [...first.cards];

	for (let i = 0; i < swipes; i++) {
		if (deck.length - i <= PREFETCH_DISTANCE) {
			const page = generateFeed({
				stage: 4,
				signals: EMPTY_SIGNALS,
				pool,
				seenIds: deck.map((c) => c.id),
				count: FIRST_PAGE_SIZE,
				rotate,
			});
			rotate = page.nextRotate;
			deck = [...deck, ...page.cards];
		}
	}
	return deck;
}

const dupes = (keys: readonly string[]): string[] => [
	...new Set(keys.filter((k, i) => keys.indexOf(k) !== i)),
];

describe("deckKey", () => {
	it("disambiguates a card the composer legitimately re-emits", () => {
		const card = { kind: "tradeoff", id: "to-quiet-vs-scene" } as FeedCardV3;
		expect(deckKey(card, 3)).not.toBe(deckKey(card, 17));
	});

	it("is stable for a card's whole mounted lifetime", () => {
		// SwipeStack keeps a promoted card's subtree (and its CardVideo buffer)
		// alive across a swipe, which only works if the key does not change when
		// the card is promoted. The absolute index never changes, so it doesn't.
		const card = { kind: "tradeoff", id: "to-quiet-vs-scene" } as FeedCardV3;
		expect(deckKey(card, 5)).toBe(deckKey(card, 5));
	});
});

describe("a real session's deck keys", () => {
	// A thin pool is what makes §1.9 looping kick in early. It has to be a
	// COMMUNITY pool: since the deck was cut to listings + communities
	// (2026-08-22) those are the only kinds left, and `loopedFallback` only
	// recycles communities — a listing is never re-emitted, so a listing-only
	// pool simply runs dry instead of looping.
	const community = (i: number) => ({
		kind: "community" as const,
		id: `cm-${i}`,
		slug: `cm-${i}`,
		name: `Community ${i}`,
		city: "Duluth",
		state: "GA",
		heroUrl: `https://example.test/cm-${i}.jpg`,
	});

	const pools: [string, FeedPool][] = [
		[
			"a pool with one community",
			{ ...EMPTY_POOL, communities: [community(0)] },
		],
		[
			"a pool with a handful of communities",
			{
				...EMPTY_POOL,
				communities: Array.from({ length: 3 }, (_, i) => community(i)),
			},
		],
	];

	for (const [label, pool] of pools) {
		describe(label, () => {
			it("contains a repeated card id — §1.9 looping, by design", () => {
				// If this ever stops being true the bug below cannot occur, but the
				// guard is still correct; this asserts the PREMISE so a future change
				// to looping doesn't silently make the real test vacuous.
				const deck = session(pool, 40);
				expect(dupes(deck.map((c) => c.id)).length).toBeGreaterThan(0);
			});

			it("still yields unique React keys at every deck length", () => {
				// The actual regression. Keyed by `card.id` this fails at 7 swipes with
				// an empty pool — which is what React's "two children with the same
				// key, `ask-purpose-primary`" warning on device was reporting.
				for (const swipes of [7, 12, 25, 40]) {
					const deck = session(pool, swipes);
					const keys = deck.map((c, i) => deckKey(c, i));
					expect(dupes(keys), `at ${swipes} swipes`).toEqual([]);
					expect(new Set(keys).size).toBe(deck.length);
				}
			});
		});
	}
});
