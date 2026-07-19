'use server';

/**
 * Saved-communities server actions (Phase 27.7, 2026-06-16).
 *
 * Mirror of `saved-listings.ts`. RLS denies everything on
 * `saved_communities`; all access funnels through these actions using
 * the service-role client. Device-id is the only identifier in V1
 * (anonymous buyers); `user_id` will be backfilled when buyer auth
 * lands.
 */

import { isValidDeviceId } from '@/lib/buyer/device-id';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const SaveInput = z.object({
  deviceId: z.string().refine(isValidDeviceId, { message: 'invalid_device_id' }),
  communityId: z.string().uuid(),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveCommunity(input: z.infer<typeof SaveInput>): Promise<SaveResult> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = createServiceClient();

  // Confirm community exists. (Communities don't have a status field
  // in V1 — once present, every community is browsable.)
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id')
    .eq('id', parsed.data.communityId)
    .maybeSingle()) as { data: { id: string } | null };
  if (!community) return { ok: false, error: 'community_not_found' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any).from('saved_communities').upsert(
    {
      device_id: parsed.data.deviceId,
      community_id: parsed.data.communityId,
    },
    { onConflict: 'device_id,community_id', ignoreDuplicates: true },
  );

  if (error) {
    console.error('[saveCommunity] failed', error);
    return { ok: false, error: 'insert_failed' };
  }
  return { ok: true };
}

export async function unsaveCommunity(input: z.infer<typeof SaveInput>): Promise<SaveResult> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = createServiceClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('saved_communities')
    .delete()
    .eq('device_id', parsed.data.deviceId)
    .eq('community_id', parsed.data.communityId);

  if (error) {
    console.error('[unsaveCommunity] failed', error);
    return { ok: false, error: 'delete_failed' };
  }
  return { ok: true };
}

const DeviceInput = z.object({
  deviceId: z.string().refine(isValidDeviceId, { message: 'invalid_device_id' }),
});

/**
 * Returns the set of community_ids saved by this device. Used by
 * the community feed and grid pages to hydrate the saved state.
 */
export async function listSavedCommunityIds(
  input: z.infer<typeof DeviceInput>,
): Promise<string[]> {
  const parsed = DeviceInput.safeParse(input);
  if (!parsed.success) return [];

  const supabase = createServiceClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data, error } = (await (supabase as any)
    .from('saved_communities')
    .select('community_id')
    .eq('device_id', parsed.data.deviceId)) as {
    data: { community_id: string }[] | null;
    error: unknown;
  };
  if (error || !data) return [];
  return data.map((r) => r.community_id);
}
