'use server';

/**
 * Server actions for community cover (Phase 27.8, 2026-06-16).
 *
 * Three operations:
 *   - setCommunityCoverVideo({ communityId, videoId })  // pick from videos
 *   - recordCommunityCoverImage({ communityId, storagePath })  // after upload
 *   - clearCommunityCover({ communityId })  // back to default
 *
 * The XOR constraint on (cover_video_id, cover_storage_path) is enforced
 * in DB (0025_community_covers.sql); we still null the other field on
 * each setter to avoid relying on the constraint to flag a bug.
 *
 * Permission rule (mirrors page.tsx canEditMetadata):
 *   created_by IS NULL  OR  created_by = caller's agent_id
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';

async function authorize(
  supabase: Awaited<ReturnType<typeof createClient>>,
  communityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id, created_by')
    .eq('id', communityId)
    .maybeSingle()) as { data: { id: string; created_by: string | null } | null };
  if (!community) return { ok: false, error: 'community_not_found' };

  if (community.created_by == null) return { ok: true };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };

  if (!agentRow || agentRow.id !== community.created_by) {
    return { ok: false, error: 'forbidden' };
  }
  return { ok: true };
}

function revalidate(communityId: string, slug?: string | null) {
  revalidatePath(`/dashboard/communities/${communityId}`);
  revalidatePath('/communities');
  if (slug) revalidatePath(`/c/${slug}`);
  revalidateTag('community-cards');
}

// ─── set video as cover ─────────────────────────────────────────────

const SetVideoInput = z.object({
  communityId: z.string().uuid(),
  videoId: z.string().uuid(),
});

export type SetCoverResult = { ok: true } | { ok: false; error: string };

export async function setCommunityCoverVideo(
  input: z.infer<typeof SetVideoInput>,
): Promise<SetCoverResult> {
  const parsed = SetVideoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { communityId, videoId } = parsed.data;

  const supabase = await createClient();
  const auth = await authorize(supabase, communityId);
  if (!auth.ok) return auth;

  // Confirm the video belongs to this community (primary FK only — extras
  // via the membership view are NOT eligible to be cover, since the FK is
  // ON DELETE SET NULL on community_videos and that table is the source
  // of truth for primary ownership).
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: video } = (await (supabase as any)
    .from('community_videos')
    .select('id, community_id')
    .eq('id', videoId)
    .eq('community_id', communityId)
    .maybeSingle()) as { data: { id: string } | null };
  if (!video) return { ok: false, error: 'video_not_in_community' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: row, error } = (await (supabase as any)
    .from('communities')
    .update({ cover_video_id: videoId, cover_storage_path: null })
    .eq('id', communityId)
    .select('slug')
    .single()) as { data: { slug: string } | null; error: { message?: string } | null };
  if (error || !row) {
    console.error('[setCommunityCoverVideo] update failed', error);
    return { ok: false, error: 'update_failed' };
  }
  revalidate(communityId, row.slug);
  return { ok: true };
}

// ─── record uploaded image as cover ─────────────────────────────────

const RecordImageInput = z.object({
  communityId: z.string().uuid(),
  storagePath: z.string().min(1).max(512),
});

export async function recordCommunityCoverImage(
  input: z.infer<typeof RecordImageInput>,
): Promise<SetCoverResult> {
  const parsed = RecordImageInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { communityId, storagePath } = parsed.data;

  if (!storagePath.startsWith(`${communityId}/`)) {
    return { ok: false, error: 'invalid_storage_path' };
  }

  const supabase = await createClient();
  const auth = await authorize(supabase, communityId);
  if (!auth.ok) return auth;

  // If there was a previous uploaded image, remove it from storage to
  // avoid orphans. (Storage RLS owner-delete policy fences this.)
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: prev } = (await (supabase as any)
    .from('communities')
    .select('cover_storage_path, slug')
    .eq('id', communityId)
    .maybeSingle()) as { data: { cover_storage_path: string | null; slug: string } | null };

  if (prev?.cover_storage_path && prev.cover_storage_path !== storagePath) {
    const { error: rmErr } = await supabase.storage
      .from('community-covers')
      .remove([prev.cover_storage_path]);
    if (rmErr) console.warn('[recordCommunityCoverImage] orphan cleanup warning', rmErr);
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('communities')
    .update({ cover_video_id: null, cover_storage_path: storagePath })
    .eq('id', communityId);
  if (error) {
    console.error('[recordCommunityCoverImage] update failed', error);
    return { ok: false, error: 'update_failed' };
  }
  revalidate(communityId, prev?.slug ?? null);
  return { ok: true };
}

// ─── set photo as cover (Phase 50.9, 2026-06-23) ────────────────────
// Photos live in the PRIVATE `community-photos` bucket; buyer pages can't
// hit a private object. Covers live in the PUBLIC `community-covers`
// bucket. So "set this photo as cover" requires a server-side bucket COPY,
// not a re-pointer. We download the source object once and re-upload to
// covers under the canonical {communityId}/{uuid}.{ext} path. ~1 file
// duplication per cover change is cheap; preserves photos-bucket privacy.

const SetFromPhotoInput = z.object({
  communityId: z.string().uuid(),
  photoStoragePath: z.string().min(1).max(512),
});

export async function setCommunityCoverFromPhoto(
  input: z.infer<typeof SetFromPhotoInput>,
): Promise<SetCoverResult> {
  const parsed = SetFromPhotoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { communityId, photoStoragePath } = parsed.data;

  if (!photoStoragePath.startsWith(`${communityId}/`)) {
    return { ok: false, error: 'invalid_storage_path' };
  }

  const supabase = await createClient();
  const auth = await authorize(supabase, communityId);
  if (!auth.ok) return auth;

  // Download from the private photos bucket, then re-upload to covers.
  // (storage `.copy()` requires source+dest in the same bucket; cross-
  //  bucket needs explicit download+upload.)
  const { data: blob, error: dlErr } = await supabase.storage
    .from('community-photos')
    .download(photoStoragePath);
  if (dlErr || !blob) {
    console.error('[setCommunityCoverFromPhoto] download failed', dlErr);
    return { ok: false, error: 'photo_not_readable' };
  }

  const ext = (photoStoragePath.split('.').pop() ?? 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const newId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const targetPath = `${communityId}/${newId}.${safeExt}`;
  const contentType = blob.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`;

  const { error: upErr } = await supabase.storage
    .from('community-covers')
    .upload(targetPath, blob, { contentType, upsert: false });
  if (upErr) {
    console.error('[setCommunityCoverFromPhoto] upload failed', upErr);
    return { ok: false, error: 'cover_upload_failed' };
  }

  // Reuse the existing setter — it cleans up any prior cover image, nulls
  // cover_video_id, and revalidates the right paths.
  return recordCommunityCoverImage({ communityId, storagePath: targetPath });
}

// ─── clear cover ────────────────────────────────────────────────────

const ClearInput = z.object({ communityId: z.string().uuid() });

export async function clearCommunityCover(
  input: z.infer<typeof ClearInput>,
): Promise<SetCoverResult> {
  const parsed = ClearInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { communityId } = parsed.data;

  const supabase = await createClient();
  const auth = await authorize(supabase, communityId);
  if (!auth.ok) return auth;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: prev } = (await (supabase as any)
    .from('communities')
    .select('cover_storage_path, slug')
    .eq('id', communityId)
    .maybeSingle()) as { data: { cover_storage_path: string | null; slug: string } | null };

  if (prev?.cover_storage_path) {
    const { error: rmErr } = await supabase.storage
      .from('community-covers')
      .remove([prev.cover_storage_path]);
    if (rmErr) console.warn('[clearCommunityCover] storage remove warning', rmErr);
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('communities')
    .update({ cover_video_id: null, cover_storage_path: null })
    .eq('id', communityId);
  if (error) {
    console.error('[clearCommunityCover] update failed', error);
    return { ok: false, error: 'update_failed' };
  }
  revalidate(communityId, prev?.slug ?? null);
  return { ok: true };
}
