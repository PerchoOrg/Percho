/**
 * When a photo is framed badly enough to be worth reframing for the 9:16
 * canvas, and where to crop it first.
 *
 * A community tour renders 1080x1920, and the centre crop was discarding a
 * median 63% of every frame — on Aberdeen's clubhouse it removed the stone
 * tower and left a tree as the subject. Resolution was never the problem
 * (median source 4000x3024); the aspect ratio was.
 *
 * Policy only. The job itself runs in `scripts/render-worker/worker.py`, next
 * to the enhance pass it stacks with — outpaint reframes and returns 768x1376,
 * then Real-ESRGAN takes that to the canvas. The prompt and the per-category
 * fill hints live there too, so there is one copy of them.
 *
 * Known limitation, accepted by the owner 2026-08-19 after reviewing outputs:
 * the model re-renders rather than strictly extends. Measured drift from the
 * source was 7.4/255 on a landscape subject but 35/255 on a shopfront, where a
 * secondary door sign came back rewritten. Strongest on landscape, weakest on
 * text.
 */

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

/**
 * Below this a photo is already close enough to 9:16 to use as-is.
 *
 * 0.35 sits between a 4:5 portrait (0.30 — fine) and a square (0.44 — worth
 * fixing). A 3:4 portrait loses 0.25 and passes straight through, which is the
 * "already in a good shape" case.
 */
export const OUTPAINT_MIN_CROP_LOSS = 0.35;

export const OUTPAINT_MODEL = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-3.1-flash-image';

/** Fraction of the frame a 9:16 centre crop throws away. */
export function cropLoss(widthPx: number, heightPx: number): number {
  if (!(widthPx > 0) || !(heightPx > 0)) return 0;
  const aspect = widthPx / heightPx;
  const target = CANVAS_W / CANVAS_H;
  return aspect > target ? 1 - target / aspect : 1 - aspect / target;
}

export function needsOutpaint(widthPx: number, heightPx: number): boolean {
  return cropLoss(widthPx, heightPx) > OUTPAINT_MIN_CROP_LOSS;
}

/**
 * Crop to 3:4 around a horizontal focus point, using real pixels only.
 *
 * This is step one, and the reason the two-step approach works: it leaves the
 * model only ~25% of the frame to invent rather than 74%.
 *
 * `focusX` is 0..1 across the source. Centre is the default and is
 * demonstrably wrong sometimes — the Aberdeen clubhouse tower sits at x≈0.76
 * and a centred crop loses it — but the Curator emits no subject bbox, so the
 * worker passes 0.5 until one exists. Keeping the parameter here documents the
 * gap rather than hiding it.
 */
export function cropWindowFor(
  widthPx: number,
  heightPx: number,
  focusX = 0.5,
): { left: number; top: number; width: number; height: number } {
  const targetW = Math.min(widthPx, Math.round((heightPx * 3) / 4));
  const centre = Math.round(widthPx * focusX);
  const left = Math.max(0, Math.min(widthPx - targetW, centre - Math.round(targetW / 2)));
  return { left, top: 0, width: targetW, height: heightPx };
}

/**
 * The actual job runs in scripts/render-worker/worker.py, next to the enhance
 * pass it stacks with: same queue shape, same storage plumbing, and Pillow for
 * the crop that Node has no way to do without a new image dependency. This
 * module is the policy — what counts as badly framed, and where to aim the
 * crop — so the gate is unit-testable and shared with the shot list.
 */
