'use server';

/**
 * Server actions for listing photos (Phase 10).
 *
 * Flow (matches the Cloudflare Stream pattern, but without the webhook):
 *   1. Browser picks files, uploads each to Supabase Storage bucket
 *      `listing-photos` at `{listingId}/{uuid}.{ext}` via `supabase-js`.
 *      RLS on `storage.objects` enforces ownership of the listing.
 *   2. After each upload succeeds, browser calls `recordListingPhoto()`
 *      with the storage path + dimensions.
 *   3. Server action verifies listing ownership (RLS) and inserts a
 *      `listing_photos` row with status='ready' (no async processing).
 *
 * Why a server action instead of a REST route: matches the dashboard's
 * existing action style (see updateListing / setListingCover) and lets
 * the edit page revalidate cleanly via revalidatePath.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const RecordPhotoInput = z.object({
  listingId: z.string().uuid(),
  storagePath: z.string().min(1).max(512),
  width: z.number().int().positive().max(20000).nullable(),
  height: z.number().int().positive().max(20000).nullable(),
  altText: z.string().max(280).nullable(),
});

export type RecordPhotoResult =
  | { ok: true; id: string; sortOrder: number }
  | { ok: false; error: string };

export async function recordListingPhoto(
  input: z.infer<typeof RecordPhotoInput>,
): Promise<RecordPhotoResult> {
  const parsed = RecordPhotoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const { listingId, storagePath, width, height, altText } = parsed.data;

  // Path must start with the listingId — defense in depth, the storage RLS
  // policy already enforces this on the upload itself.
  if (!storagePath.startsWith(`${listingId}/`)) {
    return { ok: false, error: 'invalid_storage_path' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // Verify listing ownership via RLS — read returns the row only if the
  // calling agent owns it.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select('id')
    .eq('id', listingId)
    .maybeSingle()) as { data: { id: string } | null };
  if (!listing) return { ok: false, error: 'listing_not_found' };

  // Compute next sort_order = max + 1.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: maxRow } = (await (supabase as any)
    .from('listing_photos')
    .select('sort_order')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: { sort_order: number } | null };
  const nextSort = (maxRow?.sort_order ?? -1) + 1;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: row, error } = (await (supabase as any)
    .from('listing_photos')
    .insert({
      listing_id: listingId,
      storage_path: storagePath,
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
    console.error('[recordListingPhoto] insert failed', error);
    return { ok: false, error: 'insert_failed' };
  }

  // phase45.15 (2026-06-20): owner round 6 #7 — auto-pick the first
  // uploaded asset as cover. Read current cover_url; if it's null,
  // stamp this newly-inserted photo onto it. Idempotent (only writes
  // when null), so subsequent uploads don't override an explicit pick.
  // Photo wins over a still-processing video because photos are
  // synchronously `ready`; video covers fill in via the CF Stream
  // webhook only after `status='ready'`.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: cur } = (await (supabase as any)
    .from('listings')
    .select('cover_url')
    .eq('id', listingId)
    .maybeSingle()) as { data: { cover_url: string | null } | null };
  if (cur && !cur.cover_url) {
    const { photoPublicUrl } = await import('@/lib/supabase/storage');
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    await (supabase as any)
      .from('listings')
      .update({ cover_url: photoPublicUrl(storagePath) })
      .eq('id', listingId);
  }

  revalidatePath(`/dashboard/listings/${listingId}/edit`);
  return { ok: true, id: row.id, sortOrder: row.sort_order };
}

// ─── delete ─────────────────────────────────────────────────────

const DeletePhotoInput = z.object({
  listingId: z.string().uuid(),
  photoId: z.string().uuid(),
});

export type DeletePhotoResult = { ok: true } | { ok: false; error: string };

export async function deleteListingPhoto(
  input: z.infer<typeof DeletePhotoInput>,
): Promise<DeletePhotoResult> {
  const parsed = DeletePhotoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // Read the row first so we know the storage_path. RLS fences this.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: photo } = (await (supabase as any)
    .from('listing_photos')
    .select('id, storage_path, listing_id')
    .eq('id', parsed.data.photoId)
    .eq('listing_id', parsed.data.listingId)
    .maybeSingle()) as {
    data: { id: string; storage_path: string; listing_id: string } | null;
  };
  if (!photo) return { ok: false, error: 'photo_not_found' };

  // Delete the storage object (RLS-fenced via owner-delete policy).
  // We tolerate a missing object — if the row exists but the file is
  // gone, removing the row is still the right thing.
  const { error: storageErr } = await supabase.storage
    .from('listing-photos')
    .remove([photo.storage_path]);
  if (storageErr) {
    console.warn('[deleteListingPhoto] storage remove warning', storageErr);
    // fall through — still delete the row
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error: rowErr } = await (supabase as any)
    .from('listing_photos')
    .delete()
    .eq('id', parsed.data.photoId)
    .eq('listing_id', parsed.data.listingId);

  if (rowErr) {
    console.error('[deleteListingPhoto] row delete failed', rowErr);
    return { ok: false, error: 'delete_failed' };
  }

  revalidatePath(`/dashboard/listings/${parsed.data.listingId}/edit`);
  return { ok: true };
}
