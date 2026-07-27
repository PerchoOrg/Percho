/**
 * Vertical (9:16) hero videos for the mobile feed.
 *
 * WHY THIS EXISTS — a real gap found on 2026-07-27 while wiring the owner's
 * device test. The mobile feed's video came from `browse-cards.ts`, which reads
 * `listing_videos` and prefers `cf_video_id ?? cf_video_id_landscape`. In
 * production every `listing_videos` row has a NULL `cf_video_id` and only a
 * `cf_video_id_landscape` — so the phone was being served LANDSCAPE video for a
 * full-bleed 9:16 card.
 *
 * Meanwhile the 15 ready rows in `generated_videos` are all `aspect_ratio =
 * '9:16'` — the vertical videos actually built for this surface — and nothing in
 * the mobile path read that table at all.
 *
 * So: this module reads `generated_videos` and the mobile route prefers its
 * result over the browse-card hero. `browse-cards.ts` is deliberately untouched
 * because it also feeds the web `/browse` rails, where landscape is correct.
 *
 * Only `status = 'ready'` rows are eligible; a still-rendering video is absent,
 * never a broken player.
 */

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

type GeneratedVideoRow = {
  listing_id: string | null;
  community_id: string | null;
  cf_stream_uid: string | null;
  aspect_ratio: string | null;
  created_at: string;
};

export interface VerticalVideoIndex {
  byListing: Map<string, string>;
  byCommunity: Map<string, string>;
}

/**
 * One 9:16 stream uid per listing and per community.
 *
 * Unfiltered by id on purpose: there are 15 ready rows in total, so fetching all
 * of them is one small query, and it means the caller does not have to know the
 * listing ids before it can ask. When this table grows past a few hundred rows
 * this should take an id list.
 */
export async function fetchVerticalVideos(): Promise<VerticalVideoIndex> {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from('generated_videos')
    .select('listing_id, community_id, cf_stream_uid, aspect_ratio, created_at')
    .eq('status', 'ready')
    .eq('aspect_ratio', '9:16')
    .order('created_at', { ascending: false });

  // A video is an enhancement, not the card. If this read fails the feed still
  // works with photos, so it must not take the whole endpoint down.
  if (error) return { byListing: new Map(), byCommunity: new Map() };

  const byListing = new Map<string, string>();
  const byCommunity = new Map<string, string>();
  for (const row of (data ?? []) as GeneratedVideoRow[]) {
    if (!row.cf_stream_uid) continue;
    // Newest first from the query, so the first write per key wins.
    if (row.listing_id && !byListing.has(row.listing_id)) {
      byListing.set(row.listing_id, row.cf_stream_uid);
    }
    if (row.community_id && !byCommunity.has(row.community_id)) {
      byCommunity.set(row.community_id, row.cf_stream_uid);
    }
  }
  return { byListing, byCommunity };
}

/** Listing ids that have a ready 9:16 video, for the dev `videoFirst` fetch. */
export async function fetchVerticalVideoListingIds(): Promise<string[]> {
  const { byListing } = await fetchVerticalVideos();
  return [...byListing.keys()];
}
