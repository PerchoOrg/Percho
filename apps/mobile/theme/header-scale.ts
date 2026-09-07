/**
 * The above-card header's one scale factor (phase183.4).
 *
 * ── Why the header scales at all ────────────────────────────────────────────
 *
 * The owner approved the header's proportions off a demo drawn at **390pt**
 * (`percho.co/demos/feed-header-v4`), and what he approved was a RATIO:
 * 「community name和map占的比例参考demo … 如果需要可以等比例放大一些在不同的
 * 设备上」. With absolute sizes that ratio only holds at 390 — the name and the
 * Map pill fill 92% of the row there, 83% on his 428, and the two stop reading
 * as one line. Multiplying every number in the header by `width / 390` holds
 * the picture still and lets it grow.
 *
 * The clamp is the whole reason this is a function rather than a division:
 * unbounded, a future 6.9" phone (or an iPad in compatibility width) would
 * carry a 50pt serif over a 60pt row, and the SE-class 375 would shave the
 * type below what the 13pt context line can sit under. 0.94–1.10 covers every
 * shipping iPhone (375 → 0.962, 440 → 1.10) and turns anything wider into
 * "the biggest phone" rather than a new design.
 *
 * Deliberately react-native-free so `theme/*.test.ts` can execute it — the
 * mobile vitest suite loads no RN runtime (see `vitest.config.ts`), and
 * `theme/card-aspect.test.ts` needs this to model the header's real height per
 * device before it can measure what the card has left.
 */

/** The width the header's numbers were drawn at. */
export const HEADER_BASE_WIDTH = 390;

export const HEADER_SCALE_MIN = 0.94;
export const HEADER_SCALE_MAX = 1.1;

/**
 * The factor every header dimension is multiplied by, for a screen `width`.
 *
 * Rounded to three places so a re-render at the same width cannot produce a
 * hair-different sheet, and so the value in a test reads like the value in a
 * screenshot.
 */
export function headerScale(width: number): number {
	if (!(width > 0)) return 1;
	const raw = width / HEADER_BASE_WIDTH;
	const clamped = Math.min(HEADER_SCALE_MAX, Math.max(HEADER_SCALE_MIN, raw));
	return Math.round(clamped * 1000) / 1000;
}
