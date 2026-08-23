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

/**
 * The home tour's opening shot, chosen by hand.
 *
 * The hero is `plan[0]`: the first shot of the cut and the only one Seedance
 * animates. It normally falls out of `narrative_sort`, which is right most of
 * the time; when it is not, the only lever used to be rejecting the photo that
 * won — which also removes it from the film entirely (owner 2026-08-23).
 *
 * Two writes, not one, and in this order: clear the listing's current pick,
 * then set the new one. `listing_photos_hero_pick_idx` is a partial UNIQUE
 * index on (listing_id) where hero_pick, so setting first would collide with
 * the row still holding it and the click would fail.
 *
 * Takes effect at the next Plan — nothing here re-plans, because re-planning
 * re-decides every shot and the caller may be about to pick a hero AND reject
 * three photos. The UI says so.
 */
export async function setListingPhotoHero(
  photoId: string,
  on: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Not authorized.' };

  const supabase = createServiceClient();

  const { data: photo, error: readErr } = await supabase
    .from('listing_photos')
    .select('listing_id')
    .eq('id', photoId)
    .maybeSingle();
  if (readErr || !photo) {
    return { ok: false, message: readErr?.message ?? 'Photo not found.' };
  }

  const { error: clearErr } = await supabase
    .from('listing_photos')
    .update({ hero_pick: false })
    .eq('listing_id', photo.listing_id)
    .eq('hero_pick', true);
  if (clearErr) {
    console.error('[admin-photo-actions] hero clear failed', { photoId, error: clearErr });
    return { ok: false, message: clearErr.message };
  }

  if (on) {
    const { error } = await supabase
      .from('listing_photos')
      .update({ hero_pick: true })
      .eq('id', photoId);
    if (error) {
      console.error('[admin-photo-actions] hero set failed', { photoId, error });
      return { ok: false, message: error.message };
    }
  }

  revalidatePath('/admin/pipeline/tour-jobs');
  return { ok: true };
}
