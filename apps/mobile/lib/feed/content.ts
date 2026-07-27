/**
 * Authored card content — the questions the app asks.
 *
 * This is product copy, not fixture data: these are the actual Stage-0/lifestyle
 * questions and trade-offs a buyer sees. Two hard rules govern what may live
 * here:
 *
 *  1. **No stats.** Not a median, not a school rating, not a commute time, not a
 *     "top schools" claim. Every number a card shows comes from the real pool
 *     via `GeoStats` / a real listing. A question needs no statistic to be
 *     asked, so none appears here.
 *  2. **No geography.** Geo asks are DERIVED from real `GeoUnit`s
 *     (`geoAskFor`), never authored, so the app can never ask about a place
 *     that isn't in the database or name a metro sub-region that doesn't exist.
 *
 * Challenge cards are likewise derived — see `challengeFromListing`, which
 * builds the "guess the price" card from a real listing's real price.
 */
import type {
	AskCardV3,
	BudgetBand,
	ChallengeCardV3,
	FunnelLayer,
	ListingCardV3,
	TradeoffCardV3,
} from "./card-types";
import type { GeoUnit } from "./geo-unit";

// ─── Stage-0 purpose + life asks (§1.7 "intent 确认 + ≥2 生活信号") ────

export const PURPOSE_ASKS: readonly AskCardV3[] = [
	{
		kind: "ask",
		id: "ask-purpose-primary",
		layer: "purpose",
		q: "Looking for a place to actually live in?",
		sub: "As opposed to an investment or a second home.",
		choice: { form: "yes-no", affirm: { type: "intent", value: "primary" } },
	},
	{
		kind: "ask",
		id: "ask-purpose-first-home",
		layer: "purpose",
		q: "Is this your first home?",
		choice: { form: "yes-no", affirm: { type: "intent", value: "first-home" } },
	},
	{
		kind: "ask",
		id: "ask-purpose-timeline",
		layer: "purpose",
		q: "Buying soon, or still getting a feel for it?",
		choice: {
			form: "either-or",
			left: {
				label: "Just looking",
				record: { type: "intent", value: "browsing" },
			},
			right: {
				label: "Buying soon",
				record: { type: "intent", value: "active" },
			},
		},
	},
];

export const LIFE_ASKS: readonly AskCardV3[] = [
	{
		kind: "ask",
		id: "ask-life-family",
		layer: "life",
		q: "Kids at home, or on the way?",
		choice: { form: "yes-no", affirm: { type: "dim", dim: "family" } },
	},
	{
		kind: "ask",
		id: "ask-life-outdoors",
		layer: "life",
		q: "Do you want outdoor space of your own?",
		sub: "A yard, a deck, somewhere to put a grill.",
		choice: { form: "yes-no", affirm: { type: "dim", dim: "outdoors" } },
	},
	{
		kind: "ask",
		id: "ask-life-walkable",
		layer: "life",
		q: "Would you rather walk than drive?",
		choice: { form: "yes-no", affirm: { type: "dim", dim: "walkable" } },
	},
	{
		kind: "ask",
		id: "ask-life-work-home",
		layer: "life",
		q: "Do you work from home most days?",
		choice: { form: "yes-no", affirm: { type: "dim", dim: "quiet" } },
	},
	{
		kind: "ask",
		id: "ask-life-schools",
		layer: "life",
		q: "Do schools factor into where you land?",
		choice: { form: "yes-no", affirm: { type: "dim", dim: "schools" } },
	},
	{
		kind: "ask",
		id: "ask-life-host",
		layer: "life",
		q: "Do you host people often?",
		choice: { form: "yes-no", affirm: { type: "dim", dim: "entertaining" } },
	},
];

export const LIFESTYLE_ASKS: readonly AskCardV3[] = [
	{
		kind: "ask",
		id: "ask-lifestyle-pace",
		layer: "lifestyle",
		q: "Quiet street, or somewhere with a pulse?",
		choice: {
			form: "either-or",
			left: { label: "Quiet street", record: { type: "dim", dim: "quiet" } },
			right: { label: "Some pulse", record: { type: "dim", dim: "hip" } },
		},
	},
	{
		kind: "ask",
		id: "ask-lifestyle-condition",
		layer: "lifestyle",
		q: "Move-in ready, or room to make it yours?",
		choice: {
			form: "either-or",
			left: { label: "Move-in ready", record: { type: "dim", dim: "move_in" } },
			right: { label: "Room to change", record: { type: "dim", dim: "space" } },
		},
	},
	{
		kind: "ask",
		id: "ask-lifestyle-trails",
		layer: "lifestyle",
		q: "Do you want trails or a greenway nearby?",
		choice: { form: "yes-no", affirm: { type: "dim", dim: "trails" } },
	},
	{
		kind: "ask",
		id: "ask-lifestyle-nightlife",
		layer: "lifestyle",
		q: "Do you go out in the evenings?",
		choice: { form: "yes-no", affirm: { type: "dim", dim: "nightlife" } },
	},
];

// ─── Budget band, by binary split only (§1.7 + the no-picker iron law) ───

/**
 * §1.7 needs a "budget band" before Stage 1, and the iron law forbids a picker,
 * a slider, or a bottom-sheet form. So the band is captured the same way every
 * other preference is: one card, one question, one swipe. A first split fixes
 * which side of $500K the buyer is on, and one narrowing split turns that half
 * into a band. Two swipes, no widget.
 *
 * Returns null once a band has both bounds, or is deliberately open-ended at
 * the top (over $850K needs no further narrowing to be actionable).
 */
