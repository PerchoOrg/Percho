/**
 * Per-card gesture capability — what the top card is allowed to do.
 *
 * This lives in `lib/gesture` (not `lib/feed`) on purpose: `useSwipeCard` and
 * `SwipeStack` are generic over the card data type and must stay ignorant of
 * feed semantics. They consume this resolved capability; the feed layer decides
 * it (`lib/feed/behavior.ts`). A gesture handler therefore never branches on a
 * card kind — the §1.1 engineering red-line ("every handler must handle all 8
 * kinds") is satisfied structurally rather than by 8 null checks.
 */

export interface CardCapability {
	/** False = the card does not follow the finger at all. */
	pannable: boolean;
	/**
	 * False = a past-threshold release still springs back. Milestone (§1.5) is
	 * `pannable: true, commits: false` — it follows the finger and returns. An
	 * unpannable card would be dead to the touch, which is not what §1.5 asks for.
	 */
	commits: boolean;
	/** Fraction of card width the drag is clamped to. 1 = unclamped. */
	maxDisplacementRatio: number;
	/** Tap crossfades to a data face (§0.5). */
	flippable: boolean;
	/**
	 * Hold after commit, before flyout, so the card face can change content
	 * (§1.6 Challenge reveal = 900ms). Undefined = fly out immediately.
	 */
	revealMs?: number;
}

/** A normal decide-and-fly card with a data face. */
export const DEFAULT_CAPABILITY: CardCapability = {
	pannable: true,
	commits: true,
	maxDisplacementRatio: 1,
	flippable: true,
};
