/**
 * The bucket-video pipeline, written once and parameterised by
 * `PoiEntityScope`. `listing-video-actions.ts` and
 * `community-video-actions.ts` are thin 'use server' adapters over this.
 *
 * Flow (unchanged from the two originals):
 *   1. auth
 *   2. resolve the entity, for its display label
 *   3. pull scope-approved POI photos, skipping globally-rejected ones
 *   4. resolve which POIs sit in this bucket, and their distances
 *   5. drop photos already claimed by another live video in this scope
 *   6. order outer -> inner (far POIs first), portrait before landscape,
 *      higher ai_score first, then cap
 *   7. refuse if one is already pending/processing for (entity, bucket)
 *   8. insert the generated_videos row the EC2 render worker polls
 *
 * Not a 'use server' module: it exports plain (non-action) helpers, and
 * Next.js only permits async function exports from a 'use server' file.
 */
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { bucketLabel } from './bucket-label';
import type {
  BucketVideoRow,
  BucketVideoStatus,
  GenerateBucketVideoResult,
  PoiEntityScope,
} from './entity-scope';
import type { IntentBucket } from './types';

const MAX_PHOTOS_PER_VIDEO = 15;
const MIN_PHOTOS_PER_VIDEO = 3;

/**
 * Table names come from the scope descriptor at runtime, so the generated
 * per-table types cannot be selected statically. Each call site annotates the
 * row shape it expects, which is the same convention the original two files
 * used. Confined to this module.
 */
type DynamicClient = {
  // biome-ignore lint/suspicious/noExplicitAny: table name is a runtime value; row shapes are annotated per call site
  from: (table: string) => any;
};

type PhotoRow = {
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
    ai_tags: unknown;
  };
};

/**
 * Order the eligible pool and cap it. Pure — no I/O — so it is unit-testable
 * (see bucket-video-core.test.ts) where the surrounding action is not.
 *
 * Outer -> inner walk-in: POIs furthest from the entity first, so a viewer is
 * walked in toward it. Within a POI: portrait before landscape (the output is
 * 9:16), then higher ai_score, then id for a stable tiebreak.
 */
export function selectPhotosForVideo(
  eligible: PhotoRow[],
  distanceByPoi: Map<string, number>,
  maxPhotos: number = MAX_PHOTOS_PER_VIDEO,
): PhotoRow[] {
  const isPortrait = (r: PhotoRow) => (r.poi_photos.height_px ?? 0) > (r.poi_photos.width_px ?? 0);
  const scoreOf = (r: PhotoRow) => r.poi_photos.ai_score ?? 0.5;

  const byPoi = new Map<string, PhotoRow[]>();
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

  const selected: PhotoRow[] = [];
  for (const [, arr] of poiOrder) {
    for (const photo of arr) {
      if (selected.length >= maxPhotos) break;
      selected.push(photo);
    }
    if (selected.length >= maxPhotos) break;
  }
  return selected;
}

/**
 * Which approved photos may feed this bucket's video. Pure.
 *
 * A tagged photo is trusted by its own `applicable_buckets`; an untagged one
 * falls back to whichever bucket its POI was filed under. Photos the tagger
 * marked unusable never enter the pool (owner 2026-08-17), and neither do
 * photos already claimed by another live video in the same scope.
 */
export function filterEligiblePhotos(
  photoRows: PhotoRow[],
  bucket: IntentBucket,
  bucketPoiSet: Set<string>,
  claimedPhotoIds: Set<string>,
): PhotoRow[] {
  return photoRows.filter((r) => {
    if (claimedPhotoIds.has(r.poi_photo_id)) return false;
    const p = r.poi_photos;
    if ((p.ai_tags as Record<string, unknown> | null)?.usable === false) return false;
    const applicable = Array.isArray(p.applicable_buckets) ? p.applicable_buckets : [];
    if (p.tagged_at && applicable.length > 0) return applicable.includes(bucket);
    return bucketPoiSet.has(p.poi_id);
  });
}

