/**
 * Paging the deck sideways (phase414): where a card is drawn, how far a drag
 * moves it, and which way a release turns the page.
 *
 * Until phase414 a swipe was a VERDICT — right liked the card, left passed it,
 * and the card flew out for good. Owner, 2026-11-27: 「左右滑不好使 … 滑走不一定
 * 不喜欢」. A swipe now only BROWSES: left is the next card, right is the one
 * before, and liking is the heart (`/demos/feed-home-v1`, his answers: 「左右 /
 * 一次一部 / 要x」).
 *
 * ## Still a pure function of an ABSOLUTE position
 *
 * The rule `stack-layer.ts` was built around survives the mechanic it served:
 * a card's index in the deck never changes, so what this returns for a given
 * card is identical before and after React re-renders. The page turn ends on
 * the UI thread — the cursor moves by one and the drag is zeroed in the SAME
 * worklet — and because
 *
 *     x = (index - cursor) * pitch + drag
 *
 * moving the cursor by `step` while the drag goes from `-step * pitch` to 0
 * leaves every card exactly where it was. React's own index catches up a frame
 * or two later and changes only which cards are mounted. `page-layer.test.ts`
 * asserts that identity.
 */
import type { SwipeDecision } from "./decide-swipe";

/** One card on (1) or one card back (-1). */
export type PageStep = 1 | -1;

/** How much of a pull follows the finger when there is no card to go back to. */
export const EDGE_RESISTANCE = 0.25;

/** A card's x: its distance from the cursor in whole cards, plus the drag. */
export function cardPageX(rel: number, dragX: number, pitch: number): number {
	"worklet";
	return rel * pitch + dragX;
}

/**
 * The drag the cards actually follow. Pulling back with nothing before the
 * card — the first of a visit, or the one after a hidden card — gives a
 * quarter of the way, so the edge can be felt rather than hit.
 */
export function pageDrag(translationX: number, canGoBack: boolean): number {
	"worklet";
	return translationX > 0 && !canGoBack
		? translationX * EDGE_RESISTANCE
		: translationX;
}

/** Which way a release turns the page; 0 springs back. */
export function pageStep(
	decision: SwipeDecision,
	canGoBack: boolean,
): PageStep | 0 {
	"worklet";
	if (decision === "left") return 1;
	if (decision === "right" && canGoBack) return -1;
	return 0;
}
