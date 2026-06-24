'use server';

/**
 * Phase 46 — community status server actions (active|inactive).
 *
 * Mirrors listing publish/unpublish but without a publish gate —
 * a community has no required-fields check (cover/description are
 * recommended but not blocking). Only the creating agent may toggle.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath, revalidateTag } from 'next/cache';

export type CommunityStatusResult = { ok: true } | { ok: false; error: string };

export async function setCommunityStatus(
  communityId: string,
  status: 'active' | 'inactive',
): Promise<CommunityStatusResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  if (!agentRow) return { ok: false, error: 'Agent profile required' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: row } = (await (supabase as any)
    .from('communities')
    .select('id, slug, created_by')
    .eq('id', communityId)
    .maybeSingle()) as { data: { id: string; slug: string; created_by: string | null } | null };
  if (!row) return { ok: false, error: 'Community not found' };
  if (row.created_by != null && row.created_by !== agentRow.id) {
    return { ok: false, error: 'Only the creating agent can change status' };
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('communities')
    .update({ status })
    .eq('id', communityId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/communities/${communityId}`);
  revalidatePath('/dashboard/communities');
  revalidatePath(`/c/${row.slug}`);
  revalidateTag('community-cards');
  return { ok: true };
}

export async function deleteCommunityAction(communityId: string): Promise<CommunityStatusResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  if (!agentRow) return { ok: false, error: 'Agent profile required' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: row } = (await (supabase as any)
    .from('communities')
    .select('id, created_by')
    .eq('id', communityId)
    .maybeSingle()) as { data: { id: string; created_by: string | null } | null };
  if (!row) return { ok: false, error: 'Community not found' };
  if (row.created_by != null && row.created_by !== agentRow.id) {
    return { ok: false, error: 'Only the creating agent can delete' };
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any).from('communities').delete().eq('id', communityId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/communities');
  revalidateTag('community-cards');
  return { ok: true };
}
