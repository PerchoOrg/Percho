'use server';

/**
 * Claim actions for seeded (source='nextdoor') communities.
 *
 * Phase 83 (2026-07-15): agents can browse the pool of unclaimed neighborhood
 * seed rows and take ownership. Ownership = `communities.created_by` set to
 * the calling agent, which unlocks the existing edit/media/status surfaces.
 *
 * All logic runs through the `claim_community(uuid)` SECURITY DEFINER RPC
 * (migration 20260715115000). The RPC is race-safe — two agents clicking
 * Claim on the same row at the same moment: one wins, one gets P0002. This
 * server action maps the Postgres error codes to a shape the UI can render.
 */

import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ClaimResult =
  | { ok: true; slug: string; id: string }
  | { ok: false; error: 'unauthenticated' | 'not-an-agent' | 'already-claimed' | 'unknown'; message?: string };

export async function claimCommunity(communityId: string): Promise<ClaimResult> {
  const supabase = await createClient();

  // Defense-in-depth: middleware already gates /dashboard/*, but the RPC
  // will also raise 42501 if the caller is not an agent.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'unauthenticated' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data, error } = await (supabase as any).rpc('claim_community', {
    p_community_id: communityId,
  });

  if (error) {
    // Postgres error codes surfaced by PostgREST as `code`:
    //   42501 → caller not an agent
    //   P0002 → already claimed or not found
    if (error.code === '42501') return { ok: false, error: 'not-an-agent' };
    if (error.code === 'P0002') return { ok: false, error: 'already-claimed' };
    return { ok: false, error: 'unknown', message: error.message };
  }

  // Success — bust community list caches so /dashboard/communities and the
  // buyer grid pick up the ownership change immediately.
  revalidateTag('community-cards');
  revalidatePath('/dashboard/communities');
  revalidatePath('/dashboard/communities/claim');

  return { ok: true, slug: data.slug, id: data.id };
}
