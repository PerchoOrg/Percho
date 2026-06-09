'use server';

/**
 * Server actions for the listing edit page.
 *
 * 4.3a — `updateListing` (metadata fields).
 * 4.3b — `reorderListingVideos` (drag-and-drop sort_order persistence).
 *
 * Address/city/state/zip/lat/lng/neighborhood are intentionally NOT editable
 * here. Re-editing the address would invalidate the slug and break any
 * already-shared `/v/<agent>/<slug>` links. If a listing is wrong-addressed,
 * archive it and create a fresh one. (Phase 4.7 covers archive.)
 *
 * What this file owns:
 *  - `updateListing(id, input)` — patches mutable metadata fields.
 *  - `reorderListingVideos(listingId, orderedIds)` — writes new sort_order.
 *  - description is stored as text[] (one element per paragraph). The form
 *    sends a single string; we split on blank lines and trim/empty-filter.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const UpdateListingInput = z.object({
  price: z.number().int().nonnegative().nullable(),
  beds: z.number().nonnegative().nullable(),
  baths: z.number().nonnegative().nullable(),
  sqft: z.number().int().nonnegative().nullable(),
  year_built: z.number().int().min(1800).max(2100).nullable(),
  lot_size: z.string().max(40).nullable(),
  hoa: z.string().max(80).nullable(),
  style: z.string().max(80).nullable(),
  description: z.string().max(20000),
  community_id: z.string().uuid().nullable(),
});

export type UpdateListingInput = z.infer<typeof UpdateListingInput>;
export type UpdateListingResult = { ok: true } | { ok: false; error: string };

function descriptionToParagraphs(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, 10);
}

export async function updateListing(
  id: string,
  input: UpdateListingInput,
): Promise<UpdateListingResult> {
  const parsed = UpdateListingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // RLS policy "agent manages own listings" enforces ownership; if the caller
  // can't see the row, the update silently affects zero rows. We detect that
  // by requesting the updated row back via .select().maybeSingle() — null
  // means RLS hid it (or the id doesn't exist).
  //
  // Earlier impl used `.select('id', { count: 'exact', head: true })` and
  // checked count, but that combination returns count=null after .update()
  // in supabase-js v2 (head=true skips body, and PostgREST's Content-Range
  // count for UPDATE is unreliable post-RLS). Switched to maybeSingle().
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: updated, error } = (await (supabase as any)
    .from('listings')
    .update({
      price: data.price,
      beds: data.beds,
      baths: data.baths,
      sqft: data.sqft,
      year_built: data.year_built,
      lot_size: emptyToNull(data.lot_size),
      hoa: emptyToNull(data.hoa),
      style: emptyToNull(data.style),
      description: descriptionToParagraphs(data.description),
      community_id: data.community_id,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()) as {
    data: { id: string } | null;
    error: { message?: string } | null;
  };

  if (error) {
    console.error('[updateListing] update failed', error);
    return { ok: false, error: 'update_failed' };
  }
  if (!updated) return { ok: false, error: 'not_found_or_forbidden' };

  revalidatePath(`/dashboard/listings/${id}/edit`);
  return { ok: true };
}

function emptyToNull(s: string | null): string | null {
  if (s === null) return null;
  const trimmed = s.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// ─── setListingCover ─────────────────────────────────────────────

const SetCoverInput = z.object({
  listingId: z.string().uuid(),
  videoId: z.string().uuid().nullable(),
});

export type SetListingCoverResult =
  | { ok: true; coverUrl: string | null }
  | { ok: false; error: string };

/**
 * Set (or clear) the listing's cover photo.
 *
 * Pass `videoId = null` to clear the cover. Otherwise we look up the video,
 * confirm it belongs to this listing AND is `status='ready'` (no thumbnail
 * until CF Stream finishes processing), and write
 *   listings.cover_url = thumbnailUrl(cf_video_id)
 *
 * The chosen video's `cf_video_id` is read under RLS, so we don't need a
 * separate ownership check — Supabase returns null if the caller can't see
 * the row.
 */
export async function setListingCover(
  listingId: string,
  videoId: string | null,
): Promise<SetListingCoverResult> {
  const parsed = SetCoverInput.safeParse({ listingId, videoId });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  let coverUrl: string | null = null;

  if (parsed.data.videoId !== null) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: video } = (await (supabase as any)
      .from('listing_videos')
      .select('id, cf_video_id, status, listing_id')
      .eq('id', parsed.data.videoId)
      .eq('listing_id', parsed.data.listingId)
      .maybeSingle()) as {
      data: { id: string; cf_video_id: string; status: string; listing_id: string } | null;
    };

    if (!video) return { ok: false, error: 'video_not_found' };
    if (video.status !== 'ready') return { ok: false, error: 'video_not_ready' };

    const { thumbnailUrl } = await import('@/lib/cloudflare/stream');
    coverUrl = thumbnailUrl(video.cf_video_id);
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('listings')
    .update({ cover_url: coverUrl })
    .eq('id', parsed.data.listingId);

  if (error) {
    console.error('[setListingCover] update failed', { error });
    return { ok: false, error: 'update_failed' };
  }

  revalidatePath(`/dashboard/listings/${parsed.data.listingId}/edit`);
  return { ok: true, coverUrl };
}

// ─── reorderListingVideos ────────────────────────────────────────

const ReorderInput = z.object({
  listingId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1).max(50),
});

export type ReorderListingVideosResult = { ok: true } | { ok: false; error: string };

/**
 * Persist a new video order. The client sends the full ordered list of
 * video IDs; we issue one update per row with its new sort_order.
 *
 * Authorization: each update is RLS-fenced ("agent manages own listing
 * videos" policy). If the caller doesn't own the listing, all updates
 * silently affect 0 rows; we detect that via a count check on the first
 * update and return `not_found_or_forbidden`.
 *
 * Concurrency: this isn't transactional across the N updates. If a partial
 * failure happens, the UI will see a mixed sort_order and re-render against
 * the server state on next page load. For V1 this is acceptable — the user
 * just drags again.
 */
export async function reorderListingVideos(
  listingId: string,
  orderedIds: string[],
): Promise<ReorderListingVideosResult> {
  const parsed = ReorderInput.safeParse({ listingId, orderedIds });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // Ownership check first — read the listing under RLS. If it returns null
  // the caller doesn't own it and every update below would be a no-op.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: ownerCheck } = (await (supabase as any)
    .from('listings')
    .select('id')
    .eq('id', parsed.data.listingId)
    .maybeSingle()) as { data: { id: string } | null };
  if (!ownerCheck) return { ok: false, error: 'not_found_or_forbidden' };

  for (let i = 0; i < parsed.data.orderedIds.length; i++) {
    const videoId = parsed.data.orderedIds[i];
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { error } = await (supabase as any)
      .from('listing_videos')
      .update({ sort_order: i })
      .eq('id', videoId)
      .eq('listing_id', parsed.data.listingId);
    if (error) {
      console.error('[reorderListingVideos] update failed', { videoId, error });
      return { ok: false, error: 'update_failed' };
    }
  }

  revalidatePath(`/dashboard/listings/${parsed.data.listingId}/edit`);
  return { ok: true };
}
