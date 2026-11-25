import type { FeedCardV3 } from "./card-types";

/**
 * The still a card paints before its film is ready, or `undefined` when the
 * card has none (a trade-off card, an area without a photo).
 *
 * The launch screen waits for this image on the deck's first card
 * (`lib/splash-gate.ts`), so the cross-fade lands on a picture rather than on
 * the dark backdrop behind one.
 */
export function cardPoster(card: FeedCardV3): string | undefined {
	switch (card.kind) {
		case "area":
			return card.unit.heroUrl || undefined;
		case "listing":
		case "community":
			return card.heroUrl || undefined;
		case "tradeoff":
			return undefined;
	}
}
