/**
 * The Explore photo gallery's data layer — captions for the FULL photo set.
 *
 * ── Why this exists (2026-08-01) ─────────────────────────────────────────────
 *
 * The listing tour video used to burn a caption band into every clip. The owner
 * pulled it for immersion ("不够沉浸") and gave the words a new home:
 *
 *   "点击explore可以浏览所有照片 包括视频里没有的 这时候再配上字幕详细解读"
 *
 * Three requirements in that sentence, and each one is a constraint here:
 *
 * 1. **所有照片** — every `listing_photos` row, not the 8–14 the shot planner
 *    picked. The video is a highlight reel BY DESIGN (`photo_selector`
 *    dedups near-duplicates and trims by quota); the gallery is the archive.
 *    So this module never consults the shot plan and never filters by
 *    `hero_score`. Order is `sort_order`, which is what the DTO already sorts by.
 * 2. **配上字幕** — a caption per photo, from `ai_tags.caption` (the same vision
 *    output the video band used to print) plus a room-type kicker.
 * 3. **详细解读** — the caption may be LONGER here than it was on the video.
 *    On a 1080-wide clip flashing past in 1.7s the copy had to fit one line;
 *    on a photo the buyer chose to stop on, the whole sentence can breathe.
 *    Nothing is truncated in this module — the component decides line count.
 *
 * ── What is NOT invented ────────────────────────────────────────────────────
 *
 * A photo with no `ai_tags` yields `{ caption: undefined }` and the component
 * renders NO band over it — not "Photo 4 of 22", not the address, not a room
 * guess from the filename. Today that is the common case: `ai_tags` is populated
 * for the 10 hand-tagged listings and zero of the 104 `fmls-import` rows the feed
 * serves (see `app/listing/[id].tsx`'s header note). A gallery that captions
 * everything by falling back to generated copy would be lying on 104 listings to
 * look complete on 10.
 */

import type { DetailPhotoDTO } from "./detail-dto";
import { HOTSPOT_ROOMS } from "./hotspot";

/** One slide. `caption`/`kicker` are present only when the vision layer ran. */
export interface GallerySlide {
	id: string;
	url: string;
	/** ALL-CAPS room label, e.g. "KITCHEN". Absent when `room_type` is unusable. */
	kicker?: string;
	/** The vision layer's factual sentence. Absent when untagged. */
	caption?: string;
}

/**
 * Room labels the gallery will print. Reuses `HOTSPOT_ROOMS` rather than keeping
 * a second vocabulary: the same photo must not be "Kitchen" on a hotspot pin and
 * "Cooking Area" three pixels away in the gallery band.
 *
 * Unlike `buildHotspot`, a room OUTSIDE this list is not fatal here — the slide
 * still renders, just with no kicker. `hallway` is a bad section-nav chip but a
 * perfectly real photo, and dropping it would violate requirement 1 (所有照片).
 */
const ROOM_LABELS = new Set<string>(HOTSPOT_ROOMS);

/** "primary_bedroom" → "PRIMARY BEDROOM". Returns undefined when not printable. */
export function kickerForRoom(
	roomType: string | null | undefined,
): string | undefined {
	const room = roomType?.trim().toLowerCase().replace(/_/g, " ");
	if (!room) return undefined;
	// A multi-word tagger value ("primary bedroom") is kept whole, but its HEAD
	// noun must be a known room so a hallucinated `room_type` can't print itself
	// as an authoritative label.
	const head = room.split(" ").at(-1);
	if (!head || !ROOM_LABELS.has(head)) return undefined;
	return room.toUpperCase();
}

/**
 * The full photo set as slides, in DTO order.
 *
 * Deliberately NOT filtered by `tags.usable`. The tagger marks a photo unusable
 * for VIDEO (blurry, a floorplan scan, a duplicate) — that is a rendering
 * judgement, not a "the buyer may not see this" judgement, and `buildHotspot`
 * dropping such photos is about not putting a PIN on them. A buyer browsing the
 * archive should still see the floorplan; it just gets no caption band.
 */
export function buildGallerySlides(
	photos: readonly DetailPhotoDTO[],
): GallerySlide[] {
	return photos.map((p) => {
		const caption = p.tags?.caption?.trim();
		const kicker = kickerForRoom(p.tags?.room_type);
		return {
			id: p.id,
			url: p.url,
			...(kicker ? { kicker } : {}),
			...(caption ? { caption } : {}),
		};
	});
}

/** "4 / 22". 1-indexed, `tabular-nums` at the call site so it doesn't jitter. */
export function slideCounter(index: number, total: number): string {
	return `${index + 1} / ${total}`;
}

/**
 * How many slides carry a caption. The gallery header uses this to decide
 * whether to advertise captions at all: on an untagged listing every band is
 * absent, and a "swipe for details" hint would be promising something the data
 * cannot deliver.
 */
export function captionedCount(slides: readonly GallerySlide[]): number {
	return slides.filter((s) => s.caption !== undefined).length;
}
