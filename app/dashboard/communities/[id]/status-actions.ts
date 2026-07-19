'use server';

/**
 * community status server actions (active|inactive).
 *
 * added an activate gate. Communities can no longer
 * be flipped active without meeting the minimum quality bar, because active
 * communities show up in the buyer-facing communities grid AND in the
 * neighborhood dropdown on the listing edit page. An "Untitled community"
 * with no cover leaking into either place is unacceptable UX.
 *
 * Activate gate:
 *   - name is set and not the stub 'Untitled community' placeholder
 *   - city is set
 *   - state is set (NOT NULL in DB, defensive check)
 *   - ≥1 community_photo OR ≥1 ready+public community_video
 *
 * Deactivate has no gate. Return shape mirrors the listing publish action:
 * `{ ok:false, missing:[] }` when the gate fails so the shared
 * InstantStatusToggle can render the same "fill in the missing fields"
 * popover it already renders for listings. Non-gate failures (auth,
 * ownership, DB error) come back as `{ ok:false, error:string }`.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath, revalidateTag } from 'next/cache';

const UNTITLED_STUB_NAME = 'Untitled community';

export type CommunityStatusResult = { ok: true } | { ok: false; error: string; missing?: string[] };

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
    .select('id, slug, name, city, state, created_by')
    .eq('id', communityId)
    .maybeSingle()) as {
    data: {
      id: string;
      slug: string;
      name: string | null;
      city: string | null;
      state: string | null;
      created_by: string | null;
    } | null;
  };
  if (!row) return { ok: false, error: 'Neighborhood not found' };
  if (row.created_by != null && row.created_by !== agentRow.id) {
    return { ok: false, error: 'Only the creating agent can change status' };
  }

  // Activate gate — name/location + at least one media asset.
  if (status === 'active') {
    const missing: string[] = [];
    const trimmedName = (row.name ?? '').trim();
    if (!trimmedName || trimmedName === UNTITLED_STUB_NAME) missing.push('name');
    if (!row.city || !row.city.trim()) missing.push('city');
    if (!row.state || !row.state.trim()) missing.push('state');

    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { count: photoCount } = (await (supabase as any)
      .from('community_photos')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId)) as { count: number | null };

    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { count: videoCount } = (await (supabase as any)
      .from('community_videos')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId)
      .eq('status', 'ready')
      .eq('visibility', 'public')) as { count: number | null };

    if ((photoCount ?? 0) < 1 && (videoCount ?? 0) < 1) {
      missing.push('at least one photo or ready video');
    }

    if (missing.length > 0) {
      return { ok: false, error: 'Missing required fields', missing };
    }
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
  if (!row) return { ok: false, error: 'Neighborhood not found' };
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
