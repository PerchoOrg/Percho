/**
 * What the You tab's RECENT list shows, and what "Bring back" needs to undo
 * (phase140).
 *
 * ── Why this is a SNAPSHOT and not just an id ───────────────────────────────
 *
 * The Saved tab keeps ids and re-fetches each row from the detail endpoints on
 * mount, which is right there: a saved home is a thing the buyer will come back
 * to over weeks, and its price must not be stale. RECENT is the opposite — a
 * log of what just happened, read seconds to minutes later, and four detail
 * round-trips to redraw a list of cards the app had in memory at swipe time
 * would be slower and no more true.
 *
 * So each entry carries the two lines and the thumbnail the card was already
 * showing. If a price changes after the swipe, the RECENT row keeps the price
 * the buyer actually saw when they passed — which is the honest thing for a
 * history to say.
 *
 * ── Only the two inventory kinds ────────────────────────────────────────────
 *
 * A trade-off answer is a preference statement, and §1.8 already rules those
 * out of undo ("信号已入 scope"). An area card is revertible in principle but
 * has not been in the deck since 2026-08-22. `recentEntryFor` returns `null`
 * for both, so nothing unrevertible can reach the list.
 *
 * Pure: no react, no store, no clock — `at` is supplied by the caller.
 */
import type { FeedCardV3, SwipeVerdict } from "./card-types";

/** How many verdicts the list keeps. Older entries fall off the end. */
export const RECENT_CAP = 30;

export interface RecentEntry {
	id: string;
	kind: "listing" | "community";
	verdict: SwipeVerdict;
	/** Epoch ms of the swipe. */
	at: number;
	/** The card's own headline — an address, or a community name. */
	title: string;
	/** One supporting line, built only from fields the card really had. */
	subtitle: string;
	thumbUrl?: string;
	/** The unit the swipe credited, so the verdict can be handed back. */
	geoUnitId?: string;
}

/**
 * Snapshot one swipe, or `null` when the card is not one the You tab lists.
 */
export function recentEntryFor(
	card: FeedCardV3,
	verdict: SwipeVerdict,
	at: number,
): RecentEntry | null {
	if (card.kind === "listing") {
		return {
			id: card.id,
			kind: "listing",
			verdict,
			at,
			title: card.address,
			// Price and place only. `bedBathSqft` is a three-part string that
			// wraps the row on an SE, and the price is what a buyer recognises a
			// home they just passed by.
			subtitle: [card.priceLabel, card.locality].filter(Boolean).join(" · "),
			...(card.heroUrl ? { thumbUrl: card.heroUrl } : {}),
			...(card.geoUnitId ? { geoUnitId: card.geoUnitId } : {}),
		};
	}
	if (card.kind === "community") {
		return {
			id: card.id,
			kind: "community",
			verdict,
			at,
			title: card.name,
			subtitle: `${card.city}, ${card.state}`,
			...(card.heroUrl ? { thumbUrl: card.heroUrl } : {}),
			...(card.geoUnitId ? { geoUnitId: card.geoUnitId } : {}),
		};
	}
	return null;
}

/**
 * Newest first, one entry per card id, capped.
 *
 * De-duping by id matters because §1.9 has the composer re-emit a seen card
 * once fresh inventory runs out: without this the same home could occupy three
 * rows of a five-row list with three different verdicts, of which only the
 * newest is true.
 */
export function pushRecent(
	list: readonly RecentEntry[],
	entry: RecentEntry,
	cap: number = RECENT_CAP,
): readonly RecentEntry[] {
	return [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, cap);
}
