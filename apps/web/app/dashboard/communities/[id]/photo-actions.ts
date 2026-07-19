'use server';

/**
 * Server actions for community photos (Phase 20.2, 2026-06-13).
 *
 * Mirrors listing-photo-actions.ts shape:
 *   1. Browser uploads to private Supabase Storage `community-photos`
 *      bucket at `{communityId}/{uuid}.{ext}` via supabase-js. Storage
 *      RLS enforces "authenticated agent + valid community_id".
 *   2. Browser calls `recordCommunityPhoto()` to insert the
 *      `community_photos` row.
 *   3. `signedCommunityPhotoUrl()` mints short-lived signed URLs for
 *      the dashboard preview — bucket is private (buyer-invisible).
 *
 * NOT used by buyer-facing pages. By design.
 */

import { createClient } from '@/lib/supabase/server';
import { CommunityVideoCategory } from '@/lib/zod/community-video-categories';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const COMMUNITY_PHOTOS_BUCKET = 'community-photos';

const RecordPhotoInput = z.object({
  communityId: z.string().uuid(),
  storagePath: z.string().min(1).max(512),
  kind: z.enum(['school', 'poi', 'neighborhood']).default('neighborhood'),
  // Phase 24 (2026-06-14): photos now carry the same 12-category axis as
  // videos. Optional for backwards compat; existing legacy callers without
  // a category just get NULL in the column and the UI falls back to `kind`.
  category: CommunityVideoCategory.optional(),
  schoolId: z.string().uuid().nullable(),
  poiId: z.string().uuid().nullable(),
  lat: z.number().finite().min(-90).max(90).nullable(),
  lng: z.number().finite().min(-180).max(180).nullable(),
  width: z.number().int().positive().max(20000).nullable(),
  height: z.number().int().positive().max(20000).nullable(),
  altText: z.string().max(280).nullable(),
});

export type RecordCommunityPhotoResult =
  | { ok: true; id: string; sortOrder: number }
  | { ok: false; error: string };

export async function recordCommunityPhoto(
  input: z.infer<typeof RecordPhotoInput>,
): Promise<RecordCommunityPhotoResult> {
  const parsed = RecordPhotoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const {
    communityId,
    storagePath,
    kind,
    category,
    schoolId,
    poiId,
    lat,
    lng,
    width,
    height,
    altText,
  } = parsed.data;

  if (!storagePath.startsWith(`${communityId}/`)) {
    return { ok: false, error: 'invalid_storage_path' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // Confirm community exists (defense in depth — storage RLS already
  // checks the path's community_id segment).
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id')
    .eq('id', communityId)
    .maybeSingle()) as { data: { id: string } | null };
  if (!community) return { ok: false, error: 'community_not_found' };

  // Compute next sort_order = max + 1.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: maxRow } = (await (supabase as any)
    .from('community_photos')
    .select('sort_order')
    .eq('community_id', communityId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: { sort_order: number } | null };
  const nextSort = (maxRow?.sort_order ?? -1) + 1;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: row, error } = (await (supabase as any)
    .from('community_photos')
    .insert({
      community_id: communityId,
      storage_path: storagePath,
      kind,
      category: category ?? null,
      school_id: schoolId,
      poi_id: poiId,
      lat,
      lng,
      alt_text: altText,
      width,
      height,
      status: 'ready',
      sort_order: nextSort,
    })
    .select('id, sort_order')
    .single()) as {
    data: { id: string; sort_order: number } | null;
    error: { message?: string } | null;
  };

  if (error || !row) {
    console.error('[recordCommunityPhoto] insert failed', error);
    return { ok: false, error: 'insert_failed' };
  }

  revalidatePath(`/dashboard/communities/${communityId}/photos`);
  return { ok: true, id: row.id, sortOrder: row.sort_order };
}

// ─── delete ─────────────────────────────────────────────────────

const DeletePhotoInput = z.object({
  communityId: z.string().uuid(),
  photoId: z.string().uuid(),
});

export type DeleteCommunityPhotoResult = { ok: true } | { ok: false; error: string };

export async function deleteCommunityPhoto(
  input: z.infer<typeof DeletePhotoInput>,
): Promise<DeleteCommunityPhotoResult> {
  const parsed = DeletePhotoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: photo } = (await (supabase as any)
    .from('community_photos')
    .select('id, storage_path, community_id')
    .eq('id', parsed.data.photoId)
    .eq('community_id', parsed.data.communityId)
    .maybeSingle()) as {
    data: { id: string; storage_path: string; community_id: string } | null;
  };
  if (!photo) return { ok: false, error: 'photo_not_found' };

  const { error: storageErr } = await supabase.storage
    .from(COMMUNITY_PHOTOS_BUCKET)
    .remove([photo.storage_path]);
  if (storageErr) {
    console.warn('[deleteCommunityPhoto] storage remove warning', storageErr);
    // fall through — still delete the row
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error: rowErr } = await (supabase as any)
    .from('community_photos')
    .delete()
    .eq('id', parsed.data.photoId)
    .eq('community_id', parsed.data.communityId);

  if (rowErr) {
    console.error('[deleteCommunityPhoto] row delete failed', rowErr);
    return { ok: false, error: 'delete_failed' };
  }

  revalidatePath(`/dashboard/communities/${parsed.data.communityId}/photos`);
  return { ok: true };
}

// ─── signed URL minting ─────────────────────────────────────────
//
// Bucket is private. Dashboard previews go through signed URLs. We mint
// in batch on the server so the client component gets a list of
// {photoId, signedUrl} pairs for an `<img>` grid.

const SIGN_TTL_SECONDS = 60 * 60; // 1 hour

export async function signCommunityPhotoUrls(
  storagePaths: string[],
): Promise<{ path: string; url: string | null }[]> {
  if (storagePaths.length === 0) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return storagePaths.map((p) => ({ path: p, url: null }));

  const { data, error } = await supabase.storage
    .from(COMMUNITY_PHOTOS_BUCKET)
    .createSignedUrls(storagePaths, SIGN_TTL_SECONDS);

  if (error || !data) {
    console.error('[signCommunityPhotoUrls] failed', error);
    return storagePaths.map((p) => ({ path: p, url: null }));
  }

  return data.map((d, i) => ({
    path: storagePaths[i] ?? d.path ?? '',
    url: d.signedUrl ?? null,
  }));
}
