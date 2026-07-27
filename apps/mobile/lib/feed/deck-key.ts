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
 * The absolute index is the disambiguator, and it is the RIGHT one because it is
 * fixed for a mounted card's whole lifetime — which is what `SwipeStack` relies
 * on to keep a promoted card's subtree (and its `CardVideo` buffer) alive across
 * a swipe. A key that changed on promotion would remount every card and defeat
 * that; this one does not change, because a card's position in the deck never
 * does.
 */
import type { FeedCardV3 } from "./card-types";

export function deckKey(card: FeedCardV3, absIndex: number): string {
	return `${absIndex}:${card.id}`;
}
