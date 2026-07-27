/**
 * `cardBehavior(card)` — the single resolution point from a card kind to what a
 * gesture may do with it (§1.1 table + §1.8 direction labels).
 *
 * It returns a DISCRIMINATED UNION, not a bag of optional flags. The §1.1
 * engineering red-line is that a handler which assumes a capability exists
 * throws and loses its touch binding; a flag bag re-creates that hazard because
 * `behavior.revealMs` and `behavior.cta` would both be optional everywhere. With
 * a union, a `mode: 'ceremony'` card has no `labels` to read and a `mode:
 * 'decide'` card has no `revealMs` — the compiler refuses the mistake instead of
 * the runtime discovering it.
 *
 * Capability (pan/commit/clamp/flip/reveal) is data resolved BEFORE the gesture
 * is constructed, so no gesture handler ever branches on a card kind.
 */
import type { CardCapability } from "../gesture/capability";
import type { FeedCardV3 } from "./card-types";

export interface SwipeLabels {
	left: string;
	right: string;
}

interface BehaviorBase {
	capability: CardCapability;
	/**
	 * §1.8: undo is offered for listing / community / area only. An ask or
	 * trade-off swipe is already scope signal, and un-asking a question the user
	 * has seen is worse than living with the answer.
	 */
	undoable: boolean;
}

export type CardBehavior =
	/** Yes/no, like/pass, tell-me-more — red/green hints. */
	| (BehaviorBase & { mode: "decide"; labels: SwipeLabels })
	/**
	 * Two named options. `split` = the §1.6 visual mid-line with follow-the-finger
	 * brightening; an either-or ask uses the same labels without the split.
	 * NEVER ✓/✗ or yes/no copy on either side.
	 */
	| (BehaviorBase & { mode: "either-or"; labels: SwipeLabels; split: boolean })
	/**
	 * §1.6 challenge, redesigned 2026-07-27 (owner: "challenge卡做成选择按钮 选择之后
	 * 显示答案 并且提供一个explore的按钮进一步了解 也可以直接划走").
	 *
	 * The answer is chosen by TAPPING one of two buttons, not by swiping. The card
	 * then shows the answer and stays put until the buyer dismisses it — a swipe
	 * carries no verdict at all, it just moves on.
	 *
	 * The original design committed on swipe and froze the card mid-flight for
	 * 900ms. That coupling was the problem: a swipe is how you LEAVE a card, so
	 * using it to answer meant the answer could not be read without also being
	 * mid-exit. No `revealMs` here, because nothing is held.
	 */
	| (BehaviorBase & { mode: "quiz" })
	/** §1.6 insight: agree / disagree plus a third neutral pill. */
	| (BehaviorBase & {
			mode: "confirm";
			labels: SwipeLabels;
			neutralLabel: string;
	  })
	/** §1.5 milestone: never commits, explicit CTA only. */
	| (BehaviorBase & { mode: "ceremony"; cta: string });

/** §1.5 milestone drag cap — follows the finger, always springs back. */
export const MILESTONE_CAP_RATIO = 0.3;

const UNDOABLE: CardCapability = {
	pannable: true,
	commits: true,
	maxDisplacementRatio: 1,
	flippable: true,
};

/** Commits and flies out, but has no data face to flip to. */
const FLAT: CardCapability = { ...UNDOABLE, flippable: false };

export function cardBehavior(card: FeedCardV3): CardBehavior {
	switch (card.kind) {
		case "ask":
			return card.choice.form === "either-or"
				? {
						mode: "either-or",
						split: false,
						labels: {
							left: card.choice.left.label,
							right: card.choice.right.label,
						},
						capability: FLAT,
						undoable: false,
					}
				: {
						mode: "decide",
						labels: { left: "NO", right: "YES" },
						capability: FLAT,
						undoable: false,
					};

		case "area":
			return {
				mode: "decide",
				labels: { left: "NOT FOR ME", right: "TELL ME MORE" },
				capability: UNDOABLE,
				undoable: true,
			};

		case "listing":
		case "community":
			return {
				mode: "decide",
				labels: { left: "PASS", right: "LIKE" },
				capability: UNDOABLE,
				undoable: true,
			};

		case "tradeoff":
			return {
				mode: "either-or",
				split: true,
				labels: { left: card.left.label, right: card.right.label },
				capability: FLAT,
				undoable: false,
			};

		case "challenge":
			return {
				mode: "quiz",
				// Swiping a challenge is pure navigation, so it flies out like any
				// other card and records nothing. `flippable: false` — the answer is
				// revealed in place by the buttons, not on a back face.
				capability: FLAT,
				undoable: false,
			};

		case "insight":
			return {
				mode: "confirm",
				labels: { left: "NOT REALLY", right: "THAT'S ME" },
				neutralLabel: "Not sure",
				capability: FLAT,
				undoable: false,
			};

		case "milestone":
			return {
				mode: "ceremony",
				cta: "Keep going →",
				capability: {
					pannable: true,
					commits: false,
					maxDisplacementRatio: MILESTONE_CAP_RATIO,
					flippable: false,
				},
				undoable: false,
			};
	}
}

/**
 * Convenience for the label overlay. `undefined` when a swipe carries no
 * verdict — a ceremony (milestone) card never commits, and a quiz (challenge)
 * card is answered by its buttons, so a direction label on either would promise
 * a meaning the swipe does not have.
 */
export function swipeLabelsFor(card: FeedCardV3): SwipeLabels | undefined {
	const b = cardBehavior(card);
	return b.mode === "ceremony" || b.mode === "quiz" ? undefined : b.labels;
}
