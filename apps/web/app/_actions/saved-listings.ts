'use server';

/**
 * Saved-listings server actions.
 *
 * Same rule as `saved-communities.ts` (phase311): saving needs an account,
 * rows are written as the app writes them (`user_id = device_id = auth.uid()`)
 * through the cookie client and RLS, and a signed-out caller gets
 * `not_signed_in`. Listings are off on the web today (`LISTINGS_ON_WEB`); this
 * keeps the rule true for the day they come back.
 */

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const SaveInput = z.object({
  listingId: z.string().uuid(),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveListing(input: z.infer<typeof SaveInput>): Promise<SaveResult> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_signed_in' };

  // Confirm listing exists + is published, so we don't pile orphan
  // saves onto draft / archived rows.
  const { data: listing } = await supabase
    .from('listings')
    .select('id, status')
    .eq('id', parsed.data.listingId)
    .maybeSingle();
  if (!listing) return { ok: false, error: 'listing_not_found' };
  if (listing.status !== 'active') return { ok: false, error: 'listing_not_active' };

  const { error } = await supabase.from('saved_listings').insert({
    user_id: user.id,
    device_id: user.id,
    listing_id: parsed.data.listingId,
  });
  // Duplicate (23505) is success: the row is there.
  if (error && error.code !== '23505') {
    console.error('[saveListing] failed', error.code, error.message);
    return { ok: false, error: 'insert_failed' };
  }
  return { ok: true };
}

export async function unsaveListing(input: z.infer<typeof SaveInput>): Promise<SaveResult> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_signed_in' };

  const { error } = await supabase
    .from('saved_listings')
    .delete()
    .eq('user_id', user.id)
    .eq('listing_id', parsed.data.listingId);

  if (error) {
    console.error('[unsaveListing] failed', error.code, error.message);
    return { ok: false, error: 'delete_failed' };
  }
  return { ok: true };
}

/**
 * The signed-in viewer's saved listing ids, newest first, or `null` when
 * nobody is signed in.
 */
export async function listSavedListingIds(): Promise<string[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('saved_listings')
    .select('listing_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => r.listing_id);
}
