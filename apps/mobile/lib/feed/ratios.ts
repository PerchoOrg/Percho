/**
 * The §1.7 stage mix tables, as data.
 *
 * One entry per card in a 10-card window, in spec order, so a test can assert
 * the mix by counting rather than by re-deriving it. `generateFeed` walks the
 * table cyclically, which is what makes "1 tease per 10" exactly true at any N
 * rather than approximately true on average.
 *
 * ── Spec correction (owner-approved 2026-07-26) ──────────────────────────────
 * §1.7's table gave Stage 0 as `ask ×6 · trade-off ×3 · challenge ×1`, but §1.6
 * says the challenge card only appears from Stage 2 ("需要地理上下文才有梗"). §1.6
 * is the intended rule; the mix row was the error. Stage 0 is therefore
 * `ask ×7 · trade-off ×3` and `01-feed.md` §1.7 has been corrected to match.
 */
import type { FunnelStage } from "./card-types";
import type { GeoLevel } from "./geo-unit";

/** Which ask layers a slot may draw from. */
export type AskPool = "preference" | "geo" | "any";

export type Slot =
	| { fill: "ask"; pool: AskPool }
	/** An area card at the stage's target geo level. */
	| { fill: "geo"; level: GeoLevel | "finest" }
	| { fill: "tradeoff" }
	| { fill: "challenge" }
	/**
	 * `tease`   = §1.7 Stage 1–2 preview, likeable, 0.5× weight, no badge.
	 * `preview` = Stage 3, restricted to already-liked communities, no badge.
	 * `primary` = Stage 4, fully unlocked.
	 */
	| { fill: "listing"; variant: "tease" | "preview" | "primary" }
	| { fill: "community" }
	/**
	 * Insight has no fixed rhythm — it fires only past an evidence threshold
	 * (§1.6). The slot therefore names what fills it when no insight is earned,
	 * so the window never comes up short.
	 */
	| { fill: "insight"; fallback: Slot };

export const WINDOW = 10;

/** §1.7 — every table is exactly `WINDOW` long. */
export const STAGE_MIX: Record<FunnelStage, readonly Slot[]> = {
	// Stage 0 · Intent & Life — zero geo, zero listings, and (per §1.6) zero
	// challenge. The 10th slot is a 7th ask.
	0: [
		{ fill: "ask", pool: "preference" },
		{ fill: "ask", pool: "preference" },
		{ fill: "tradeoff" },
		{ fill: "ask", pool: "preference" },
		{ fill: "ask", pool: "preference" },
		{ fill: "tradeoff" },
		{ fill: "ask", pool: "preference" },
		{ fill: "ask", pool: "preference" },
		{ fill: "tradeoff" },
		{ fill: "ask", pool: "preference" },
	],
	// Stage 1 · Area → City — area/city ×5 · ask(geo) ×2 · trade-off ×2 · tease ×1
	1: [
		{ fill: "geo", level: "finest" },
		{ fill: "geo", level: "finest" },
		{ fill: "ask", pool: "geo" },
		{ fill: "geo", level: "finest" },
		{ fill: "listing", variant: "tease" },
		{ fill: "tradeoff" },
		{ fill: "geo", level: "finest" },
		{ fill: "ask", pool: "geo" },
		{ fill: "tradeoff" },
		{ fill: "geo", level: "finest" },
	],
	// Stage 2 · Zip / 片区 — zip ×4 · trade-off ×2 · ask ×1 · challenge ×1 ·
	// tease ×1 · insight(conditional) ×1
	2: [
		{ fill: "geo", level: "finest" },
		{ fill: "geo", level: "finest" },
		{ fill: "challenge" },
		{ fill: "geo", level: "finest" },
		{ fill: "listing", variant: "tease" },
		{ fill: "tradeoff" },
		{ fill: "insight", fallback: { fill: "tradeoff" } },
		{ fill: "geo", level: "finest" },
		{ fill: "ask", pool: "geo" },
		{ fill: "tradeoff" },
	],
	// Stage 3 · Community — community ×6 · listing preview ×2 · trade-off ×1 ·
	// insight ×1
	3: [
		{ fill: "community" },
		{ fill: "community" },
		{ fill: "listing", variant: "preview" },
		{ fill: "community" },
		{ fill: "tradeoff" },
		{ fill: "community" },
		{ fill: "insight", fallback: { fill: "community" } },
		{ fill: "community" },
		{ fill: "listing", variant: "preview" },
		{ fill: "community" },
	],
	// Stage 4 · Precision — listing ×5 · community ×2 · insight/challenge ×2 ·
	// ask(补漏) ×1
	4: [
		{ fill: "listing", variant: "primary" },
		{ fill: "listing", variant: "primary" },
		{ fill: "community" },
		{ fill: "listing", variant: "primary" },
		{ fill: "insight", fallback: { fill: "challenge" } },
		{ fill: "listing", variant: "primary" },
		{ fill: "ask", pool: "any" },
		{ fill: "community" },
		{ fill: "challenge" },
		{ fill: "listing", variant: "primary" },
	],
};

/**
 * Stage-2 degradation (PLAN §3, owner-approved): `communities.zip` is 100% NULL,
 * so when the finest available level is coarser than `zip` the four zip slots
 * cannot be filled with sibling zips. They become 2 unseen sibling city units +
 * 1 geo ask + 1 trade-off — same slot count, no invented geography, and the 2→3
 * gate still opens because `evaluateStageAdvance` counts units at the finest
 * available level.
 */
export const STAGE_2_GEO_FALLBACK: readonly Slot[] = [
	{ fill: "geo", level: "finest" },
	{ fill: "geo", level: "finest" },
	{ fill: "ask", pool: "geo" },
	{ fill: "tradeoff" },
];

/** §1.7 pagination: first page is 12 cards. */
export const FIRST_PAGE_SIZE = 12;
/** §1.7: prefetch when the active card is this far from the end. */
export const PREFETCH_DISTANCE = 5;
/** §1.9: two silent retries, then treat the pool as exhausted. */
export const PAGE_RETRIES = 2;
