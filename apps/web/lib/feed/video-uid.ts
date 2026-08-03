/**
 * Which `listing_videos` uid a surface should play.
 *
 * The row carries up to three renders of the same tour, one per output shape:
 *
 *   cf_video_id            9:16 portrait  (never populated in production)
 *   cf_video_id_landscape  16:9           (web cards)
 *   cf_video_id_square     1:1            (mobile feed card's media block)
 *
 * Every surface preferring the shape it actually displays, with a fallback chain
 * so a listing rendered before that shape existed still plays *something* rather
 * than nothing.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 *
 * 2026-08-03, 5122 Lower Creek Street: the render worker had been square-only
 * since 2026-07-28, but the two web loaders (`lib/feed/browse-cards.ts`,
 * `lib/listing-feed/load.ts`) resolved `cf_video_id ?? cf_video_id_landscape`
 * and did not even SELECT the square column. A square-only listing therefore had
 * no uid web could read and the video silently did not play — while the same
 * listing played fine on iOS. The fallback lived inline at five call sites, so
 * adding a column meant remembering all five. It now lives here, once.
 */

type UidRow = {
  cf_video_id?: string | null;
  cf_video_id_landscape?: string | null;
  cf_video_id_square?: string | null;
};

/**
 * Uid for a WEB card (16:9 / 9:16 player).
 *
 * Landscape first — that is the shape web draws. Square is the last resort
 * because a 1:1 asset in a web card letterboxes, which still beats a dead card.
 */
export function webVideoUid(row: UidRow | null | undefined): string | null {
  if (!row) return null;
  return row.cf_video_id ?? row.cf_video_id_landscape ?? row.cf_video_id_square ?? null;
}

/**
 * Uid for the MOBILE feed card (1:1 media block).
 *
 * Square first, so nothing is cropped or letterboxed. See
 * `lib/feed/vertical-videos.ts`, which is the only caller.
 */
export function mobileVideoUid(row: UidRow | null | undefined): string | null {
  if (!row) return null;
  return row.cf_video_id_square ?? row.cf_video_id ?? row.cf_video_id_landscape ?? null;
}

/** True when a row has any playable render at all. */
export function hasAnyVideoUid(row: UidRow | null | undefined): boolean {
  return webVideoUid(row) !== null;
}
