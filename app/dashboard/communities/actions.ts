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

export type FieldErrors = Record<string, string>;
export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string; fieldErrors?: FieldErrors };

/**
 * Convert a zod safeParse error into a field-keyed message map so the form
 * can highlight the offending input and show the rule inline. We collapse
 * each field's first issue — UI only has room for one message per field.
 */
function zodToFieldErrors(error: import('zod').ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function createCommunity(
  raw: unknown,
  options?: { prefillId?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateCommunityInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', fieldErrors: zodToFieldErrors(parsed.error) };
  }

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
      const prefillId = options?.prefillId;
      if (prefillId) {
        // Phase 45.16 (2026-06-20): when the agent landed here from the
        // upload FAB with files queued, redirect straight to /upload so the
        // CommunityPhotoPanel/CommunityVideoPanel can consume the prefill.
        // Without this the editor page (which has no upload panel) would
        // silently drop the queued files.
        redirect(
          `/dashboard/communities/${created.id}/upload?prefill=${encodeURIComponent(prefillId)}`,
        );
      }
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
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', fieldErrors: zodToFieldErrors(parsed.error) };
  }

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

/**
 * Phase 45.14 (2026-06-20): permanent community delete.
 *
 * Hard-deletes a community row. Schools, POIs, photos, videos, saved-rows
 * all cascade via FKs (`on delete cascade`). Listings reference communities
 * with `on delete set null`, so listings survive the teardown with their
 * `community_id` cleared.
 *
 * Cloudflare Stream videos and Supabase storage photos are NOT scrubbed —
 * V1 trade-off, same as deleteListing. RLS gates this to the creator.
 */
export async function deleteCommunity(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error, count } = (await (supabase as any)
    .from('communities')
    .delete({ count: 'exact' })
    .eq('id', id)) as { error: { message?: string } | null; count: number | null };

  if (error) {
    console.error('[deleteCommunity] delete failed', error);
    return { ok: false, error: 'delete_failed' };
  }
  // RLS may silently filter the row when the caller isn't the creator —
  // surface that as a clear forbidden so the UI can react.
  if (count === 0) return { ok: false, error: 'forbidden' };

  revalidatePath('/dashboard/communities');
  revalidatePath('/communities');
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

/**
 * Phase 35.3: resolve the caller's agents.id and gate writes on
 * uploaded_by = that id. We rely on RLS (migration 0027) for the actual
 * deny — this server-side check just gives us a clean error message
 * instead of a blank "update_failed" when an agent tries to mutate
 * someone else's video, and it skips the round-trip when we can prove
 * up-front the row isn't theirs.
 */
async function requireOwnedVideo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  videoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };
  if (!agentRow) return { ok: false, error: 'unauthorized' };
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: videoRow } = (await (supabase as any)
    .from('community_videos')
    .select('uploaded_by')
    .eq('id', videoId)
    .maybeSingle()) as { data: { uploaded_by: string | null } | null };
  if (!videoRow) return { ok: false, error: 'not_found' };
  if (videoRow.uploaded_by !== agentRow.id) {
    return { ok: false, error: 'not_owner' };
  }
  return { ok: true };
}

export async function deleteCommunityVideo(
  videoId: string,
  communityId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const owned = await requireOwnedVideo(supabase, videoId);
  if (!owned.ok) return owned;
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any).from('community_videos').delete().eq('id', videoId);
  if (error) {
    console.error('[deleteCommunityVideo] failed', error);
    return { ok: false, error: 'delete_failed' };
  }
  revalidatePath(`/dashboard/communities/${communityId}`);
  return { ok: true };
}

// ─── Phase 35.2: visibility + category edit ──────────────────────
// Owner-only as of Phase 35.3 — see requireOwnedVideo above.

const COMMUNITY_VIDEO_VISIBILITIES = ['public', 'private', 'archived'] as const;
export type CommunityVideoVisibility = (typeof COMMUNITY_VIDEO_VISIBILITIES)[number];

export async function updateCommunityVideoVisibility(
  videoId: string,
  communityId: string,
  visibility: CommunityVideoVisibility,
): Promise<ActionResult> {
  if (!COMMUNITY_VIDEO_VISIBILITIES.includes(visibility)) {
    return { ok: false, error: 'invalid_visibility' };
  }
  const supabase = await createClient();
  const owned = await requireOwnedVideo(supabase, videoId);
  if (!owned.ok) return owned;
  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        update: (v: { visibility: string }) => {
          eq: (col: string, val: string) => Promise<{ error: unknown }>;
        };
      };
    }
  )
    .from('community_videos')
    .update({ visibility })
    .eq('id', videoId);
  if (error) {
    console.error('[updateCommunityVideoVisibility] failed', error);
    return { ok: false, error: 'update_failed' };
  }
  revalidatePath(`/dashboard/communities/${communityId}`);
  return { ok: true };
}

const COMMUNITY_VIDEO_CATEGORY_IDS = [
  'walk_the_block',
  'listen_here',
  'morning_rush',
  'after_dark',
  'hidden_spot',
  'local_pick',
  'school_run',
  'daily_errands',
  'the_park',
  'eating_out',
  'get_active',
  'transit_reality',
] as const;

export async function updateCommunityVideoCategory(
  videoId: string,
  communityId: string,
  category: string,
): Promise<ActionResult> {
  if (!(COMMUNITY_VIDEO_CATEGORY_IDS as readonly string[]).includes(category)) {
    return { ok: false, error: 'invalid_category' };
  }
  const supabase = await createClient();
  const owned = await requireOwnedVideo(supabase, videoId);
  if (!owned.ok) return owned;
  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        update: (v: { category: string; category_needs_review: boolean }) => {
          eq: (col: string, val: string) => Promise<{ error: unknown }>;
        };
      };
    }
  )
    .from('community_videos')
    .update({ category, category_needs_review: false })
    .eq('id', videoId);
  if (error) {
    console.error('[updateCommunityVideoCategory] failed', error);
    return { ok: false, error: 'update_failed' };
  }
  revalidatePath(`/dashboard/communities/${communityId}`);
  return { ok: true };
}
