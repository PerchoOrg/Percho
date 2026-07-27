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
