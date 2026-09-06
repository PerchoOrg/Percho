/**
 * The swipe feed's ONE card frame — sized by the FILM's shape, not by a share
 * of the stage.
 *
 * ── The rule, and why it changed (owner pick "R3", 2026-09-05) ──────────────
 *
 * Until this date the frame was `stage × CARD_FRAME_RATIO` (0.83, last moved
 * 2026-08-23). That worked while the page above the card was fixed — a 44pt
 * wordmark row and one line of scope — because a constant share of a constant
 * stage is a constant rectangle, and 0.83 was chosen with the feed's `GUTTER`
 * to land the card on the tour canvas's 0.685 aspect.
 *
 * The feed header is no longer fixed: it carries the place (eyebrow, city,
 * stats, the community strip), so the stage's height now varies with content.
 * Under the old rule a taller header shrank the stage AND the card, and the
 * 17% of slack came back as a hole under it — the card would have shrunk
 * instead of the hole closing, which is the opposite of what the header is
 * for.
 *
 * So the frame is derived from what it draws. Both tour pipelines render a
 * 1080x1576 canvas; the card plays it `fit="cover"`. A card at exactly that
 * aspect crops nothing. Hence:
 *
 *     height = min(stage, width / CANVAS_ASPECT)
 *
 * The card is the film's shape whenever there is room, and never taller than
 * the stage it sits in. Widening the card still costs height, but now it does
 * so by construction rather than by two constants being kept in step by hand
 * (`theme/card-aspect.test.ts` used to guard exactly that pairing).
 *
 * ── What the cap means when it binds ────────────────────────────────────────
 *
 * On a short screen (the SE, or any phone once the header grows) the stage is
 * the binding constraint: the card comes out WIDER than 0.685 and `CardVideo`
 * crops the film's top and bottom instead of its sides. That is the trade the
 * owner rejected on 2026-09-05 for the tall-card option A2 — it is accepted
 * here only where the screen leaves no alternative, and the amount is visible
 * (`cardAspect` is exported so the test can measure it per device).
 *
 * This module is deliberately react-native-free so `theme/*.test.ts` can
 * compute the real card height from it (the mobile vitest suite imports no RN
 * runtime — see `vitest.config.ts`).
 */

/** The canvas both tour pipelines render, as `w / h`. */
export const CANVAS_ASPECT = 1080 / 1576;

/**
 * The card's height for a given stage and width.
 *
 * `stage` 0 means "not measured yet" (pre-layout), and returns 0 so the cards
 * land their real frame on the first laid-out frame rather than flashing a
 * wrong one.
 */
export function cardFrameHeight(stage: number, width: number): number {
	if (stage <= 0 || width <= 0) return 0;
	return Math.min(stage, width / CANVAS_ASPECT);
}

/** The resulting aspect (`w / h`) — 0.685 unless the stage capped the height. */
export function cardAspect(stage: number, width: number): number {
	const height = cardFrameHeight(stage, width);
	return height > 0 ? width / height : 0;
}