export function nextBudgetAsk(band: BudgetBand | undefined): AskCardV3 | null {
	if (!band) {
		return {
			kind: "ask",
			id: "ask-budget-split-500",
			layer: "life",
			q: "Where does your budget land?",
			choice: {
				form: "either-or",
				left: {
					label: "Under $500K",
					record: { type: "budget", band: { maxUsd: 500_000 } },
				},
				right: {
					label: "Over $500K",
					record: { type: "budget", band: { minUsd: 500_000 } },
				},
			},
		};
	}

	if (band.maxUsd === 500_000 && band.minUsd === undefined) {
		return {
			kind: "ask",
			id: "ask-budget-narrow-under-500",
			layer: "life",
			q: "Closer to which end?",
			choice: {
				form: "either-or",
				left: {
					label: "Under $350K",
					record: { type: "budget", band: { maxUsd: 350_000 } },
				},
				right: {
					label: "$350–500K",
					record: {
						type: "budget",
						band: { minUsd: 350_000, maxUsd: 500_000 },
					},
				},
			},
		};
	}

	if (band.minUsd === 500_000 && band.maxUsd === undefined) {
		return {
			kind: "ask",
			id: "ask-budget-narrow-over-500",
			layer: "life",
			q: "Closer to which end?",
			choice: {
				form: "either-or",
				left: {
					label: "$500–850K",
					record: {
						type: "budget",
						band: { minUsd: 500_000, maxUsd: 850_000 },
					},
				},
				right: {
					label: "Over $850K",
					record: { type: "budget", band: { minUsd: 850_000 } },
				},
			},
		};
	}

	return null;
}

// ─── Trade-offs (§1.6: never ✓/✗, never yes/no) ─────────────────────

export const TRADEOFFS: readonly TradeoffCardV3[] = [
	{
		kind: "tradeoff",
		id: "to-yard-vs-commute",
		left: { label: "Bigger yard", dim: "outdoors" },
		right: { label: "Shorter commute", dim: "walkable" },
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

// ─── Derived cards — real data in, no invention ─────────────────────

/**
 * A geo ask, built from a real unit. The question names the unit's real name and
 * state; the sub-line lists up to three real member community names and the real
 * community count. Nothing about the place is authored, so the app cannot ask
 * about a metro sub-region that doesn't exist in the database.
 */
export function geoAskFor(unit: GeoUnit): AskCardV3 {
	const names = unit.sampleCommunityNames.slice(0, 3);
	const sub =
		names.length > 0
			? `${names.join(" · ")}${
					unit.communityCount > names.length
						? ` and ${unit.communityCount - names.length} more`
						: ""
				}`
			: undefined;
	return {
		kind: "ask",
		id: `ask-geo-${unit.id}`,
		layer: unit.level satisfies FunnelLayer,
		q: `${unit.name}, ${unit.state}?`,
		...(sub ? { sub } : {}),
		...(unit.heroUrl ? { heroUrl: unit.heroUrl } : {}),
		geo: {
			unitId: unit.id,
			level: unit.level,
			...(unit.boundary ? { boundary: unit.boundary } : {}),
		},
		choice: {
			form: "yes-no",
			affirm: { type: "geo", unitId: unit.id, level: unit.level },
		},
	};
}

/** Rounds a real price to a plausible guess boundary without inventing one. */
function splitPointFor(price: number): number {
	const step = price >= 1_000_000 ? 50_000 : 25_000;
	return Math.round(price / step) * step;
}

/**
 * §1.6 "guess the price" — built from a REAL listing's real price. The reveal
 * label quotes the actual number, and the split point is derived from it by
 * rounding, so no card ever shows a price that isn't in the database.
 *
 * Returns null for a listing with no usable price: a guess-the-price card
 * without a price is exactly the fabricated stat we don't ship.
 */
export function challengeFromListing(
	listing: ListingCardV3,
	priceUsd: number | undefined,
): ChallengeCardV3 | null {
	if (priceUsd == null || priceUsd <= 0) return null;
	const split = splitPointFor(priceUsd);
	if (split === priceUsd) return null; // no side would be correct
	const over = priceUsd > split;
	const money = (n: number) => `$${n.toLocaleString("en-US")}`;
	return {
		kind: "challenge",
		id: `ch-price-${listing.id}`,
		tag: "🎲 GUESS THE PRICE",
		q: "What does this home go for?",
		sub: [listing.address, listing.bedBathSqft].filter(Boolean).join(" · "),
		...(listing.heroUrl ? { heroUrl: listing.heroUrl } : {}),
		left: { label: `Under ${money(split)}`, value: split },
		right: { label: `Over ${money(split)}`, value: split },
		answer: over ? "right" : "left",
		revealLabel: money(priceUsd),
		teach: `Listed at ${money(priceUsd)}.`,
		// Carried so the reveal's `Explore →` has a real target (owner asked for
		// "一个explore的按钮进一步了解"). Not derived from the card id by string
		// surgery at the call site: that would silently break the moment the id
		// scheme changes.
		listingId: listing.id,
	};
}

export const PREFERENCE_ASKS: readonly AskCardV3[] = [
	...PURPOSE_ASKS,
	...LIFE_ASKS,
	...LIFESTYLE_ASKS,
];
