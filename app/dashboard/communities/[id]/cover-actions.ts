'use server';

/**
 * Server actions for community cover (Phase 27.8, 2026-06-16).
 *
 * Three operations:
 *   - setCommunityCoverVideo({ communityId, videoId })  // pick from videos
 *   - recordCommunityCoverImage({ communityId, storagePath })  // after upload
 *   - clearCommunityCover({ communityId })  // back to default
 *
 * The XOR constraint on (cover_video_id, cover_storage_path) is enforced
 * in DB (0025_community_covers.sql); we still null the other field on
 * each setter to avoid relying on the constraint to flag a bug.
 *
 * Permission rule (mirrors page.tsx canEditMetadata):
 *   created_by IS NULL  OR  created_by = caller's agent_id
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

async function authorize(
  supabase: Awaited<ReturnType<typeof createClient>>,
  communityId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id, created_by')
    .eq('id', communityId)
    .maybeSingle()) as { data: { id: string; created_by: string | null } | null };
  if (!community) return { ok: false, error: 'community_not_found' };

  if (community.created_by == null) return { ok: true };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agentRow } = (await (supabase as any)
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()) as { data: { id: string } | null };

  if (!agentRow || agentRow.id !== community.created_by) {
    return { ok: false, error: 'forbidden' };
  }
  return { ok: true };
}

function revalidate(communityId: string, slug?: string | null) {
  revalidatePath(`/dashboard/communities/${communityId}`);
  revalidatePath('/communities');
  if (slug) revalidatePath(`/c/${slug}`);
}

// ─── set video as cover ─────────────────────────────────────────────

const SetVideoInput = z.object({
  communityId: z.string().uuid(),
  videoId: z.string().uuid(),
});

export type SetCoverResult = { ok: true } | { ok: false; error: string };

export async function setCommunityCoverVideo(
  input: z.infer<typeof SetVideoInput>,
): Promise<SetCoverResult> {
  const parsed = SetVideoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { communityId, videoId } = parsed.data;

  const supabase = await createClient();
  const auth = await authorize(supabase, communityId);
  if (!auth.ok) return auth;

  // Confirm the video belongs to this community (primary FK only — extras
  // via the membership view are NOT eligible to be cover, since the FK is
  // ON DELETE SET NULL on community_videos and that table is the source
  // of truth for primary ownership).
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: video } = (await (supabase as any)
    .from('community_videos')
    .select('id, community_id')
    .eq('id', videoId)
    .eq('community_id', communityId)
    .maybeSingle()) as { data: { id: string } | null };
  if (!video) return { ok: false, error: 'video_not_in_community' };

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: row, error } = (await (supabase as any)
    .from('communities')
    .update({ cover_video_id: videoId, cover_storage_path: null })
    .eq('id', communityId)
    .select('slug')
    .single()) as { data: { slug: string } | null; error: { message?: string } | null };
  if (error || !row) {
    console.error('[setCommunityCoverVideo] update failed', error);
    return { ok: false, error: 'update_failed' };
  }
  revalidate(communityId, row.slug);
  return { ok: true };
}

// ─── record uploaded image as cover ─────────────────────────────────

const RecordImageInput = z.object({
  communityId: z.string().uuid(),
  storagePath: z.string().min(1).max(512),
});

export async function recordCommunityCoverImage(
  input: z.infer<typeof RecordImageInput>,
): Promise<SetCoverResult> {
  const parsed = RecordImageInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { communityId, storagePath } = parsed.data;

  if (!storagePath.startsWith(`${communityId}/`)) {
    return { ok: false, error: 'invalid_storage_path' };
  }

  const supabase = await createClient();
  const auth = await authorize(supabase, communityId);
  if (!auth.ok) return auth;

  // If there was a previous uploaded image, remove it from storage to
  // avoid orphans. (Storage RLS owner-delete policy fences this.)
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: prev } = (await (supabase as any)
    .from('communities')
    .select('cover_storage_path, slug')
    .eq('id', communityId)
    .maybeSingle()) as { data: { cover_storage_path: string | null; slug: string } | null };

  if (prev?.cover_storage_path && prev.cover_storage_path !== storagePath) {
    const { error: rmErr } = await supabase.storage
      .from('community-covers')
      .remove([prev.cover_storage_path]);
    if (rmErr) console.warn('[recordCommunityCoverImage] orphan cleanup warning', rmErr);
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('communities')
    .update({ cover_video_id: null, cover_storage_path: storagePath })
    .eq('id', communityId);
  if (error) {
    console.error('[recordCommunityCoverImage] update failed', error);
    return { ok: false, error: 'update_failed' };
  }
  revalidate(communityId, prev?.slug ?? null);
  return { ok: true };
}

// ─── clear cover ────────────────────────────────────────────────────

const ClearInput = z.object({ communityId: z.string().uuid() });

export async function clearCommunityCover(
  input: z.infer<typeof ClearInput>,
): Promise<SetCoverResult> {
  const parsed = ClearInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const { communityId } = parsed.data;

  const supabase = await createClient();
  const auth = await authorize(supabase, communityId);
  if (!auth.ok) return auth;

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: prev } = (await (supabase as any)
    .from('communities')
    .select('cover_storage_path, slug')
    .eq('id', communityId)
    .maybeSingle()) as { data: { cover_storage_path: string | null; slug: string } | null };

  if (prev?.cover_storage_path) {
    const { error: rmErr } = await supabase.storage
      .from('community-covers')
      .remove([prev.cover_storage_path]);
    if (rmErr) console.warn('[clearCommunityCover] storage remove warning', rmErr);
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('communities')
    .update({ cover_video_id: null, cover_storage_path: null })
    .eq('id', communityId);
  if (error) {
    console.error('[clearCommunityCover] update failed', error);
    return { ok: false, error: 'update_failed' };
  }
  revalidate(communityId, prev?.slug ?? null);
  return { ok: true };
}
