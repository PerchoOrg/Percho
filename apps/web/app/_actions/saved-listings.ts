'use server';

/**
 * Saved-listings server actions.
 *
 * RLS denies everything on `saved_listings` — all access funnels through
 * these actions using the service-role client. We validate the device_id
 * shape (UUID) and constrain row writes to the (device_id, listing_id)
 * pair so a malicious caller can only manipulate their own device's
 * saves. Future buyer-login merge will populate `user_id`.
 */

import { isValidDeviceId } from '@/lib/buyer/device-id';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const SaveInput = z.object({
  deviceId: z.string().refine(isValidDeviceId, { message: 'invalid_device_id' }),
  listingId: z.string().uuid(),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveListing(input: z.infer<typeof SaveInput>): Promise<SaveResult> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = createServiceClient();

  // Confirm listing exists + is published, so we don't pile orphan
  // saves onto draft / archived rows.
  const { data: listing } = (await supabase
    .from('listings')
    .select('id, status')
    .eq('id', parsed.data.listingId)
    .maybeSingle()) as { data: { id: string; status: string } | null };
  if (!listing) return { ok: false, error: 'listing_not_found' };
  if (listing.status !== 'active') return { ok: false, error: 'listing_not_active' };

  const { error } = await supabase.from('saved_listings').upsert(
    {
      device_id: parsed.data.deviceId,
      listing_id: parsed.data.listingId,
    },
    { onConflict: 'device_id,listing_id', ignoreDuplicates: true },
  );

  if (error) {
    console.error('[saveListing] failed', error);
    return { ok: false, error: 'insert_failed' };
  }
  return { ok: true };
}

export async function unsaveListing(input: z.infer<typeof SaveInput>): Promise<SaveResult> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('saved_listings')
    .delete()
    .eq('device_id', parsed.data.deviceId)
    .eq('listing_id', parsed.data.listingId);

  if (error) {
    console.error('[unsaveListing] failed', error);
    return { ok: false, error: 'delete_failed' };
  }
  return { ok: true };
}

const DeviceInput = z.object({
  deviceId: z.string().refine(isValidDeviceId, { message: 'invalid_device_id' }),
});

/**
 * Returns the set of listing_ids saved by this device. Used by
 * BrowseFeed on mount to hydrate the UI.
 */
export async function listSavedListingIds(input: z.infer<typeof DeviceInput>): Promise<string[]> {
  const parsed = DeviceInput.safeParse(input);
  if (!parsed.success) return [];

  const supabase = createServiceClient();
  const { data, error } = (await supabase
    .from('saved_listings')
    .select('listing_id')
    .eq('device_id', parsed.data.deviceId)) as {
    data: { listing_id: string }[] | null;
    error: unknown;
  };
  if (error || !data) return [];
  return data.map((r) => r.listing_id);
}
