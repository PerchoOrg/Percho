'use server';

/**
 * Admin-only global photo status writer.
 *
 * `poi_photos.status` is a platform-wide kill switch — `rejected` here
 * removes the photo from every listing + community video pool at once
 * (see filters in lib/poi/{listing,community}-video-actions.ts).
 *
 * Per-scope curation lives on `listing_poi_photos.status` /
 * `community_poi_photos.status` and is a separate decision.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type GlobalPhotoDecision = 'approved' | 'rejected' | 'pending';

export async function setGlobalPhotoStatus(
  photoId: string,
  decision: GlobalPhotoDecision,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Not authorized.' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = createServiceClient();

  const { error } = await supabase
    .from('poi_photos')
    .update({
      status: decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.id,
    })
    .eq('id', photoId);

  if (error) {
    console.error('[admin-photo-actions] update failed', { photoId, decision, error });
    return { ok: false, message: error.message };
  }

  // The POI detail page keys off this row; refresh it so the next SSR
  // pull reflects the decision immediately.
  revalidatePath('/admin/pipeline/poi-library');
  return { ok: true };
}
