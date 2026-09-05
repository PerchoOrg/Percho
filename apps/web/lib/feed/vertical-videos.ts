/**
 * Hero videos for the mobile feed, and WHICH video belongs on which card.
 *
 * ── The bug this file exists to prevent ─────────────────────────────────────
 *
 * Owner, on device (2026-07-27): "我看到这两条房子的视频了 第一帧是房子 后面变成了
 * community的照片了".
 *
 * Exactly right, and the cause is content semantics, not playback. An earlier
 * version of this module treated every `generated_videos` row with a
 * `listing_id` as that listing's hero. But those rows are **NEARBY / POI**
 * videos: `scope = 'listing_intent_bucket'` means "things around this home,
 * grouped by intent" (`outdoor`, `schools`, `dining`, `shopping`,
 * `daily_errands`…), and their frames come from **`poi_photos`** — Google Places
 * imagery of parks, schools and shops. Verified: all 15 ready rows have
 * `input_photo_ids` with **zero** overlap with `listing_photos`; the first id on
 * the 5122 Lower Creek video resolves to a `nature_preserve` POI.
 *
 * So the card opened on the listing's own cover photo and then cut to the
 * neighbourhood — a listing card advertising a nature preserve.
 *
 * ── The rule now ────────────────────────────────────────────────────────────
 *
 *   LISTING hero  ← `listing_videos` (`kind = 'walkthrough'`, "Home tour").
 *                   These are the only videos actually built from the home's own
 *                   photos. In production they are LANDSCAPE only
 *                   (`cf_video_id` is NULL on every row, `cf_video_id_landscape`
 *                   is set), which is fine now that the card letterboxes
 *                   landscape media properly (`apps/mobile/lib/media/fit.ts`).
 *   COMMUNITY hero ← `generated_videos` with `scope = 'community_intent_bucket'`.
 *                   Neighbourhood footage on a neighbourhood card is correct.
 *
 * `listing_intent_bucket` rows are deliberately NOT used as any card's hero.
 * They are legitimate content — the "Nearby" rail on web `/browse` — but they
 * belong to a listing's *surroundings*, not to the listing.
 */

import { type TourSegment, tourSegments } from '@/lib/feed/tour-segments';
import { mobileVideoUid } from '@/lib/feed/video-uid';
import { createServiceClient } from '@/lib/supabase/server';

const CF_STREAM_BASE = 'https://videodelivery.net';

/** HLS manifest for a Cloudflare Stream uid. */
export function streamManifestUrl(uid: string): string {
  return `${CF_STREAM_BASE}/${uid}/manifest/video.m3u8`;
}

/** Poster frame, used when a listing has video but no usable photo. */
export function streamPosterUrl(uid: string): string {
  return `${CF_STREAM_BASE}/${uid}/thumbnails/thumbnail.jpg?time=1s`;
}

type ListingVideoRow = {
  listing_id: string;
  cf_video_id: string | null;
  cf_video_id_landscape: string | null;
  cf_video_id_square: string | null;
  sort_order: number | null;
};

type GeneratedVideoRow = {
  community_id: string | null;
  cf_stream_uid: string | null;
  created_at: string;
};

/** A `tour_assemblies` row: a bucket video plus the shot list it was cut from. */
type AssemblyRow = GeneratedVideoRow & { ordered_clips: unknown };

export interface HeroVideoIndex {
  /** listing id → stream uid of that home's OWN tour. */
  byListing: Map<string, string>;
  /** community id → stream uid of that neighbourhood's video. */
  byCommunity: Map<string, string>;
  /**
   * community id → one entry per PLACE in that neighbourhood's film, for the
   * card's dashed progress bar.
   *
   * Only ever populated from `tour_assemblies`, and only for the assembly whose
   * uid actually WON above: it is the one source that records what the film is
   * made of. A community playing an older `generated_videos` bucket video is
   * absent here and the card draws a plain bar — the right answer, since we do
   * not know that video's structure and must not invent one.
   */
  segmentsByCommunity: Map<string, TourSegment[]>;
}

/**
 * Hero video per listing and per community, from the two correct sources.
 *
 * Unfiltered by id: 10 listing_videos rows and 15 generated_videos rows exist in
 * total, so this is two small queries. Revisit when either table reaches a few
 * hundred rows.
 */