export async function generateBucketVideo<N extends string>(
  s: PoiEntityScope,
  entityId: string,
  bucket: IntentBucket,
): Promise<GenerateBucketVideoResult<N>> {
  const log = `[${s.kind}-bucket-video]`;
  const notFound = s.notFoundReason as N;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'unauthorized', message: 'Not signed in.' };

  const db = supabase as unknown as DynamicClient;
  const { data: entity } = (await db
    .from(s.entityTable)
    .select(`id, ${s.labelColumn}`)
    .eq('id', entityId)
    .maybeSingle()) as { data: Record<string, string | null> | null };
  if (!entity) {
    return { ok: false, reason: notFound, message: s.notFoundMessage };
  }
  const label = entity[s.labelColumn] ?? s.labelFallback;

  const admin = createServiceClient() as unknown as DynamicClient;

  const { data: approvedPhotos, error: photosErr } = (await admin
    .from(s.photoJoinTable)
    .select(
      'poi_photo_id, poi_photos!inner(id, poi_id, storage_path, attribution, width_px, height_px, applicable_buckets, ai_score, tagged_at, status, ai_tags)',
    )
    .eq(s.idColumn, entityId)
    .eq('status', 'approved')
    // Skip photos an admin globally rejected (bad crop, wrong subject, etc.).
    // Per-scope approval remains the primary curator.
    .neq('poi_photos.status', 'rejected')) as {
    data: PhotoRow[] | null;
    error: { message: string } | null;
  };

  if (photosErr) {
    console.error(`${log} approved photos query failed:`, photosErr);
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
      message: `No approved photos yet for ${label}. Approve photos in the ${bucketLabel(bucket)} bucket first.`,
      approved_count: 0,
    };
  }

  const poiIds = Array.from(new Set(photoRows.map((r) => r.poi_photos.poi_id)));
  const { data: bucketPois, error: bucketErr } = (await admin
    .from(s.poiTable)
    .select('poi_id, intent_bucket, status, distance_m')
    .eq(s.idColumn, entityId)
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
    console.error(`${log} ${s.poiTable} query failed:`, bucketErr);
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

  // Cross-bucket dedup within this entity — a photo used by another live video
  // in the same scope is off-limits, so we don't burn photos on a bucket that
  // is about to overwrite itself.
  const { data: liveVideos } = (await admin
    .from('generated_videos')
    .select('id, intent_bucket, input_photo_ids, status')
    .eq(s.idColumn, entityId)
    .eq('scope', s.videoScope)
    .neq('intent_bucket', bucket)
    .in('status', ['pending', 'processing', 'ready'])) as {
    data: Array<{ id: string; input_photo_ids: string[] | null }> | null;
  };

  const claimedPhotoIds = new Set<string>();
  for (const v of liveVideos ?? []) {
    for (const pid of v.input_photo_ids ?? []) claimedPhotoIds.add(pid);
  }

  const eligible = filterEligiblePhotos(photoRows, bucket, bucketPoiSet, claimedPhotoIds);

  if (eligible.length < MIN_PHOTOS_PER_VIDEO) {
    return {
      ok: false,
      reason: 'not_enough_photos',
      message: `Need at least ${MIN_PHOTOS_PER_VIDEO} approved photos in the ${bucketLabel(bucket)} bucket for ${label} — you have ${eligible.length} available.`,
      approved_count: eligible.length,
    };
  }

  const selected = selectPhotosForVideo(eligible, distanceByPoi);
  const inputPhotoIds = selected.map((r) => r.poi_photo_id);

  // Concurrent-render guard: refuse a second pending/processing for the same
  // (entity, bucket). Multiple 'ready' rows are allowed — "multiple videos,
  // one primary", the owner picks which one buyers see.
  const { data: inflight } = (await admin
    .from('generated_videos')
    .select('id, status')
    .eq(s.idColumn, entityId)
    .eq('scope', s.videoScope)
    .eq('intent_bucket', bucket)
    .in('status', ['pending', 'processing'])
    .maybeSingle()) as { data: { id: string; status: string } | null };

  if (inflight) {
    return {
      ok: false,
      reason: 'already_in_progress',
      message: `A ${bucketLabel(bucket)} video for ${label} is already being generated (status: ${inflight.status}).`,
    };
  }

  const { data: inserted, error: insErr } = (await admin
    .from('generated_videos')
    .insert({
      [s.idColumn]: entityId,
      [s.otherIdColumn]: null,
      scope: s.videoScope,
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
    })
    .select('id, status')
    .single()) as {
    data: { id: string; status: string } | null;
    error: { message: string } | null;
  };

  if (insErr || !inserted) {
    console.error(`${log} insert generated_videos failed:`, insErr);
    return {
      ok: false,
      reason: 'internal_error',
      message: `Enqueue failed: ${insErr?.message ?? 'unknown'}`,
    };
  }

  revalidatePath(s.revalidatePathFor(entityId));

  return {
    ok: true,
    video_id: inserted.id,
    photo_count: selected.length,
    status: inserted.status as 'pending' | 'processing',
  };
}

