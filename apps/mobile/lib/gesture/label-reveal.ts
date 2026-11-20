/**
 * §1.8 label reveal — when a direction label is allowed to be visible.
 *
 * This exists as its own pure function because of a device bug that no amount of
 * looking at the component would have surfaced: `tx` is UI-thread state and it
 * survives a React remount of the label. Whenever the top card changed for a
 * reason other than a completed swipe (a deck rebuild, an undo, a tap-driven
 * advance), the labels remounted while `tx` still held the previous gesture's
 * offset — so a label painted at full opacity on a card the buyer had never
 * touched, for the frame or two until something zeroed the offset. On device that
 * read as a white word flashing past and vanishing.
 *
 * The rule: a label is inert until the drag has been seen at rest at least once
 * since it mounted. After that it tracks the drag normally. That makes a reveal
 * provably attributable to a gesture that began under the card now showing it.
 */

import { SWIPE_THRESHOLD_RATIO } from "./decide-swipe";

/**
 * Offsets under this are "at rest". Not zero: a spring settling toward 0 and a
 * finger held almost still both leave sub-pixel residue on the shared value, and
 * requiring exact zero would leave a label armed only by luck.
 */
export const REST_EPSILON = 0.5;

export interface LabelOpacityInput {
	/** Live drag offset. */
	tx: number;
	/** Displacement at which the label reaches full strength (35% of the card). */
	span: number;
	/** Which label: `right` reveals on positive drag, `left` on negative. */
	side: "left" | "right";
	/** Whether rest has already been observed since mount. */
	armed: boolean;
}

export interface LabelOpacityResult {
	opacity: number;
	/** The latch, after this frame. Caller persists it. Never returns to false. */
	armed: boolean;
}

export function labelOpacity({
	tx,
	span,
	side,
	armed,
}: LabelOpacityInput): LabelOpacityResult {
	"worklet";
	// Not yet armed: stay invisible until the drag comes to rest. Arming happens
	// the moment it does, so the very same gesture that starts from rest reveals
	// normally — the guard costs the buyer nothing.
	if (!armed) {
		if (Math.abs(tx) > REST_EPSILON) return { opacity: 0, armed: false };
		return { opacity: 0, armed: true };
	}

	if (span <= 0) return { opacity: 0, armed: true };

	const signed = side === "right" ? tx : -tx;
	if (signed <= 0) return { opacity: 0, armed: true };
	return { opacity: Math.min(signed / span, 1), armed: true };
}

/**
 * Where the verdict mark starts and finishes appearing, as a share of the way
 * to the commit threshold.
 *
 * The start is not zero so that a thumb resting on the card, or the first
 * points of a drag that turns out to be vertical, does not flicker a faint
 * mark. It is fully there by 45% so the buyer reads the verdict long before
 * the release that commits it.
 */
export const VERDICT_MARK_FROM = 0.15;
export const VERDICT_MARK_FULL = 0.45;
/** The colour wash over the whole card at the commit threshold. */
export const VERDICT_WASH_MAX = 0.45;
/** The mark's scale when it first appears; it reaches 1 at the threshold. */
export const VERDICT_MARK_MIN_SCALE = 0.6;

export interface VerdictVisual {
	/** Opacity of the card-wide colour wash. */
	wash: number;
	markOpacity: number;
	markScale: number;
	/** At the commit threshold: releasing now decides. The mark fills in. */
	locked: boolean;
}

/**
 * What the swipe verdict looks like at `progress` — the armed, one-sided value
 * `labelOpacity` returns (0 at rest, 1 at the commit threshold).
 */
export function verdictVisual(progress: number): VerdictVisual {
	"worklet";
	const p = Math.max(0, Math.min(1, progress));
	const appear = Math.max(
		0,
		Math.min(
			1,
			(p - VERDICT_MARK_FROM) / (VERDICT_MARK_FULL - VERDICT_MARK_FROM),
		),
	);
	return {
		wash: p * VERDICT_WASH_MAX,
		markOpacity: appear,
		markScale: VERDICT_MARK_MIN_SCALE + (1 - VERDICT_MARK_MIN_SCALE) * p,
		locked: p >= 1,
	};
}

/**
 * How far the swipe-hint carries the card each way, as a share of the way to
 * the commit threshold. Far enough that the mark is fully drawn and nearly full
 * size; short of 1 on purpose — the lock means "letting go now decides", and a
 * demonstration decides nothing.
 */
export const HINT_REACH = 0.8;

/** The swipe-hint's offset in points for a card `cardWidth` wide. */
export function hintReach(cardWidth: number): number {
	return Math.max(0, cardWidth) * SWIPE_THRESHOLD_RATIO * HINT_REACH;
}
