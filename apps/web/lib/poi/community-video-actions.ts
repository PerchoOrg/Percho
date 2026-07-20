'use server';

/**
 * community-scoped bucket video generation.
 *
 * Mirror of `lib/poi/video-actions.ts::generateBucketVideo` but keyed on
 * `community_id` instead of `listing_id`. Nearby content is neighborhood-
 * shared, so one dining video for "Waterside" serves every listing inside it.
 *
 * Photo pool: `community_poi_photos.status='approved'` for this community,
 * filtered by bucket via applicable_buckets (tagger) or POI's community_pois
 * bucket (untagged fallback).
 *
 * Output: inserts a `generated_videos` row with
 *   scope='community_intent_bucket', community_id set, listing_id null.
 * The EC2 render worker polls the same table (worker cutover in ).
 *
 * "Multiple videos, one primary" — per owner 07-15. So we DO NOT supersede
 * previous ready rows; we keep them and let the community_videos.is_primary
 * flag pick the one shown to buyers. Cross-bucket photo dedup still applies
 * against live (pending/processing/ready) rows so we don't burn photos on
 * a bucket that's about to overwrite itself.
 */

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { IntentBucket } from './types';

const MAX_PHOTOS_PER_VIDEO = 15;
const MIN_PHOTOS_PER_VIDEO = 3;

export type GenerateCommunityBucketVideoResult =
  | {
      ok: true;
      video_id: string;
      photo_count: number;
      status: 'pending' | 'processing';
    }
  | {
      ok: false;
      reason:
        | 'unauthorized'
        | 'community_not_found'
        | 'not_enough_photos'
        | 'already_in_progress'
        | 'internal_error';
      message: string;
      approved_count?: number;
    };

