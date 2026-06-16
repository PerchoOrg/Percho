/**
 * Community cover resolution.
 *
 * A community has 3 candidate covers, in priority order:
 *
 *   1. cover_video_id          → Cloudflare Stream poster (image/jpg)
 *   2. cover_storage_path      → public URL in `community-covers` bucket
 *   3. first ready video poster → Cloudflare Stream poster
 *
 * If none, returns null and the caller renders a fallback (gradient block,
 * initial letter, etc).
 *
 * The first two are explicit agent picks; the third is the legacy
 * default that pre-dates Phase 27.8. We keep it so communities created
 * before this feature still look fine.
 */

import { thumbnailUrl } from '@/lib/cloudflare/stream';

const COVERS_BUCKET = 'community-covers';

export interface CommunityCoverInput {
  cover_video_id: string | null;
  cover_storage_path: string | null;
  /** First-ready-video fallback. Pass `null` if not pre-fetched. */
  fallbackVideoCfId?: string | null;
}

export interface ResolvedCover {
  kind: 'video-poster' | 'image' | 'fallback-video';
  url: string;
}

/**
 * Build a public URL for an object in the `community-covers` bucket.
 * Bucket is public (see migration 0025), so this URL is anon-readable.
 */
export function publicCoverImageUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  return `${base}/storage/v1/object/public/${COVERS_BUCKET}/${storagePath}`;
}

/**
 * Resolve which cover to render. Returns null if nothing usable.
 * Pure function — safe in RSC and client components.
 */
export function resolveCommunityCover(input: CommunityCoverInput): ResolvedCover | null {
  // Priority 1: explicit video pick — needs the video's cf_video_id, which
  // the caller must have already joined in. If the row reference is set
  // but cf_video_id wasn't fetched, we fall through (defensive).
  if (input.cover_video_id && input.fallbackVideoCfId) {
    // Note: caller should pass the cf_video_id of cover_video_id, not the
    // generic fallback. See helper below for the disambiguated entrypoint.
  }

  // Priority 2: uploaded image
  if (input.cover_storage_path) {
    return { kind: 'image', url: publicCoverImageUrl(input.cover_storage_path) };
  }

  // Priority 3: fallback to first ready video
  if (input.fallbackVideoCfId) {
    return { kind: 'fallback-video', url: thumbnailUrl(input.fallbackVideoCfId) };
  }

  return null;
}

/**
 * Disambiguated entrypoint for callers that have BOTH the chosen
 * cover-video's cf_video_id AND the fallback first-video cf_video_id.
 *
 * Use this when rendering grids/headers where you've already JOINed
 * community_videos to resolve cf_video_id for `cover_video_id`.
 */
export function resolveCommunityCoverWithCfIds(input: {
  cover_video_id: string | null;
  cover_video_cf_id: string | null;
  cover_storage_path: string | null;
  fallback_video_cf_id: string | null;
}): ResolvedCover | null {
  if (input.cover_video_id && input.cover_video_cf_id) {
    return { kind: 'video-poster', url: thumbnailUrl(input.cover_video_cf_id) };
  }
  if (input.cover_storage_path) {
    return { kind: 'image', url: publicCoverImageUrl(input.cover_storage_path) };
  }
  if (input.fallback_video_cf_id) {
    return { kind: 'fallback-video', url: thumbnailUrl(input.fallback_video_cf_id) };
  }
  return null;
}