export async function fetchVerticalVideos(): Promise<HeroVideoIndex> {
  const supabase = createServiceClient();

  const [listingRes, communityRes, assemblyRes] = await Promise.all([
    supabase
      .from('listing_videos')
      .select('listing_id, cf_video_id, cf_video_id_landscape, cf_video_id_square, sort_order')
      .eq('status', 'ready')
      .eq('kind', 'walkthrough')
      // NO approval gate: a finished render goes live on iOS and web
      // immediately (owner 2026-08-03 — the manual approve step was removed).
      // `status='ready'` (set by the worker / CF webhook) is the only gate.
      .order('sort_order', { ascending: true }),
    supabase
      .from('generated_videos')
      .select('community_id, cf_stream_uid, created_at')
      .eq('status', 'ready')
      .eq('scope', 'community_intent_bucket')
      .order('created_at', { ascending: false }),
    // Owner 2026-08-17: the assembled community tour (ffmpeg concat of the
    // Selected Photos clips) IS the community's video — it takes priority over
    // the older bucket videos when it's ready.
    supabase
      .from('tour_assemblies')
      .select('community_id, cf_stream_uid, created_at, ordered_clips')
      .eq('status', 'ready')
      .order('created_at', { ascending: false }),
  ]);

  const byListing = new Map<string, string>();
  const byCommunity = new Map<string, string>();
  const segmentsByCommunity = new Map<string, TourSegment[]>();

  // A video is an enhancement, not the card. A failed read must not take the
  // whole feed down — the cards still render with photos.
  if (!listingRes.error) {
    for (const row of (listingRes.data ?? []) as ListingVideoRow[]) {
      // 2026-07-28: SQUARE first. The feed card's media block is 1:1, so a 1:1
      // render lands in it with nothing cropped and nothing letterboxed. Falls
      // back to portrait, then landscape, so listings without a square render
      // keep playing (the card just letterboxes them as before).
      // 2026-08-03: same chain, now in `lib/feed/video-uid.ts` so web and mobile
      // preferences live next to each other and adding a column touches one file.
      const uid = mobileVideoUid(row) ?? undefined;
      if (!uid) continue;
      if (!byListing.has(row.listing_id)) byListing.set(row.listing_id, uid);
    }
  }

  if (!communityRes.error) {
    for (const row of (communityRes.data ?? []) as GeneratedVideoRow[]) {
      if (!row.cf_stream_uid || !row.community_id) continue;
      // Newest first from the query, so the first write per key wins.
      if (!byCommunity.has(row.community_id)) {
        byCommunity.set(row.community_id, row.cf_stream_uid);
      }
    }
  }

  // Assembled tour wins over bucket videos (owner 2026-08-17): the assembly IS
  // the community's final video. Query is newest-first, so the LAST write per
  // key is the OLDEST — keep the FIRST (latest), then overwrite bucket values.
  if (!assemblyRes.error) {
    const byCommunityLatest = new Map<string, string>();
    for (const row of (assemblyRes.data ?? []) as AssemblyRow[]) {
      if (!row.cf_stream_uid || !row.community_id) continue;
      if (!byCommunityLatest.has(row.community_id)) {
        byCommunityLatest.set(row.community_id, row.cf_stream_uid);
        // Read from the SAME row that won, inside the same guard. Taking the
        // structure from one assembly and the uid from another would dash a
        // film against a different film's shot list.
        const segments = tourSegments(row.ordered_clips);
        if (segments.length > 0) segmentsByCommunity.set(row.community_id, segments);
      }
    }
    for (const [id, uid] of byCommunityLatest) {
      byCommunity.set(id, uid);
    }
    await fillSegmentBuckets(supabase, segmentsByCommunity);
  }

  return { byListing, byCommunity, segmentsByCommunity };
}

/**
 * Attach `community_pois.intent_bucket` to every segment that has a `poiId`.
 *
 * The community page's jump strip groups the film by CATEGORY rather than by
 * place name (owner 2026-09-05), and only this table knows a place's category:
 * Ken Burns assemblies write a `bucket` onto each clip, Seedance ones do not.
 * Measured 2026-09-05, the join resolves 9/9 and 12/12 of the two live tours'
 * places, so a clip's own `bucket` is only the fallback.
 *
 * One query for every tour community at once (15 assemblies exist in total).
 * Mutates in place: a failed read leaves the segments as they were, and the
 * strip falls back to the un-grouped film — never an empty strip.
 */
async function fillSegmentBuckets(
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  supabase: any,
  segmentsByCommunity: Map<string, TourSegment[]>,
): Promise<void> {
  const communityIds = [...segmentsByCommunity.keys()];
  if (communityIds.length === 0) return;

  const { data, error } = (await supabase
    .from('community_pois')
    .select('community_id, poi_id, intent_bucket')
    .in('community_id', communityIds)) as {
    data: { community_id: string; poi_id: string; intent_bucket: string }[] | null;
    error: unknown;
  };
  if (error || !data) return;

  const bucketByKey = new Map<string, string>();
  for (const row of data) {
    bucketByKey.set(`${row.community_id}:${row.poi_id}`, row.intent_bucket);
  }
  for (const [communityId, segments] of segmentsByCommunity) {
    for (const seg of segments) {
      if (!seg.poiId) continue;
      const bucket = bucketByKey.get(`${communityId}:${seg.poiId}`);
      if (bucket) seg.bucket = bucket;
    }
  }
}

/** Listing ids that have a hero tour, for the dev `videoFirst` fetch. */
export async function fetchVerticalVideoListingIds(): Promise<string[]> {
  const { byListing } = await fetchVerticalVideos();
  return [...byListing.keys()];
}

/**
 * Community ids that have a hero video, for the dev `videoFirst` fetch.
 *
 * The community half of the same problem the listing function above solves: the
 * community pool is a `name`-ordered page, and the only community with a ready
 * video (Ashley Crossing) is ~280th alphabetically, so it is never inside
 * `offset=0, limit=12`. Reordering that page hoists nothing. The route uses
 * these ids to fetch the rows directly — see `fetchCommunityPoolByIds`.
 */
export async function fetchVerticalVideoCommunityIds(): Promise<string[]> {
  const { byCommunity } = await fetchVerticalVideos();
  return [...byCommunity.keys()];
}
