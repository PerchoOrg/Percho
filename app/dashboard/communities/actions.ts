'use server';

/**
 * Server actions for community CRUD (Phase 4.4).
 *
 * RLS: `agents manage communities` allows any authenticated user to insert/
 * update/delete community rows. Schools and POIs require `recorded_by`,
 * which we set to the calling agent's `id` server-side.
 *
 * `source_url` for schools and POIs is mandatory — DB-enforced AND
 * zod-enforced — for fair-housing audit trail.
 */

import { createClient } from '@/lib/supabase/server';
import {
  AddPoiInput,
  AddSchoolInput,
  CreateCommunityInput,
  UpdateCommunityInput,
} from '@/lib/zod/community';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

export async function createCommunity(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateCommunityInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: created, error } = (await (supabase as any)
    .from('communities')
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      city: parsed.data.city ?? null,
      state: parsed.data.state,
      description: parsed.data.description ?? null,
    })
    .select('id')
    .single()) as {
    data: { id: string } | null;
    error: { code?: string; message?: string } | null;
  };

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'slug_taken' };
    console.error('[createCommunity] insert failed', error);
    return { ok: false, error: 'insert_failed' };
  }
  if (!created) return { ok: false, error: 'insert_failed' };

  revalidatePath('/dashboard/communities');
  redirect(`/dashboard/communities/${created.id}`);
}

export async function updateCommunity(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = UpdateCommunityInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('communities')
    .update({
      name: parsed.data.name,
      city: parsed.data.city,
      state: parsed.data.state,
      description: parsed.data.description,
    })
    .eq('id', id);

  if (error) {
    console.error('[updateCommunity] update failed', error);
    return { ok: false, error: 'update_failed' };
  }
  revalidatePath(`/dashboard/communities/${id}`);
  revalidatePath('/dashboard/communities');
  return { ok: true };
}

// ─── schools ─────────────────────────────────────────────────────

async function getAgentId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  return agent?.id ?? null;
}

export async function addSchool(raw: unknown): Promise<ActionResult> {
  const parsed = AddSchoolInput.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'invalid_input' };
  }

  const agentId = await getAgentId();
  if (!agentId) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any).from('schools').insert({
    community_id: parsed.data.community_id,
    name: parsed.data.name,
    grades: parsed.data.grades ?? null,
    rating: parsed.data.rating ?? null,
    source_url: parsed.data.source_url,
    recorded_by: agentId,
  });
  if (error) {
    console.error('[addSchool] insert failed', error);
    return { ok: false, error: 'insert_failed' };
  }
  revalidatePath(`/dashboard/communities/${parsed.data.community_id}`);
  return { ok: true };
}

export async function deleteSchool(schoolId: string, communityId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any).from('schools').delete().eq('id', schoolId);
  if (error) {
    console.error('[deleteSchool] failed', error);
    return { ok: false, error: 'delete_failed' };
  }
  revalidatePath(`/dashboard/communities/${communityId}`);
  return { ok: true };
}

// ─── pois ────────────────────────────────────────────────────────

export async function addPoi(raw: unknown): Promise<ActionResult> {
  const parsed = AddPoiInput.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'invalid_input' };
  }

  const agentId = await getAgentId();
  if (!agentId) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any).from('pois').insert({
    community_id: parsed.data.community_id,
    name: parsed.data.name,
    poi_type: parsed.data.poi_type,
    distance_text: parsed.data.distance_text ?? null,
    source_url: parsed.data.source_url,
    recorded_by: agentId,
  });
  if (error) {
    console.error('[addPoi] insert failed', error);
    return { ok: false, error: 'insert_failed' };
  }
  revalidatePath(`/dashboard/communities/${parsed.data.community_id}`);
  return { ok: true };
}

export async function deletePoi(poiId: string, communityId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any).from('pois').delete().eq('id', poiId);
  if (error) {
    console.error('[deletePoi] failed', error);
    return { ok: false, error: 'delete_failed' };
  }
  revalidatePath(`/dashboard/communities/${communityId}`);
  return { ok: true };
}

// ─── community videos (Phase 4.5) ────────────────────────────────
// Note: this only deletes the DB row. The underlying Cloudflare Stream asset
// is orphaned — V1 accepted cost; a periodic reconcile job will clean those
// up post-launch. Same approach as listing_videos (no delete UI yet).

export async function deleteCommunityVideo(
  videoId: string,
  communityId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any).from('community_videos').delete().eq('id', videoId);
  if (error) {
    console.error('[deleteCommunityVideo] failed', error);
    return { ok: false, error: 'delete_failed' };
  }
  revalidatePath(`/dashboard/communities/${communityId}`);
  return { ok: true };
}
