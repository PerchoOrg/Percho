/**
 * Which `contentFit` a piece of card media should use, from its REAL size.
 *
 * ── The two rules, and why one function has to hold both ─────────────────────
 *
 * Owner's standing rule (2026-07-27, stated twice): 「横屏视频只横向占满不要纵向
 * 拉伸 不要 zoom in」 — a LANDSCAPE source fills the card's width, letterboxed
 * top and bottom, never cropped and never magnified.
 *
 * Owner, 2026-08-02: 「视频宽度不够 没有占满card 有黑色空隙」 — the community
 * card's PORTRAIT video was leaving vertical black bands down both sides.
 *
 * Both are true at once, and `contain` only satisfies the first. The community
 * cover is rendered 1080×1920 (aspect 0.5625) and the card is 2:3 (0.667): the
 * source is NARROWER than the frame, so `contain` fits its height and pillarboxes
 * it. `cover` fills, and the only thing it discards is ~15.6% of the source's
 * HEIGHT — a Ken Burns pan has slack there, and the owner asked for a full card
 * face.
 *
 * So the rule that covers both:
 *
 *   source WIDER than the frame (landscape in a tall card)  → `contain`
 *       cropping would eat the width, where the subject is. Bands are correct.
 *   source NARROWER than or equal to the frame              → `cover`
 *       fills the card, crops only top/bottom.
 *
 * ── Unknown size is `contain`, deliberately ─────────────────────────────────
 *
 * A card can render before the player reports a track size. Defaulting to
 * `cover` there would flash a zoomed-in crop of a landscape video for a frame,
 * which is the bug this file's history is made of (see `CardVideo`'s header: an
 * earlier attempt read a field that did not exist, so the size was NEVER learned
 * and every card silently kept `cover`). `contain` is the safe unknown: it can
 * look letterboxed for a beat, it can never crop.
 *
 * ── Tolerance ───────────────────────────────────────────────────────────────
 *
 * A 1080×1900 source in a 9:16 frame is ~1% off. Without slack it would take the
 * `contain` branch and paint two hairline bands, which reads as a rendering
 * fault. 5% is the same tolerance the card's photo path uses.
 */

/** The card's own aspect is `width / height`, measured, not the layout constant. */
export const FIT_TOLERANCE = 0.05;

export type MediaFit = "contain" | "cover";

export interface MediaSize {
	width: number;
	height: number;
}

/**
 * `contain` for a source wider than the frame, `cover` otherwise.
 *
 * @param source  the media's real pixel size, or `null` when not yet known.
 * @param frameAspect  the card's REAL `width / height` — not `CARD_ASPECT`,
 *   which is inverted and is also clamped by the viewport on short phones.
 */
export function mediaFit(
	source: MediaSize | null | undefined,
	frameAspect: number,
): MediaFit {
	if (!source || source.width <= 0 || source.height <= 0) return "contain";
	if (!Number.isFinite(frameAspect) || frameAspect <= 0) return "contain";
	const sourceAspect = source.width / source.height;
	// Wider than the frame by more than the tolerance → letterbox it.
	if (sourceAspect > frameAspect * (1 + FIT_TOLERANCE)) return "contain";
	return "cover";
}