export async function generateCommunityBucketVideo(
  communityId: string,
  bucket: IntentBucket,
): Promise<GenerateCommunityBucketVideoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, reason: 'unauthorized', message: 'Not signed in.' };
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabaseAny: any = supabase;
  const { data: community } = (await supabaseAny
    .from('communities')
    .select('id, name')
    .eq('id', communityId)
    .maybeSingle()) as { data: { id: string; name: string } | null };
  if (!community) {
    return {
      ok: false,
      reason: 'community_not_found',
      message: 'Community not found.',
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const admin: any = createServiceClient();

  // Approved photos + POI bucket lookup.
  const { data: approvedPhotos, error: photosErr } = (await admin
    .from('community_poi_photos')
    .select(
      'poi_photo_id, poi_photos!inner(id, poi_id, storage_path, attribution, width_px, height_px, applicable_buckets, ai_score, tagged_at, status)',
    )
    .eq('community_id', communityId)
    .eq('status', 'approved')
    // skip globally-rejected photos (admin kill switch).
    .neq('poi_photos.status', 'rejected')) as {
    data: Array<{
      poi_photo_id: string;
      poi_photos: {
        id: string;
        poi_id: string;
        storage_path: string;
        attribution: unknown;
        width_px: number | null;
        height_px: number | null;
        applicable_buckets: string[] | null;
        ai_score: number | null;
        tagged_at: string | null;
      };
    }> | null;
    error: { message: string } | null;
  };

  if (photosErr) {
    console.error('[community-bucket-video] approved photos query failed:', photosErr);
    return {
      ok: false,
      reason: 'internal_error',
      message: `Photo query failed: ${photosErr.message}`,
    };
  }

  const photoRows = approvedPhotos ?? [];
  if (photoRows.length === 0) {
    return {
      ok: false,
      reason: 'not_enough_photos',
      message: `No approved photos yet for ${community.name}. Approve photos in the ${bucketLabel(bucket)} bucket first.`,
      approved_count: 0,
    };
  }

  const poiIds = Array.from(new Set(photoRows.map((r) => r.poi_photos.poi_id)));
  const { data: bucketPois, error: bucketErr } = (await admin
    .from('community_pois')
    .select('poi_id, intent_bucket, status, distance_m')
    .eq('community_id', communityId)
    .eq('intent_bucket', bucket)
    .in('poi_id', poiIds)) as {
    data: Array<{
      poi_id: string;
      intent_bucket: string;
      status: string;
      distance_m: number | null;
    }> | null;
    error: { message: string } | null;
  };

  if (bucketErr) {
    console.error('[community-bucket-video] community_pois query failed:', bucketErr);
    return {
      ok: false,
      reason: 'internal_error',
      message: `Bucket query failed: ${bucketErr.message}`,
    };
  }

  const bucketPoiSet = new Set((bucketPois ?? []).map((p) => p.poi_id));
  const distanceByPoi = new Map<string, number>(
    (bucketPois ?? [])
      .filter((p) => p.distance_m != null)
      .map((p) => [p.poi_id, p.distance_m as number]),
  );

  // Cross-bucket dedup within this community — a photo used by another live
  // community video for THIS community is off-limits. (Different community's
  // videos share the same POI photos globally — we don't dedup across
  // communities because each has its own primary pick.)
  const { data: liveVideos } = (await admin
    .from('generated_videos')
    .select('id, intent_bucket, input_photo_ids, status')
    .eq('community_id', communityId)
    .eq('scope', 'community_intent_bucket')
    .neq('intent_bucket', bucket)
    .in('status', ['pending', 'processing', 'ready'])) as {
    data: Array<{
      id: string;
      intent_bucket: string;
      input_photo_ids: string[] | null;
      status: string;
    }> | null;
  };

  const claimedPhotoIds = new Set<string>();
  for (const v of liveVideos ?? []) {
    for (const pid of v.input_photo_ids ?? []) claimedPhotoIds.add(pid);
  }

  const eligible = photoRows.filter((r) => {
    if (claimedPhotoIds.has(r.poi_photo_id)) return false;
    const p = r.poi_photos;
    const applicable = Array.isArray(p.applicable_buckets) ? p.applicable_buckets : [];
    if (p.tagged_at && applicable.length > 0) {
      return applicable.includes(bucket);
    }
    return bucketPoiSet.has(p.poi_id);
  });

  if (eligible.length < MIN_PHOTOS_PER_VIDEO) {
    return {
      ok: false,
      reason: 'not_enough_photos',
      message: `Need at least ${MIN_PHOTOS_PER_VIDEO} approved photos in the ${bucketLabel(bucket)} bucket for ${community.name} — you have ${eligible.length} available.`,
      approved_count: eligible.length,
    };
  }

  // Outer→inner walk-in ordering (same as listing side,).
  const isPortrait = (r: (typeof eligible)[number]) => {
    const w = r.poi_photos.width_px ?? 0;
    const h = r.poi_photos.height_px ?? 0;
    return h > w;
  };
  const scoreOf = (r: (typeof eligible)[number]) => r.poi_photos.ai_score ?? 0.5;

  const byPoi = new Map<string, typeof eligible>();
  for (const r of eligible) {
    const key = r.poi_photos.poi_id;
    const arr = byPoi.get(key) ?? [];
    arr.push(r);
    byPoi.set(key, arr);
  }
  for (const arr of byPoi.values()) {
    arr.sort((a, b) => {
      const pa = isPortrait(a) ? 0 : 1;
      const pb = isPortrait(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (scoreOf(a) !== scoreOf(b)) return scoreOf(b) - scoreOf(a);
      return a.poi_photo_id.localeCompare(b.poi_photo_id);
    });
  }

  const poiOrder = Array.from(byPoi.entries()).sort(([aId], [bId]) => {
    const da = distanceByPoi.get(aId);
    const db = distanceByPoi.get(bId);
    if (da != null && db != null) return db - da;
    if (da != null) return -1;
    if (db != null) return 1;
    return aId.localeCompare(bId);
  });

  const selected: typeof eligible = [];
  for (const [, arr] of poiOrder) {
    for (const photo of arr) {
      if (selected.length >= MAX_PHOTOS_PER_VIDEO) break;
      selected.push(photo);
    }
    if (selected.length >= MAX_PHOTOS_PER_VIDEO) break;
  }

  const inputPhotoIds = selected.map((r) => r.poi_photo_id);

  // Concurrent-render guard: refuse a second pending/processing for the same
  // (community, bucket). Multiple 'ready' rows are ALLOWED per
  // (owner picks primary). Regenerating a ready one is also fine.
  const { data: inflight } = (await admin
    .from('generated_videos')
    .select('id, status')
    .eq('community_id', communityId)
    .eq('scope', 'community_intent_bucket')
    .eq('intent_bucket', bucket)
    .in('status', ['pending', 'processing'])
    .maybeSingle()) as { data: { id: string; status: string } | null };

  if (inflight) {
    return {
      ok: false,
      reason: 'already_in_progress',
      message: `A ${bucketLabel(bucket)} video for ${community.name} is already being generated (status: ${inflight.status}).`,
    };
  }

  const { data: inserted, error: insErr } = (await admin
    .from('generated_videos')
    .insert({
      community_id: communityId,
      listing_id: null,
      scope: 'community_intent_bucket',
      intent_bucket: bucket,
      input_photo_ids: inputPhotoIds,
      generator: 'ffmpeg_slideshow',
      status: 'pending',
      aspect_ratio: '9:16',
      narrative: {
        source: 'manual_trigger',
        selected_at: new Date().toISOString(),
        photo_count: selected.length,
        bucket,
      },
    } as never)
    .select('id, status')
    .single()) as {
    data: { id: string; status: string } | null;
    error: { message: string } | null;
  };

  if (insErr || !inserted) {
    console.error('[community-bucket-video] insert generated_videos failed:', insErr);
    return {
      ok: false,
      reason: 'internal_error',
      message: `Enqueue failed: ${insErr?.message ?? 'unknown'}`,
    };
  }

  revalidatePath(`/dashboard/communities/${communityId}`);

  return {
    ok: true,
    video_id: inserted.id,
    photo_count: selected.length,
    status: inserted.status as 'pending' | 'processing',
  };
}

function bucketLabel(bucket: IntentBucket): string {
  switch (bucket) {
    case 'schools':
      return 'Schools';
    case 'dining':
      return 'Dining';
    case 'nightlife':
      return 'Nightlife';
    case 'shopping':
      return 'Shopping';
    case 'outdoor':
      return 'Outdoor';
    case 'fitness':
      return 'Fitness';
    case 'kids':
      return 'Kids & Family';
    case 'asian_community':
      return 'Asian Community';
    case 'daily_errands':
      return 'Daily Errands';
    case 'faith':
      return 'Faith';
    case 'work_hubs':
      return 'Work Hubs';
    case 'healthcare':
      return 'Healthcare';
    case 'pets':
      return 'Pets';
    case 'transit':
      return 'Transit';
  }
}

// ─── read helpers ──────────────────────────────────────────────────────────

/**
 * All bucket videos for a community, newest first per bucket. The primary
 * pick (community_videos.is_primary=true) is surfaced separately by
 * `getCommunityBucketVideosByBucket` for reader-facing UI.
 */
export type CommunityBucketVideoRow = {
  video_id: string;
  bucket: IntentBucket;
  status: 'pending' | 'processing' | 'ready' | 'approved' | 'rejected' | 'failed' | 'superseded';
  cf_stream_uid: string | null;
  duration_s: number | null;
  photo_count: number;
  error: string | null;
  created_at: string;
};

export async function listCommunityBucketVideos(
  communityId: string,
): Promise<CommunityBucketVideoRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = (await supabase
    .from('generated_videos')
    .select(
      'id, intent_bucket, status, cf_stream_uid, duration_s, input_photo_ids, error, created_at',
    )
    .eq('community_id', communityId)
    .eq('scope', 'community_intent_bucket')
    .order('created_at', { ascending: false })) as {
    data: Array<{
      id: string;
      intent_bucket: string;
      status: string;
      cf_stream_uid: string | null;
      duration_s: number | null;
      input_photo_ids: string[] | null;
      error: string | null;
      created_at: string;
    }> | null;
  };

  return (data ?? []).map((r) => ({
    video_id: r.id,
    bucket: r.intent_bucket as IntentBucket,
    status: r.status as CommunityBucketVideoRow['status'],
    cf_stream_uid: r.cf_stream_uid,
    duration_s: r.duration_s,
    photo_count: r.input_photo_ids?.length ?? 0,
    error: r.error,
    created_at: r.created_at,
  }));
}

// ─── panel-facing helpers ─────────────────────────────────────

/**
 * Mirror of `getBucketVideoStatus` but for community-scoped bucket videos.
 * Returns the latest (community, bucket) row so the UI can poll during
 * render and show status. Narrative is validated the same way — only
 * llm-generated narratives with a `voiceover` string count.
 */
export type CommunityBucketVideoStatus = {
  video_id: string;
  status: 'pending' | 'processing' | 'ready' | 'approved' | 'rejected' | 'failed';
  cf_stream_uid: string | null;
  duration_s: number | null;
  photo_count: number;
  error: string | null;
  created_at: string;
  narrative?: (import('./narrative').VideoNarrative & { source?: string }) | null;
} | null;

export async function getCommunityBucketVideoStatus(
  communityId: string,
  bucket: IntentBucket,
): Promise<CommunityBucketVideoStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = (await supabase
    .from('generated_videos')
    .select('id, status, cf_stream_uid, duration_s, input_photo_ids, error, created_at, narrative')
    .eq('community_id', communityId)
    .eq('scope', 'community_intent_bucket')
    .eq('intent_bucket', bucket)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as {
    data: {
      id: string;
      status: string;
      cf_stream_uid: string | null;
      duration_s: number | null;
      input_photo_ids: string[] | null;
      error: string | null;
      created_at: string;
      narrative: Record<string, unknown> | null;
    } | null;
  };

  if (!data) return null;

  const narr =
    data.narrative && typeof (data.narrative as { voiceover?: unknown }).voiceover === 'string'
      ? (data.narrative as unknown as NonNullable<CommunityBucketVideoStatus>['narrative'])
      : null;

  return {
    video_id: data.id,
    status: data.status as NonNullable<CommunityBucketVideoStatus>['status'],
    cf_stream_uid: data.cf_stream_uid,
    duration_s: data.duration_s,
    photo_count: data.input_photo_ids?.length ?? 0,
    error: data.error,
    created_at: data.created_at,
    narrative: narr,
  };
}

/**
 * Raw pool size of approved photos eligible for this community x bucket,
 * before the round-robin cap. Mirrors `getBucketEligiblePhotoCount`.
 */
export async function getCommunityBucketEligiblePhotoCount(
  communityId: string,
  bucket: IntentBucket,
): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: approved } = (await supabase
    .from('community_poi_photos')
    .select('poi_photo_id, poi_photos!inner(poi_id, applicable_buckets)')
    .eq('community_id', communityId)
    .eq('status', 'approved')) as {
    data: Array<{
      poi_photo_id: string;
      poi_photos: { poi_id: string; applicable_buckets: string[] | null };
    }> | null;
  };
  if (!approved || approved.length === 0) return 0;

  const poiIds = Array.from(new Set(approved.map((r) => r.poi_photos.poi_id)));
  const { data: bucketPois } = (await supabase
    .from('community_pois')
    .select('poi_id')
    .eq('community_id', communityId)
    .eq('intent_bucket', bucket)
    .in('poi_id', poiIds)) as { data: Array<{ poi_id: string }> | null };
  const bucketPoiSet = new Set((bucketPois ?? []).map((p) => p.poi_id));

  let count = 0;
  for (const r of approved) {
    const tags = r.poi_photos.applicable_buckets;
    if (tags && tags.length > 0) {
      if (tags.includes(bucket)) count += 1;
    } else if (bucketPoiSet.has(r.poi_photos.poi_id)) {
      count += 1;
    }
  }
  return count;
}

/**
 * manual "Regenerate description" trigger for community videos.
 * Same Anthropic-narrative pipeline as the listing version - narrative.ts
 * accepts both scopes now. Revalidates the community page instead of the
 * listing edit page.
 */
export async function regenerateCommunityBucketVideoNarrative(
  videoId: string,
): Promise<
  | { ok: true; narrative: NonNullable<CommunityBucketVideoStatus>['narrative'] }
  | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { data: owned } = (await supabase
    .from('generated_videos')
    .select('id, community_id')
    .eq('id', videoId)
    .maybeSingle()) as { data: { id: string; community_id: string | null } | null };
  if (!owned || !owned.community_id)
    return { ok: false, message: 'Video not found or not owned by you.' };

  const { generateBucketVideoNarrative } = await import('./narrative');
  const res = await generateBucketVideoNarrative(videoId);
  if (!res.ok) return { ok: false, message: res.message };

  revalidatePath(`/dashboard/communities/${owned.community_id}`);
  return { ok: true, narrative: res.narrative };
}
