/**
 * The §1.7 stage mix tables, as data.
 *
 * 2026-08-15: the funnel was collapsed. Ask (purpose/life/lifestyle/budget/geo),
 * challenge, insight and milestone cards are gone, so the stage machine has no
 * preference input left — the feed is a single unlocked mix of the 4 surviving
 * kinds. The `FunnelStage` type still exists (search's journey strip reads it)
 * but is pinned at 4.
 *
 * 2026-08-22: area/geo and trade-off cards were pulled from the deck (owner:
 * only listings and communities). The `geo` and `tradeoff` fills still exist in
 * `Slot` and the engine can still materialise them — they simply hold no slot
 * in the mix, so nothing emits them.
 *
 * 2026-08-29: the trade-off slot is BACK, with the redesigned Two Doors face
 * behind it (owner picked direction A on 2026-08-25). Geo stays out. One
 * trade-off in nine cards — the pre-cull table ran one in ten, and the two geo
 * slots that made up the difference are gone. That rate is one line to tune.
 *
 * The table LENGTH is not a free choice, and this is why it is nine rather
 * than the eight that inserting one slot would give. `loopedFallback` walks the
 * whole pool by stepping each kind's list once per table cycle, which only
 * reaches every row when the table length and the pool size are coprime (see
 * its header, and the owner's 2026-08-23 "we should see all ready ones in a
 * loop"). Today's video-only inventory is 16 listings and 4 communities, both
 * powers of two — so an EVEN table silently loops a subset forever, and
 * `generate-feed.test.ts` catches exactly that. Any odd length is coprime with
 * both; nine is the shortest that also keeps the deck listing-dominant.
 *
 * The ninth slot is a listing, so the mix goes 5:2 → 6:2 rather than dropping a
 * community. Runs are checked across the WRAP too: this table ends on a listing
 * and opens on two, which is a run of three — inside `rhythm.ts`'s wall of 4.
 *
 * One entry per card, in spec order, so a test can assert the mix by counting
 * rather than by re-deriving it. `generateFeed` walks the table cyclically, so
 * the table no longer has to be exactly `WINDOW` long.
 */
import type { FunnelStage } from "./card-types";
import type { GeoLevel } from "./geo-unit";

export type Slot =
	/** An area card at the stage's target geo level. */
	| { fill: "geo"; level: GeoLevel | "finest" }
	| { fill: "tradeoff" }
	| { fill: "listing"; variant: "tease" | "preview" | "primary" }
	| { fill: "community" };

export const WINDOW = 10;

/**
 * §1.7 — the single unlocked mix. Stage is pinned at 4 post-collapse, so the
 * table has exactly one entry.
 */
export const STAGE_MIX: Record<FunnelStage, readonly Slot[]> = {
	4: [
		{ fill: "listing", variant: "primary" },
		{ fill: "listing", variant: "primary" },
		{ fill: "community" },
		{ fill: "listing", variant: "primary" },
		{ fill: "tradeoff" },
		{ fill: "listing", variant: "primary" },
		{ fill: "listing", variant: "primary" },
		{ fill: "community" },
		{ fill: "listing", variant: "primary" },
	],
};

/** §1.7 pagination: first page is 12 cards. */
export const FIRST_PAGE_SIZE = 12;
/** §1.7: prefetch when the active card is this far from the end. */
export const PREFETCH_DISTANCE = 5;
/** §1.9: two silent retries, then treat the pool as exhausted. */
export const PAGE_RETRIES = 2;
