/**
 * Slider value mapping (§2.4 #3's down-% and rate sliders).
 *
 * Pure, and separate from the component, because every bug a slider has is an
 * arithmetic bug at an edge: a thumb that can be dragged past the end, a step
 * that lands on 6.4999%, a track measured at 0 width on the first frame. Those
 * are invisible in a screenshot and trivial in a unit test.
 *
 * The model is deliberately DISCRETE. A continuous rate slider invites
 * "6.4831%", which reads as a precision the input (a weekly average) does not
 * have — see `assumptions.ts`.
 */

export interface SliderScale {
	min: number;
	max: number;
	/** Quantum the value snaps to. Must be > 0. */
	step: number;
}

/** Snaps a raw value into the scale: clamped to range, quantised to `step`. */
export function snapToScale(value: number, scale: SliderScale): number {
	const { min, max, step } = scale;
	if (!(step > 0)) return Math.min(Math.max(value, min), max);
	const clamped = Math.min(Math.max(value, min), max);
	const snapped = min + Math.round((clamped - min) / step) * step;
	// Re-clamp: the final step can overshoot `max` when the range is not an
	// exact multiple of `step` (e.g. 3–10% by 0.125 is fine, 0–35% by 4 is not).
	const bounded = Math.min(Math.max(snapped, min), max);
	// Float drift: 0.03 + 5 * 0.00125 lands on 0.036250000000000004, which then
	// prints as "3.63%" through a naive formatter. Round to a sane number of
	// decimals derived from the step's own magnitude.
	return roundToStep(bounded, step);
}

/**
 * Rounds to as many decimals as `step` itself has, so a 0.00125 step yields 5
 * decimals and a 0.05 step yields 2 — no more, so the drift above cannot survive.
 */
function roundToStep(value: number, step: number): number {
	const decimals = Math.min(
		10,
		Math.max(0, Math.ceil(-Math.log10(step)) + 2),
	);
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

/**
 * Track x-offset (px, from the track's left edge) → snapped value.
 *
 * `trackWidth <= 0` returns `min` rather than NaN: the first frame of a track
 * has no measured width, and a NaN would propagate into the payment and render
 * "$NaN/mo" — the exact failure mode `computeMonthly`'s zero-rate branch exists
 * to avoid.
 */
export function valueForOffset(
	offsetPx: number,
	trackWidth: number,
	scale: SliderScale,
): number {
	if (!(trackWidth > 0)) return scale.min;
	const ratio = Math.min(Math.max(offsetPx / trackWidth, 0), 1);
	return snapToScale(scale.min + ratio * (scale.max - scale.min), scale);
}

/** Value → 0–1 fill fraction, for the thumb position and the filled bar. */
export function fractionForValue(value: number, scale: SliderScale): number {
	const span = scale.max - scale.min;
	if (!(span > 0)) return 0;
	return Math.min(Math.max((value - scale.min) / span, 0), 1);
}

/**
 * §2.4 #3's two scales.
 *
 * Down payment 0–50%: 0 covers a VA/USDA no-down buyer, and past ~50% the
 * payment curve is flat enough that more range buys nothing. Step 1% because
 * the label prints whole percent.
 *
 * Rate 3–10% in eighths (0.125%) — eighths are how mortgage rates are actually
 * quoted, so every reachable position on this slider is a rate a lender could
 * hand the buyer. A 0.01% step would let them land on numbers that do not exist
 * in the market.
 */
export const DOWN_SCALE: SliderScale = { min: 0, max: 0.5, step: 0.01 };
export const RATE_SCALE: SliderScale = { min: 0.03, max: 0.1, step: 0.00125 };
