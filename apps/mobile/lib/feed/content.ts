/**
 * Authored card content — the trade-offs the app shows.
 *
 * This is product copy, not fixture data: these are the actual trade-off
 * questions a buyer sees.
 *
 * The ask cards (purpose / life / lifestyle / budget / geo) and the challenge
 * card were deleted wholesale on 2026-08-15 (owner: 「把 your purpose card 先
 * 全部删掉」, then life + challenge). Geo asks are still DERIVED from real
 * `GeoUnit`s in `generate-feed.ts` — never authored, so the app can never ask
 * about a place that isn't in the database.
 */
import type { TradeoffCardV3 } from "./card-types";

// ─── Trade-offs (§1.6: never ✓/✗, never yes/no) ─────────────────────

export const TRADEOFFS: readonly TradeoffCardV3[] = [
	{
		kind: "tradeoff",
		id: "to-yard-vs-commute",
		left: { label: "Bigger yard", dim: "outdoors" },
		right: { label: "Shorter commute", dim: "walkable", icon: "car" },
		scope: "life",
	},
	{
		kind: "tradeoff",
		id: "to-schools-vs-nightlife",
		left: { label: "Best schools", dim: "schools" },
		right: { label: "Walk to dinner", dim: "nightlife" },
		scope: "life",
	},
	{
		kind: "tradeoff",
		id: "to-quiet-vs-scene",
		left: { label: "Quiet cul-de-sac", dim: "quiet" },
		right: { label: "Neighborhood scene", dim: "hip" },
		scope: "life",
	},
	{
		kind: "tradeoff",
		id: "to-trails-vs-walkable",
		left: { label: "Trail access", dim: "trails" },
		right: { label: "Walkable shops", dim: "walkable" },
		scope: "life",
	},
	{
		kind: "tradeoff",
		id: "to-space-vs-movein",
		left: { label: "Room to grow", dim: "space" },
		right: { label: "Move-in ready", dim: "move_in" },
		scope: "property",
	},
	{
		kind: "tradeoff",
		id: "to-kitchen-vs-yard",
		left: { label: "Updated kitchen", dim: "entertaining" },
		right: { label: "Private yard", dim: "outdoors" },
		scope: "property",
	},
	{
		kind: "tradeoff",
		id: "to-newbuild-vs-character",
		left: { label: "Brand new", dim: "move_in" },
		right: { label: "Older with character", dim: "hip" },
		scope: "property",
	},
];
