/**
 * When each part of the launch animation happens, in ms from its first frame
 * (owner pick "B", off `/demos/launch-animation-v1`: the roof draws itself, a
 * pen traces the bird, the colour comes in, the eye appears).
 *
 * The numbers are the demo's. Kept apart from the component so the order and
 * the ceiling can be asserted without a renderer.
 */
export const LAUNCH_TIMELINE = {
	roof: { start: 150, duration: 700 },
	outline: { start: 800, duration: 1000 },
	fill: { start: 1750, duration: 400 },
	eye: { start: 2050, duration: 300 },
	/** The drawing is finished and has been seen. */
	end: 2600,
	/** The cross-fade from the finished mark to the app. */
	fadeOut: 350,
} as const;

/**
 * The launch layer leaves by this time whatever has or has not happened —
 * drawing, first card, anything. A launch screen that cannot leave is a dead app.
 */
export const LAUNCH_MAX_MS = 5000;

/** With Reduce Motion on, the finished mark is shown for this long instead. */
export const LAUNCH_STILL_MS = 600;
