'use server';

/**
 * Admin photo-enhancement actions (2026-08-03).
 *
 * The enhance QUEUE is `{listing,poi}_photos.enhanced_status` itself — there is
 * no jobs table. `queued` is picked up by scripts/render-worker/worker.py
 * (claim_enhance_job), which writes the enhanced JPEG to
 * `listing-photos/enhanced/<original path>` and sets status `ready`.
 *
 * `ready` is NOT live. The render worker only reads an enhanced file when its
 * status is `approved`, so nothing changes in any video until an admin approves
 * it here — that is the whole point of the gate.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type PhotoTable = 'listing_photos' | 'poi_photos';
export type EnhanceDecision = 'approved' | 'rejected';

type Result = { ok: true } | { ok: false; message: string };

const TABLES: readonly PhotoTable[] = ['listing_photos', 'poi_photos'];

function guardTable(table: string): table is PhotoTable {
  return (TABLES as readonly string[]).includes(table);
}

/** Queue photos for enhancement. Re-queueing an already-enhanced photo is
 *  allowed and overwrites the previous file (worker upserts by path). */
export async function queuePhotoEnhancement(
  table: PhotoTable,
  photoIds: string[],
  preset: 'light' | 'default' | 'strong' = 'default',
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Not authorized.' };
  if (!guardTable(table)) return { ok: false, message: 'Bad table.' };
  if (photoIds.length === 0) return { ok: false, message: 'No photos selected.' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = createServiceClient();
  const { error } = await supabase
    .from(table)
    .update({
      enhanced_status: 'queued',
      enhanced_preset: preset,
      enhanced_error: null,
    })
    .in('id', photoIds);

  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/pipeline');
  return { ok: true };
}

/** Approve (render uses it from now on) or reject (render keeps the original). */
export async function setEnhancedDecision(
  table: PhotoTable,
  photoId: string,
  decision: EnhanceDecision,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Not authorized.' };
  if (!guardTable(table)) return { ok: false, message: 'Bad table.' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = createServiceClient();
  const { error } = await supabase
    .from(table)
    .update({ enhanced_status: decision })
    .eq('id', photoId);

  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/pipeline');
  return { ok: true };
}

/** Approve a rendered video for the buyer-facing feed (incl. Expo Go).
 *  `status` stays owned by the Cloudflare webhook; approval is its own column. */
export async function setVideoApproval(
  table: 'listing_videos' | 'community_videos' | 'generated_videos',
  videoId: string,
  approved: boolean,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Not authorized.' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = createServiceClient();

  // generated_videos carries approval in its own status CHECK ('approved'),
  // the other two use approved_at/approved_by columns.
  const patch =
    table === 'generated_videos'
      ? {
          // NOT status='approved' — 20260714120000 dropped that value from this
          // table's status CHECK. Approval is `approved_at` on all three tables.
          approved_at: approved ? new Date().toISOString() : null,
          approved_by: approved ? admin.id : null,
          reviewed_at: new Date().toISOString(),
        }
      : {
          approved_at: approved ? new Date().toISOString() : null,
          approved_by: approved ? admin.id : null,
        };

  const { error } = await supabase.from(table).update(patch).eq('id', videoId);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/admin/pipeline');
  return { ok: true };
}
