'use server';

/**
 * Admin-only photo review writers, one per photo table.
 *
 * `poi_photos.status` is a platform-wide kill switch — `rejected` here
 * removes the photo from every listing + community video pool at once
 * (see filters in lib/poi/{listing,community}-video-actions.ts).
 *
 * Per-scope curation lives on `listing_poi_photos.status` /
 * `community_poi_photos.status` and is a separate decision.
 *
 * `listing_photos.review_status` is the home tour's gate and is narrower than
 * either: it decides which of a home's OWN photos reach its tour, and nothing
 * else reads it.
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
      // The table shows WHY a photo is out, so a manual verdict has to say so
      // too — otherwise the owner's own click is indistinguishable from an
      // automated one and reads as a pipeline decision he can question.
      // Cleared on any non-rejection so a re-approved photo carries no stale
      // explanation.
      rejection_reason: decision === 'rejected' ? 'rejected in review' : null,
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

/**
 * Home-tour review verdict for one of a listing's own photos.
 *
 * A separate column and a separate function from the POI path on purpose.
 * `listing_photos.status` already exists and means the UPLOAD succeeded
 * (`'ready' | 'error'`); overloading it would make one column answer two
 * questions and every existing reader of `status = 'ready'` would start
 * seeing rows that uploaded fine but are rejected for the film.
 *
 * The plan step reads this: a rejected photo is excluded from `build_plan`'s
 * input, so it cannot reach the cut.
 */
export async function setListingPhotoReview(
  photoId: string,
  decision: GlobalPhotoDecision,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Not authorized.' };

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('listing_photos')
    .update({
      review_status: decision,
      // Same reasoning as the POI path: the table shows WHY a photo is out, so
      // a manual verdict has to say so too rather than reading as a pipeline
      // decision. Cleared on any non-rejection so a re-approved photo carries
      // no stale explanation.
      rejection_reason: decision === 'rejected' ? 'rejected in review' : null,
    })
    .eq('id', photoId);

  if (error) {
    console.error('[admin-photo-actions] listing review failed', { photoId, decision, error });
    return { ok: false, message: error.message };
  }

  revalidatePath('/admin/pipeline/tour-jobs');
  return { ok: true };
}
