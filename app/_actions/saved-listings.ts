'use server';

/**
 * Saved-listings server actions (Phase 21, 2026-06-13).
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
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select('id, status')
    .eq('id', parsed.data.listingId)
    .maybeSingle()) as { data: { id: string; status: string } | null };
  if (!listing) return { ok: false, error: 'listing_not_found' };
  if (listing.status !== 'published') return { ok: false, error: 'listing_not_published' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any).from('saved_listings').upsert(
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
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
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
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data, error } = (await (supabase as any)
    .from('saved_listings')
    .select('listing_id')
    .eq('device_id', parsed.data.deviceId)) as {
    data: { listing_id: string }[] | null;
    error: unknown;
  };
  if (error || !data) return [];
  return data.map((r) => r.listing_id);
}

/**
 * Returns full saved listings (joined with agent for the /saved page).
 * Limited to published listings; unpublished saves are filtered out so
 * a buyer never lands on an archived URL.
 */
export interface SavedListingRow {
  listing_id: string;
  saved_at: string;
  listing: {
    id: string;
    address: string;
    slug: string;
    city: string | null;
    state: string;
    zip: string | null;
    price: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
  };
  agent: {
    id: string;
    slug: string;
    display_name: string;
  };
}

export async function listSavedListings(
  input: z.infer<typeof DeviceInput>,
): Promise<SavedListingRow[]> {
  const parsed = DeviceInput.safeParse(input);
  if (!parsed.success) return [];

  const supabase = createServiceClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data, error } = (await (supabase as any)
    .from('saved_listings')
    .select(
      `
      listing_id,
      created_at,
      listing:listings!inner (
        id,
        address,
        slug,
        city,
        state,
        zip,
        price,
        beds,
        baths,
        sqft,
        status,
        agent:agents!inner (
          id,
          slug,
          display_name
        )
      )
    `,
    )
    .eq('device_id', parsed.data.deviceId)
    .eq('listing.status', 'published')
    .order('created_at', { ascending: false })) as {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    data: any[] | null;
    error: unknown;
  };

  if (error || !data) {
    if (error) console.error('[listSavedListings] failed', error);
    return [];
  }

  return data.map((row) => ({
    listing_id: row.listing_id,
    saved_at: row.created_at,
    listing: {
      id: row.listing.id,
      address: row.listing.address,
      slug: row.listing.slug,
      city: row.listing.city,
      state: row.listing.state,
      zip: row.listing.zip,
      price: row.listing.price,
      beds: row.listing.beds,
      baths: row.listing.baths,
      sqft: row.listing.sqft,
    },
    agent: {
      id: row.listing.agent.id,
      slug: row.listing.agent.slug,
      display_name: row.listing.agent.display_name,
    },
  }));
}
