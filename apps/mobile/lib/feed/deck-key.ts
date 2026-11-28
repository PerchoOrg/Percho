/**
 * The React key for a mounted card.
 *
 * ## Why a card id is not a key
 *
 * §1.9 tells the composer to RE-EMIT a card the buyer has already seen once
 * fresh inventory runs out ("循环 + seen 角标"). That is deliberate, and it means
 * the same card id legitimately occupies two positions in one deck — with an
 * empty pool it happens after 7 swipes.
 *
 * `SwipeStack` mounts a window of cards from that deck and keyed them by id
 * alone. React then logged
 *
 *     Encountered two children with the same key, `ask-purpose-primary`.
 *
 * and, as that warning says, "non-unique keys may cause children to be
 * duplicated and/or omitted". Both halves of that sentence were visible on
 * device: a card flashing (React reusing a subtree across two different stack
 * positions, so it painted with the other position's animated style for a frame)
 * and a card that would not leave (the outgoing copy omitted, so the animation
 * whose completion callback performs the handoff never mounted to run).
 *
 * Both were misdiagnosed twice before this — once as a stack-geometry bug, once
 * as a gesture race. The real fault was upstream of both: the deck was handing
 * React an ambiguous identity, so no amount of correct geometry or gesture
 * gating could hold.
 *
 * ## Which copy, not which position
 *
 * The key is the card's id and WHICH COPY of it this is, counted from the top
 * of the deck: `cm-3#0`, and `cm-3#1` when the composer deals it again.
 *
 * Until phase415 the disambiguator was the card's absolute index, which was
 * right while a card's position in the deck never changed. Hiding a card takes
 * it OUT of the deck (owner, 2026-11-28: after the cross he could not swipe
 * back — the hidden card had been left in its slot as a wall), and every card
 * after it moves up one. Keyed by index, each of those would remount: the film
 * in front would restart.
 *
 * Counting copies is stable under that: taking every copy of one id out
 * changes no other card's count. `SwipeStack` keeps a kept card's subtree —
 * and its `CardVideo` buffer — across the change.
 */
import type { FeedCardV3 } from "./card-types";

/** One key per card of `deck`, in order. */
export function deckKeys(deck: readonly FeedCardV3[]): string[] {
	const copies = new Map<string, number>();
	return deck.map((card) => {
		const n = copies.get(card.id) ?? 0;
		copies.set(card.id, n + 1);
		return `${card.id}#${n}`;
	});
}
