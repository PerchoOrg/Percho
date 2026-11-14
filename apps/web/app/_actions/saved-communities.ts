'use server';

/**
 * Saved-communities server actions.
 *
 * Saving needs an account (phase311, owner: "保存和对比要求登录"), the same
 * rule as iOS. Rows are written the way the app writes them —
 * `user_id = auth.uid()`, `device_id = auth.uid()::text`
 * (`20260904090000_mobile_auth_saves.sql`) — through the cookie client and
 * RLS, so a save made here shows up on the phone and the other way round.
 *
 * Signed out, every action answers `not_signed_in` and the caller sends the
 * viewer to /login. The anonymous device-id rows web wrote before phase311
 * stay in the table, unread: there is no way to tell whose they are.
 */

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const SaveInput = z.object({
  communityId: z.string().uuid(),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveCommunity(input: z.infer<typeof SaveInput>): Promise<SaveResult> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_signed_in' };

  const { error } = await supabase.from('saved_communities').insert({
    user_id: user.id,
    device_id: user.id,
    community_id: parsed.data.communityId,
  });
  // Duplicate (23505) is success: the row is there.
  if (error && error.code !== '23505') {
    console.error('[saveCommunity] failed', error.code, error.message);
    return { ok: false, error: 'insert_failed' };
  }
  return { ok: true };
}

export async function unsaveCommunity(input: z.infer<typeof SaveInput>): Promise<SaveResult> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_signed_in' };

  const { error } = await supabase
    .from('saved_communities')
    .delete()
    .eq('user_id', user.id)
    .eq('community_id', parsed.data.communityId);

  if (error) {
    console.error('[unsaveCommunity] failed', error.code, error.message);
    return { ok: false, error: 'delete_failed' };
  }
  return { ok: true };
}

/**
 * The signed-in viewer's saved community ids, newest first, or `null` when
 * nobody is signed in (so the caller knows a Save tap must go to /login).
 */
export async function listSavedCommunityIds(): Promise<string[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('saved_communities')
    .select('community_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => r.community_id);
}