/** All bucket videos for an entity, newest first. */
export async function listBucketVideos(
  s: PoiEntityScope,
  entityId: string,
): Promise<BucketVideoRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = (await (supabase as unknown as DynamicClient)
    .from('generated_videos')
    .select(
      'id, intent_bucket, status, cf_stream_uid, duration_s, input_photo_ids, error, created_at',
    )
    .eq(s.idColumn, entityId)
    .eq('scope', s.videoScope)
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
    status: r.status as BucketVideoRow['status'],
    cf_stream_uid: r.cf_stream_uid,
    duration_s: r.duration_s,
    photo_count: r.input_photo_ids?.length ?? 0,
    error: r.error,
    created_at: r.created_at,
  }));
}

/**
 * Latest (entity, bucket) row so the panel can poll during a render.
 * Narrative only counts when it carries a `voiceover` string.
 */
export async function getBucketVideoStatus(
  s: PoiEntityScope,
  entityId: string,
  bucket: IntentBucket,
): Promise<BucketVideoStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = (await (supabase as unknown as DynamicClient)
    .from('generated_videos')
    .select('id, status, cf_stream_uid, duration_s, input_photo_ids, error, created_at, narrative')
    .eq(s.idColumn, entityId)
    .eq('scope', s.videoScope)
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
      ? (data.narrative as unknown as NonNullable<BucketVideoStatus>['narrative'])
      : null;

  return {
    video_id: data.id,
    status: data.status as NonNullable<BucketVideoStatus>['status'],
    cf_stream_uid: data.cf_stream_uid,
    duration_s: data.duration_s,
    photo_count: data.input_photo_ids?.length ?? 0,
    error: data.error,
    created_at: data.created_at,
    narrative: narr,
  };
}

/** Raw pool size for (entity, bucket), before the round-robin cap. */
export async function getBucketEligiblePhotoCount(
  s: PoiEntityScope,
  entityId: string,
  bucket: IntentBucket,
): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const db = supabase as unknown as DynamicClient;
  const { data: approved } = (await db
    .from(s.photoJoinTable)
    .select('poi_photo_id, poi_photos!inner(poi_id, applicable_buckets)')
    .eq(s.idColumn, entityId)
    .eq('status', 'approved')) as {
    data: Array<{
      poi_photo_id: string;
      poi_photos: { poi_id: string; applicable_buckets: string[] | null };
    }> | null;
  };
  if (!approved || approved.length === 0) return 0;

  const poiIds = Array.from(new Set(approved.map((r) => r.poi_photos.poi_id)));
  const { data: bucketPois } = (await db
    .from(s.poiTable)
    .select('poi_id')
    .eq(s.idColumn, entityId)
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
 * Manual "Regenerate description" trigger. Same Gemini pipeline for both
 * scopes — narrative.ts accepts either owner.
 *
 * Note: the community copy of this used to check only that `community_id`
 * was set, while the listing copy also required the row's `scope` to match.
 * Unified on the stricter check, so a video from one scope can't be
 * regenerated through the other's entry point.
 */
export async function regenerateBucketVideoNarrative(
  s: PoiEntityScope,
  videoId: string,
): Promise<
  | { ok: true; narrative: NonNullable<BucketVideoStatus>['narrative'] }
  | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { data: owned } = (await (supabase as unknown as DynamicClient)
    .from('generated_videos')
    .select(`id, ${s.idColumn}, scope`)
    .eq('id', videoId)
    .maybeSingle()) as {
    data: (Record<string, string | null> & { scope: string }) | null;
  };
  const ownerId = owned?.[s.idColumn];
  if (!owned || !ownerId || owned.scope !== s.videoScope) {
    return { ok: false, message: 'Video not found or not owned by you.' };
  }

  const { generateBucketVideoNarrative } = await import('./narrative');
  const res = await generateBucketVideoNarrative(videoId);
  if (!res.ok) return { ok: false, message: res.message };

  revalidatePath(s.revalidatePathFor(ownerId));
  return { ok: true, narrative: res.narrative };
}
