/**
 * Media fit for a card face — how a video or photo of ANY aspect ratio sits in
 * the 9:16-ish card (`02-listing.md` / §0.7).
 *
 * The problem, from the owner on device (2026-07-27):
 *
 *   "我知道现在视频都是横屏的 没有竖屏的 因为照片都是横屏的 listing card 要能同时
 *    支持竖屏和横屏视频或者照片 对于横屏视频宽度要占满 listing card 上下可以不用占满"
 *
 * Everything shipped with `contentFit="cover"`, which fills the card by CROPPING.
 * On a 16:9 source in a ~9:16 frame that throws away roughly two thirds of the
 * width — for a home video (kitchen, yard, street) the subject is usually IN that
 * discarded region, so the card shows a meaningless slice.
 *
 * The rule, stated in the owner's terms:
 *   - PORTRAIT source (taller than the card) → fill the card. `cover`. Cropping a
 *     little off the top/bottom of an already-vertical video is invisible.
 *   - LANDSCAPE source (wider than the card) → **full WIDTH, letterboxed
 *     vertically.** Nothing is cropped; the card simply is not covered top to
 *     bottom, which the owner explicitly allowed.
 *
 * Landscape needs a backdrop behind the letterbox, and the card face is always
 * dark (§0.3 invariant), so the letterbox band is a dark fill rather than the
 * paper background — a light band on a dark card reads as a rendering fault.
 */

/**
 * The SOURCE's own shape, independent of the card. Kept separate from the fit
 * decision because the two are genuinely different questions: a 1000x1000 photo
 * is `square` as a source, but in a 9:16 card it is WIDER than the frame and so
 * takes the letterbox path. An earlier draft collapsed them and mislabelled both.
 */
export type Orientation = "portrait" | "landscape" | "square";

export interface MediaSize {
	width: number;
	height: number;
}

export interface MediaFit {
	orientation: Orientation;
	/**
	 * True when the source is wider than the CARD and therefore letterboxed —
	 * which is not the same as `orientation === "landscape"`. A square source in a
	 * tall card is letterboxed too.
	 */
	widerThanCard: boolean;
	/** What to pass to `contentFit` / `resizeMode`. */
	contentFit: "cover" | "contain";
	/**
	 * Aspect ratio to give the media box when letterboxing, or undefined when the
	 * media fills the card. RN's `aspectRatio` style is width/height.
	 */
	boxAspectRatio?: number;
	/** True when the card will show letterbox bands above and below. */
	letterboxed: boolean;
}

/**
 * Sources within this ratio of the card's own aspect are treated as filling it.
 *
 * Without a tolerance a 1080x1900 video in a 1080x1920 card would be classed
 * landscape and letterboxed by ~1%, producing two hairline dark bands that look
 * like a bug rather than a deliberate frame.
 */
export const FILL_TOLERANCE = 0.05;

/** The source's own shape, independent of the card. */
function orientationOf(source: MediaSize): Orientation {
	const ratio = source.width / source.height;
	if (Math.abs(ratio - 1) <= FILL_TOLERANCE) return "square";
	return ratio > 1 ? "landscape" : "portrait";
}

/**
 * Decides the fit. `cardAspect` is the card's own width/height, so this adapts to
 * the device rather than assuming 9:16 — the card is sized from the window in
 * `feed.tsx`, and on an iPad it is nowhere near 9:16.
 */
export function mediaFit(
	source: MediaSize | undefined,
	cardAspect: number,
): MediaFit {
	// Unknown dimensions (video metadata not in yet, photo not measured): fill.
	// `cover` is the safe default because it never leaves an empty frame, and the
	// real fit is applied a moment later once the size is known.
	if (
		!source ||
		!Number.isFinite(source.width) ||
		!Number.isFinite(source.height) ||
		source.width <= 0 ||
		source.height <= 0
	) {
		return {
			orientation: "portrait",
			widerThanCard: false,
			contentFit: "cover",
			letterboxed: false,
		};
	}

	const sourceAspect = source.width / source.height;
	const ratio = sourceAspect / cardAspect;
	const orientation = orientationOf(source);

	// Close enough to the card's shape: fill it, no bands.
	if (Math.abs(ratio - 1) <= FILL_TOLERANCE) {
		return {
			orientation,
			widerThanCard: false,
			contentFit: "cover",
			letterboxed: false,
		};
	}

	// Taller than the card (portrait): fill, cropping a little vertically.
	if (sourceAspect < cardAspect) {
		return {
			orientation,
			widerThanCard: false,
			contentFit: "cover",
			letterboxed: false,
		};
	}

	// Wider than the card (landscape): full width, letterboxed. This is the case
	// every video and photo in production is actually in today.
	return {
		orientation,
		widerThanCard: true,
		contentFit: "contain",
		boxAspectRatio: sourceAspect,
		letterboxed: true,
	};
}

/** True when a source is wider than the card and so needs the letterbox path. */
export function isLandscapeInCard(
	source: MediaSize | undefined,
	cardAspect: number,
): boolean {
	return mediaFit(source, cardAspect).widerThanCard;
}
