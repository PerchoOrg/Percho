'use server';

/**
 * Discarding a generated clip (2026-08-19).
 *
 * Only the PAID engine gets this. Owner: "discard is a good option if the
 * generated clip is so wrong, we should have it for all ai generated clip
 * including seedance, no need for kn and da since we can just regenerate
 * without cost." Ken Burns and DepthFlow render locally, so a bad one is fixed
 * by pressing Regenerate; there is nothing to decide and nothing to protect.
 *
 * Seedance is different in both directions: re-rolling costs ~$0.05 and is
 * non-deterministic, so "this one is wrong" and "try again" are separate
 * decisions. Discarding leaves the photo with its local clips, which is what
 * assemble then uses.
 */

import { requireAdmin } from '@/lib/auth/require-admin';
import { createServiceClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

/**
 * Drop a Seedance clip so the tour stops using it.
 *
 * The row is deleted rather than flagged. `photo_clips` is keyed by
 * (photo_id, engine) and every reader treats "a ready row exists" as "this
 * clip is live" — a status like 'discarded' would have to be special-cased in
 * the assembler, the shot planner and the staleness check, and missing one of
 * them would put the rejected clip back on screen. The rendered file stays in
 * storage; only the claim on it goes away.
 */
export async function discardClip(photoId: string, engine = 'seedance'): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Not authorized.' };
  if (engine !== 'seedance') {
    // Guard rather than silently obey: a local clip has no reason to be
    // discarded, and letting the UI ask would invite the button back.
    return { ok: false, message: 'Only Seedance clips are discarded — re-render local ones.' };
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const supabase: any = createServiceClient();
  const { error } = await supabase
    .from('photo_clips')
    .delete()
    .eq('photo_id', photoId)
    .eq('engine', engine);
  if (error) return { ok: false, message: (error as { message: string }).message };

  revalidatePath('/admin/pipeline/community-nearby', 'layout');
  return { ok: true };
}
