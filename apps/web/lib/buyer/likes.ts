'use server';

/**
 * Likes server actions.
 *
 * Likes are a separate signal from saves. Tables `listing_likes` and
 * `community_likes` were added in migration 0028. RLS denies all access
 * — these helpers funnel through the service-role client, mirroring
 * the saves actions in app/_actions/saved-listings.ts and
 * app/_actions/saved-communities.ts.
 *
 * V1 is anonymous: device_id is the primary identity. user_id is
 * filled in when buyer auth merges the device-keyed rows.
 */

import { isValidDeviceId } from '@/lib/buyer/device-id';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

export type LikeKind = 'listing' | 'community';
export type LikeResult = { ok: true } | { ok: false; error: string };

const TOGGLE_INPUT = z.object({
  deviceId: z.string().refine(isValidDeviceId, { message: 'invalid_device_id' }),
  kind: z.enum(['listing', 'community']),
  targetId: z.string().uuid(),
  liked: z.boolean(),
});

function tableFor(kind: LikeKind): { table: string; col: string } {
  return kind === 'listing'
    ? { table: 'listing_likes', col: 'listing_id' }
    : { table: 'community_likes', col: 'community_id' };
}

export async function toggleLike(input: z.infer<typeof TOGGLE_INPUT>): Promise<LikeResult> {
  const parsed = TOGGLE_INPUT.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = createServiceClient();
  const { table, col } = tableFor(parsed.data.kind);

  if (parsed.data.liked) {
    // NOTE: listing_likes / community_likes only have *partial* unique indexes
    // (`where device_id is not null`) and no PK on (device_id, target_id), so
    // PostgREST upsert with `onConflict` is rejected ("no unique or exclusion
    // constraint matching the ON CONFLICT specification"). Use a plain insert
    // and silently absorb the unique-violation when the row already exists.
    // biome-ignore lint/suspicious/noExplicitAny: `.from(table)` takes a VARIABLE, so no single table resolves
    const { error } = await (supabase as any)
      .from(table)
      .insert({ device_id: parsed.data.deviceId, [col]: parsed.data.targetId });
    if (error) {
      // 23505 = unique_violation → already liked, treat as success (idempotent).
      const code = (error as { code?: string } | null)?.code;
      if (code !== '23505') {
        console.error('[toggleLike] insert failed', error);
        return { ok: false, error: 'insert_failed' };
      }
    }
  } else {
    // biome-ignore lint/suspicious/noExplicitAny: `.from(table)` takes a VARIABLE, so no single table resolves
    const { error } = await (supabase as any)
      .from(table)
      .delete()
      .eq('device_id', parsed.data.deviceId)
      .eq(col, parsed.data.targetId);
    if (error) {
      console.error('[toggleLike] delete failed', error);
      return { ok: false, error: 'delete_failed' };
    }
  }
  return { ok: true };
}

const LIST_INPUT = z.object({
  deviceId: z.string().refine(isValidDeviceId, { message: 'invalid_device_id' }),
  kind: z.enum(['listing', 'community']),
});

/**
 * Returns the set of target ids liked by this device, for hydration.
 */
export async function listLiked(input: z.infer<typeof LIST_INPUT>): Promise<string[]> {
  const parsed = LIST_INPUT.safeParse(input);
  if (!parsed.success) return [];

  const supabase = createServiceClient();
  const { table, col } = tableFor(parsed.data.kind);
  // biome-ignore lint/suspicious/noExplicitAny: `.from(table)` takes a VARIABLE, so no single table resolves
  const { data, error } = (await (supabase as any)
    .from(table)
    .select(col)
    .eq('device_id', parsed.data.deviceId)) as {
    data: Record<string, string>[] | null;
    error: unknown;
  };
  if (error || !data) return [];
  return data.map((r) => r[col]).filter((v): v is string => typeof v === 'string');
}
