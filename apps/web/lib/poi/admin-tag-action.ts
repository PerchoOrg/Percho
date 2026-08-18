'use server';

/**
 * Admin single-photo Gemini tag action (owner 2026-08-17).
 * Wraps the shared tagPoiPhoto so the photo table can tag one row at a time.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

export async function tagPoiPhotoAction(photoId: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Not authorized.' };
  if (!photoId) return { ok: false, message: 'No photo id.' };

  const { tagPoiPhoto } = await import('@/lib/poi/vision-tagger');
  const r = await tagPoiPhoto(photoId);
  if (!r.ok) {
    return {
      ok: false,
      message: r.error ?? (r.skipped === 'already_tagged' ? 'Already tagged.' : 'Tag failed.'),
    };
  }
  revalidatePath('/admin/pipeline');
  return { ok: true };
}
