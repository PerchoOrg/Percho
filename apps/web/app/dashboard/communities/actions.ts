'use server';

/**
 * Server actions for community CRUD.
 *
 * RLS: `agents manage communities` allows any authenticated user to insert/
 * update/delete community rows.
 */

import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/utils/slug';
import { UpdateCommunityInput } from '@/lib/zod/community';
import { revalidatePath, revalidateTag } from 'next/cache';

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

/**
 * create an empty "Untitled" stub so the
 * FAB → community Hub → Details flow can land on a real row immediately,
 * with no intermediate /new form. The agent fills in name/city/zip/etc.
 * on the Details tab; queued media (videos, photos) auto-uploads in the
 * background via the Media tab (eager-mounted under HubTabs).
 *
 * Status defaults to `inactive` so unfinished stubs don't leak into the
 * public communities grid (`browse-cards.ts` filters on `status='active'`).
 * The CHECK constraint added in migration 0030 only allows `active`/`inactive`
 * — there is no `draft` slot — so we use `inactive` and let the agent flip
 * to `active` via the InstantStatusToggle once the metadata is filled in.
 *
 * `updateCommunity` will re-derive the slug once the agent renames it.
 * Slug collisions are essentially impossible with a random suffix per stub
 * but we still retry once on the off chance.
 */
export async function createStubCommunity(): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
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
  const createdBy = agentRow?.id ?? null;

  // Generate a unique-ish slug: "untitled-<6 random chars>". updateCommunity()
  // will re-derive a real slug from the agent's chosen name on first edit.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = `untitled-${Math.random().toString(36).slice(2, 8)}`;
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: created, error } = (await (supabase as any)
      .from('communities')
      .insert({
        name: 'Untitled neighborhood',
        slug,
        state: 'GA',
        status: 'inactive',
        created_by: createdBy,
      })
      .select('id')
      .single()) as {
      data: { id: string } | null;
      error: { code?: string; message?: string } | null;
    };

    if (!error && created) {
      revalidatePath('/dashboard/communities');
      revalidateTag('community-cards');
      return { ok: true, data: { id: created.id } };
    }
    if (error?.code !== '23505') {
      console.error('[createStubCommunity] insert failed', error);
      return { ok: false, error: 'insert_failed' };
    }
    // 23505 → slug collision, retry
  }
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
  const baseSlug =
    existing.name === newName ? existing.slug : slugify(newName, { fallback: 'community' });
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
          // expanded metadata. Empty arrays collapse to NULL so
          // we can distinguish "agent never touched this" from "agent set
          // and then cleared". Empty strings already arrive as NULL because
          // the editor normalizes before submit.
          zip: parsed.data.zip ?? null,
          county: parsed.data.county ?? null,
          hoa_fee_monthly: parsed.data.hoa_fee_monthly ?? null,
          year_built: parsed.data.year_built ?? null,
          year_built_end: parsed.data.year_built_end ?? null,
          price_min: parsed.data.price_min ?? null,
          price_max: parsed.data.price_max ?? null,
          property_types:
            parsed.data.property_types && parsed.data.property_types.length > 0
              ? parsed.data.property_types
              : null,
          highlights:
            parsed.data.highlights && parsed.data.highlights.length > 0
              ? parsed.data.highlights
              : null,
          builder: parsed.data.builder ?? null,
          website: parsed.data.website ?? null,
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
      revalidateTag('community-cards');
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
 * permanent community delete.
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
  revalidateTag('community-cards');
  return { ok: true };
}

// ─── community videos ────────────────────────────────
// Note: this only deletes the DB row. The underlying Cloudflare Stream asset
// is orphaned — V1 accepted cost; a periodic reconcile job will clean those
// up post-launch. Same approach as listing_videos (no delete UI yet).

/**
 * resolve the caller's agents.id and gate writes on
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

const COMMUNITY_VIDEO_DESCRIPTION_MAX = 280;

export async function updateCommunityVideoDescription(
  videoId: string,
  communityId: string,
  description: string,
): Promise<ActionResult> {
  // Trim + length cap. Empty string is valid (= clear the description; we
  // store NULL so the row reverts to the "Add a description" placeholder).
  const trimmed = description.trim();
  if (trimmed.length > COMMUNITY_VIDEO_DESCRIPTION_MAX) {
    return { ok: false, error: 'description_too_long' };
  }
  const supabase = await createClient();
  const owned = await requireOwnedVideo(supabase, videoId);
  if (!owned.ok) return owned;
  const { error } = await (
    supabase as unknown as {
      from: (t: string) => {
        update: (v: { description: string | null }) => {
          eq: (col: string, val: string) => Promise<{ error: unknown }>;
        };
      };
    }
  )
    .from('community_videos')
    .update({ description: trimmed.length === 0 ? null : trimmed })
    .eq('id', videoId);
  if (error) {
    console.error('[updateCommunityVideoDescription] failed', error);
    return { ok: false, error: 'update_failed' };
  }
  revalidatePath(`/dashboard/communities/${communityId}`);
  return { ok: true };
}
