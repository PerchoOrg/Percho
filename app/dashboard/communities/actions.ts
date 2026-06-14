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
import { nameToSlug } from '@/lib/utils/slug';
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

  // Stamp creator so creator-only RLS update policy (migration 0013) can gate
  // future edits. Lookup is best-effort; if the agent row is missing we still
  // allow the insert with NULL (treated as legacy / unowned by RLS).
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  const createdBy = agentRow?.id ?? null;

  // Slug is system-derived from name. On collision append a short random
  // suffix and retry once; we don't expose slug to users (Phase 25.4: agents
  // should never type slugs — they're URL plumbing).
  const baseSlug = nameToSlug(parsed.data.name) || 'community';
  const slugCandidates = [baseSlug, `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`];

  let lastError: { code?: string; message?: string } | null = null;
  for (const slug of slugCandidates) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: created, error } = (await (supabase as any)
      .from('communities')
      .insert({
        name: parsed.data.name,
        slug,
        city: parsed.data.city ?? null,
        state: parsed.data.state,
        description: parsed.data.description ?? null,
        created_by: createdBy,
      })
      .select('id')
      .single()) as {
      data: { id: string } | null;
      error: { code?: string; message?: string } | null;
    };

    if (!error && created) {
      revalidatePath('/dashboard/communities');
      redirect(`/dashboard/communities/${created.id}`);
    }
    lastError = error;
    if (error?.code !== '23505') break;
    // else: slug collision — retry with suffixed candidate
  }

  console.error('[createCommunity] insert failed', lastError);
  return { ok: false, error: 'insert_failed' };
}

export async function updateCommunity(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = UpdateCommunityInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // Read the current row so we can decide whether the slug needs to change.
  // Slug derives from name — if the name changed, the slug follows. If a
  // collision happens we append a short suffix and retry once. We don't keep
  // an "agent-edited slug" mode for V1: simpler to keep slug == derived(name).
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: existing } = (await (supabase as any)
    .from('communities')
    .select('name, slug')
    .eq('id', id)
    .maybeSingle()) as { data: { name: string; slug: string } | null };
  if (!existing) return { ok: false, error: 'not_found' };

  const newName = parsed.data.name;
  const baseSlug = existing.name === newName ? existing.slug : nameToSlug(newName);
  const slugCandidates: string[] =
    baseSlug === existing.slug
      ? [existing.slug]
      : [baseSlug, `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`];

  let lastError: { code?: string; message?: string } | null = null;
  for (const slug of slugCandidates) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { error, count } = (await (supabase as any)
      .from('communities')
      .update(
        {
          name: newName,
          slug,
          city: parsed.data.city,
          state: parsed.data.state,
          description: parsed.data.description,
        },
        { count: 'exact' },
      )
      .eq('id', id)) as {
      error: { code?: string; message?: string } | null;
      count: number | null;
    };

    if (!error) {
      // RLS may silently filter the row when the caller isn't the creator —
      // surface that as a clear forbidden so the UI can react.
      if (count === 0) return { ok: false, error: 'forbidden' };
      revalidatePath(`/dashboard/communities/${id}`);
      revalidatePath('/dashboard/communities');
      return { ok: true };
    }
    lastError = error;
    if (error.code !== '23505') break;
    // else: slug collision — try the suffixed candidate
  }

  console.error('[updateCommunity] update failed', lastError);
  if (lastError?.code === '23505') return { ok: false, error: 'slug_taken' };
  return { ok: false, error: 'update_failed' };
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
