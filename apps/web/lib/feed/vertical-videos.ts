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

import { mobileVideoUid } from '@/lib/feed/video-uid';
import { createAnonClient } from '@/lib/supabase/server';

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

export interface HeroVideoIndex {
  /** listing id → stream uid of that home's OWN tour. */
  byListing: Map<string, string>;
  /** community id → stream uid of that neighbourhood's video. */
  byCommunity: Map<string, string>;
}

/**
 * Hero video per listing and per community, from the two correct sources.
 *
 * Unfiltered by id: 10 listing_videos rows and 15 generated_videos rows exist in
 * total, so this is two small queries. Revisit when either table reaches a few
 * hundred rows.
 */
export async function fetchVerticalVideos(): Promise<HeroVideoIndex> {
  const supabase = createAnonClient();

  const [listingRes, communityRes] = await Promise.all([
    supabase
      .from('listing_videos')
      .select('listing_id, cf_video_id, cf_video_id_landscape, cf_video_id_square, sort_order')
      .eq('status', 'ready')
      .eq('kind', 'walkthrough')
      // 2026-08-03: approval gate. `status='ready'` only means Cloudflare
      // finished encoding; `approved_at` is the admin's decision that this
      // render may reach buyers. Un-approved renders stay invisible in the app
      // (including Expo Go) until someone approves them in /admin.
      .not('approved_at', 'is', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('generated_videos')
      .select('community_id, cf_stream_uid, created_at')
      // Same gate as listing_videos. NOT `status='approved'` — 20260714120000
      // dropped 'approved' from this table's status CHECK, so approval lives in
      // its own column here too.
      .eq('status', 'ready')
      .not('approved_at', 'is', null)
      .eq('scope', 'community_intent_bucket')
      .order('created_at', { ascending: false }),
  ]);

  const byListing = new Map<string, string>();
  const byCommunity = new Map<string, string>();

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

  return { byListing, byCommunity };
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
