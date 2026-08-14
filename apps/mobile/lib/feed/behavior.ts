/**
 * `cardBehavior(card)` — the single resolution point from a card kind to what a
 * gesture may do with it (§1.1 table + §1.8 direction labels).
 *
 * It returns a DISCRIMINATED UNION, not a bag of optional flags. The §1.1
 * engineering red-line is that a handler which assumes a capability exists
 * throws and loses its touch binding; a flag bag re-creates that hazard because
 * `behavior.cta` and `behavior.labels` would both be optional everywhere. With a
 * union, a `mode: 'decide'` card has no `cta` to read — the compiler refuses the
 * mistake instead of the runtime discovering it.
 *
 * 2026-08-15: ask / challenge / insight / milestone are gone; every surviving
 * kind (area, listing, community, trade-off) commits and flies out.
 */
import type { CardCapability } from "../gesture/capability";
import type { FeedCardV3 } from "./card-types";

export interface SwipeLabels {
	left: string;
	right: string;
}

interface BehaviorBase {
	capability: CardCapability;
}

export type CardBehavior =
	/** Yes/no, like/pass, tell-me-more — red/green hints. */
	| (BehaviorBase & { mode: "decide"; labels: SwipeLabels })
	/**
	 * Two named options. `split` = the §1.6 visual mid-line with follow-the-finger
	 * brightening. NEVER ✓/✗ or yes/no copy on either side.
	 */
	| (BehaviorBase & { mode: "either-or"; labels: SwipeLabels; split: boolean });

/** Commits and flies out — every surviving kind. */
const DECIDES: CardCapability = {
	pannable: true,
	commits: true,
	maxDisplacementRatio: 1,
};

export function cardBehavior(card: FeedCardV3): CardBehavior {
	switch (card.kind) {
		case "area":
			return {
				mode: "decide",
				labels: { left: "NOT FOR ME", right: "TELL ME MORE" },
				capability: DECIDES,
			};

		case "listing":
		case "community":
			return {
				mode: "decide",
				labels: { left: "PASS", right: "LIKE" },
				capability: DECIDES,
			};

		case "tradeoff":
			return {
				mode: "either-or",
				split: true,
				labels: { left: card.left.label, right: card.right.label },
				capability: DECIDES,
			};
	}
}

/**
 * Convenience for the label overlay. Every surviving kind carries labels.
 */
export function swipeLabelsFor(card: FeedCardV3): SwipeLabels {
	return cardBehavior(card).labels;
}
