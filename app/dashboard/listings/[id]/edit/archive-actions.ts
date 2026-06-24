'use server';

// Phase 46: archive concept removed. Listings are now active|inactive only.
// Permanent deletion is the sole destructive action remaining.
//
// File kept at this path so existing imports continue to resolve; archive
// helpers are gone, replaced by deleteListing() server actions used by the
// dashboard's three-dot menu.

import 'server-only';
import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type DeleteListingResult = { ok: true } | { ok: false; error: string };

/**
 * Permanently delete a listing. RLS scopes the delete to the calling
 * agent's own listings. Cascades to listing_videos / listing_photos /
 * photos via FK on delete cascade.
 */
export async function deleteListing(listingId: string): Promise<DeleteListingResult> {
  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('listings')
    .delete()
    .eq('id', listingId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard');
  revalidateTag('community-cards');
  return { ok: true };
}

/**
 * Convenience wrapper that redirects after a successful delete. Useful
 * from the listing detail page's three-dot menu form action.
 */
export async function deleteListingAndRedirect(listingId: string): Promise<void> {
  const r = await deleteListing(listingId);
  if (!r.ok) throw new Error(r.error);
  redirect('/dashboard');
}
