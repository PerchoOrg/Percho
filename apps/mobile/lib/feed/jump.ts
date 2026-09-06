/**
 * Jumping the deck to a chosen community (owner pick "R3", 2026-09-05).
 *
 * The feed header carries a strip of the communities Percho has filmed in the
 * scoped city; tapping one goes to that card. The deck is a composed list, so
 * "go to" has to mean something precise:
 *
 *   · The card is ALREADY the top card → nothing happens. Re-tapping the ringed
 *     face must not consume it or re-order anything.
 *   · Otherwise the card is placed directly AFTER the top card and becomes the
 *     new top. The card the buyer was on is left behind without a verdict —
 *     tapping a neighbourhood is navigation, not a judgement of what was on
 *     screen, so no signal is recorded for it.
 *
 * A copy is INSERTED rather than the original moved. Moving an entry that sits
 * before `activeIndex` would renumber everything the stack has already
 * animated past, and the community pool recycles entries anyway (see
 * `deck-key.test.ts`) — a second copy further down the deck is a shape the deck
 * already has, and `keyExtractor` keys by index as well as id.
 */
import type { CommunityCardV3, FeedCardV3 } from "./card-types";

export interface JumpResult {
	/** The deck to render — unchanged (same reference) when nothing moved. */
	deck: readonly FeedCardV3[];
	/** Where the top card should now be. */
	activeIndex: number;
}

export function jumpToCommunity(
	deck: readonly FeedCardV3[],
	activeIndex: number,
	target: CommunityCardV3,
): JumpResult {
	const top = deck[activeIndex];
	if (top?.kind === "community" && top.id === target.id) {
		return { deck, activeIndex };
	}
	// Past the end (an exhausted deck) appends; `slice` clamps for us.
	const at = Math.min(activeIndex + 1, deck.length);
	return {
		deck: [...deck.slice(0, at), target, ...deck.slice(at)],
		activeIndex: at,
	};
}
