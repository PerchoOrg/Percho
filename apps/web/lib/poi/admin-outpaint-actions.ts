'use server';

/**
 * Admin controls for the 9:16 reframe (2026-08-19).
 *
 * Same shape as admin-enhance-actions: `poi_photos.outpaint_status` IS the
 * queue, and scripts/render-worker/worker.py claims `queued` rows.
 *
 * Unlike enhancement, a `ready` reframe IS live — it replaces a centre crop
 * that was discarding a median 63% of the frame, so the reframed file is the
 * better default. That makes a way to take one back necessary rather than
 * optional: the model re-renders rather than strictly extends, and on a Publix
 * meat-counter photo it seamed a strip of floor onto the bottom of the frame
 * (owner 2026-08-19: "the new pic is sooo wrong… need a way to fix it").
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

/**
 * Discard a reframe and go back to the centre crop.
 *
 * Recorded as 'skipped', which is also what a well-framed original gets — in
 * both cases the render reads the source photo. The rejected file is left in
 * storage rather than deleted: it costs nothing to keep and someone will want
 * to see what was rejected.
 */
export async function rejectOutpaint(photoId: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Not authorized.' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = createServiceClient();
  const { error } = await supabase
    .from('poi_photos')
    .update({
      outpaint_status: 'skipped',
      outpaint_meta: { reason: 'rejected by admin' },
      outpainted_at: new Date().toISOString(),
    })
    .eq('id', photoId);
  if (error) return { ok: false, message: (error as { message: string }).message };

  revalidatePath('/admin/pipeline/community-nearby', 'layout');
  return { ok: true };
}

/**
 * Try the reframe again.
 *
 * Each attempt is a paid image generation (~$0.09), so this is a button an
 * admin presses on a specific bad result, never something the pipeline does on
 * its own. The model is non-deterministic, so a second attempt on the same
 * input is a real second chance rather than a repeat.
 */
export async function requeueOutpaint(photoId: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Not authorized.' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = createServiceClient();
  const { error } = await supabase
    .from('poi_photos')
    .update({ outpaint_status: 'queued', outpaint_error: null })
    .eq('id', photoId);
  if (error) return { ok: false, message: (error as { message: string }).message };

  revalidatePath('/admin/pipeline/community-nearby', 'layout');
  return { ok: true };
}
