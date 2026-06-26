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

import { isDraftAddress } from '@/app/dashboard/listings/draft';
import { deriveSlug, nextCandidate } from '@/lib/listings/slug';
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

/**
 * Phase 52 (2026-06-24): Address is now editable while the listing is
 * still in draft state — that is, the address column still equals the
 * `__draft__-<rand>` placeholder written by `createStubListing`. Once
 * the agent picks a real Place Details address, we re-derive the slug
 * and lock further address edits (re-editing post-publish would break
 * shared `/v/<agent>/<slug>` links).
 *
 * Place Details is resolved client-side; we receive the parsed pieces
 * and re-validate them server-side, never trusting the client.
 */
const UpdateAddressInput = z.object({
  address: z.string().min(3).max(200),
  city: z.string().min(1).max(80),
  state: z.string().length(2),
  zip: z.string().max(10).optional().nullable(),
  neighborhood: z.string().max(120).optional().nullable(),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

export type UpdateAddressInput = z.infer<typeof UpdateAddressInput>;
export type UpdateAddressResult =
  | { ok: true; slug: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const MAX_SLUG_ATTEMPTS = 20;

export async function updateListingAddress(
  id: string,
  input: UpdateAddressInput,
): Promise<UpdateAddressResult> {
  const parsed = UpdateAddressInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'invalid_input',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // Read current row under RLS so we can (a) check ownership and
  // (b) gate the address edit to draft listings only.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: current } = (await (supabase as any)
    .from('listings')
    .select('id, agent_id, address, slug')
    .eq('id', id)
    .maybeSingle()) as {
    data: { id: string; agent_id: string; address: string; slug: string } | null;
  };
  if (!current) return { ok: false, error: 'not_found_or_forbidden' };
  if (!isDraftAddress(current.address)) {
    return { ok: false, error: 'address_locked' };
  }

  const baseSlug = deriveSlug(data.address);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = nextCandidate(baseSlug, attempt);
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: updated, error } = (await (supabase as any)
      .from('listings')
      .update({
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip ?? null,
        neighborhood: data.neighborhood ?? null,
        lat: data.lat,
        lng: data.lng,
        slug,
      })
      .eq('id', id)
      .select('id, slug')
      .maybeSingle()) as {
      data: { id: string; slug: string } | null;
      error: { code?: string; message?: string } | null;
    };

    if (updated) {
      revalidatePath(`/dashboard/listings/${id}/edit`);
      return { ok: true, slug: updated.slug };
    }
    if (error && error.code !== '23505') {
      console.error('[updateListingAddress] update failed', error);
      return { ok: false, error: 'update_failed' };
    }
    // 23505 → unique (agent_id, slug) collision, try base-2, base-3, …
  }

  return { ok: false, error: 'slug_exhaustion' };
}

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

  // NOTE: intentionally NO revalidatePath here. This action is called from
  // debounced autosave on every keystroke burst; revalidating forces the
  // Next router to re-fetch the page's RSC payload (listing row, communities
  // list, permission checks, etc.) and applies it after the in-flight
  // transition resolves. On a slow link that adds visible UI lag while the
  // user is still typing — and the client form state is already the truth.
  // Pages that DO need server-data sync (publish, archive, cover, video
  // reorder) revalidate from their own actions.
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
 *
 * Phase 59 (2026-06-26): `cover_url` alone only fed agent-side surfaces
 * (`/dashboard`, `/v/...` og:image). Buyer grids and the swipe feed (`/browse`,
 * `/saved`, `/nearby`, `/search`, `/browse/feed`) all pick the hero by
 * `listing_videos` sorted ascending on `sort_order` — they never read
 * `cover_url`. So the same action now also reorders `listing_videos` so
 * the chosen video sits at `sort_order=0`, with every other video pushed
 * one slot down (their relative order preserved). Buyer surfaces now show
 * exactly what the agent picked, without each surface needing a custom
 * cover-aware lookup.
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

  // Phase 59: also push the chosen video to sort_order=0 so buyer-side
  // surfaces (which read listing_videos by sort_order asc and never
  // consult cover_url) treat it as the hero. When clearing the cover
  // (videoId === null) we leave the existing video order alone — buyers
  // simply fall back to whatever was already first.
  if (parsed.data.videoId !== null) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: rows } = (await (supabase as any)
      .from('listing_videos')
      .select('id, sort_order')
      .eq('listing_id', parsed.data.listingId)
      .order('sort_order', { ascending: true })) as {
      data: { id: string; sort_order: number }[] | null;
    };
    const order = (rows ?? []).map((r) => r.id);
    const chosenIdx = order.indexOf(parsed.data.videoId);
    if (chosenIdx > 0) {
      order.splice(chosenIdx, 1);
      order.unshift(parsed.data.videoId);
      // No unique constraint on (listing_id, sort_order), so a single-phase
      // rewrite is fine — same shape as reorderListingVideos.
      for (let i = 0; i < order.length; i++) {
        // biome-ignore lint/suspicious/noExplicitAny: stub generated types
        await (supabase as any)
          .from('listing_videos')
          .update({ sort_order: i })
          .eq('id', order[i])
          .eq('listing_id', parsed.data.listingId);
      }
    }
  }

  revalidatePath(`/dashboard/listings/${parsed.data.listingId}/edit`);
  return { ok: true, coverUrl };
}

// ─── setListingCoverPhoto ────────────────────────────────────────

const SetCoverPhotoInput = z.object({
  listingId: z.string().uuid(),
  photoId: z.string().uuid().nullable(),
});

export type SetListingCoverPhotoResult =
  | { ok: true; coverUrl: string | null }
  | { ok: false; error: string };

/**
 * Set (or clear) the listing's cover photo from the photo library.
 *
 * Pass `photoId = null` to clear. Otherwise look up the photo, confirm it
 * belongs to this listing (RLS-fenced), and write
 *   listings.cover_url = photoPublicUrl(storage_path)
 *
 * Video cover and photo cover share one column (`cover_url`), so writing a
 * photo cover automatically supersedes any prior video cover and vice versa.
 * The agent picks one face for the listing — whichever they last clicked wins.
 */
export async function setListingCoverPhoto(
  listingId: string,
  photoId: string | null,
): Promise<SetListingCoverPhotoResult> {
  const parsed = SetCoverPhotoInput.safeParse({ listingId, photoId });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  let coverUrl: string | null = null;

  if (parsed.data.photoId !== null) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: photo } = (await (supabase as any)
      .from('listing_photos')
      .select('id, storage_path, listing_id')
      .eq('id', parsed.data.photoId)
      .eq('listing_id', parsed.data.listingId)
      .maybeSingle()) as {
      data: { id: string; storage_path: string; listing_id: string } | null;
    };

    if (!photo) return { ok: false, error: 'photo_not_found' };

    const { photoPublicUrl } = await import('@/lib/supabase/storage');
    coverUrl = photoPublicUrl(photo.storage_path);
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('listings')
    .update({ cover_url: coverUrl })
    .eq('id', parsed.data.listingId);

  if (error) {
    console.error('[setListingCoverPhoto] update failed', { error });
    return { ok: false, error: 'update_failed' };
  }

  // Phase 59: mirror setListingCover — push the chosen photo to
  // sort_order=0 so buyer-side photo-fallback (`/browse`, `/saved`,
  // photo-only swipe path) renders the same hero image the agent picked.
  if (parsed.data.photoId !== null) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data: rows } = (await (supabase as any)
      .from('listing_photos')
      .select('id, sort_order')
      .eq('listing_id', parsed.data.listingId)
      .order('sort_order', { ascending: true })) as {
      data: { id: string; sort_order: number }[] | null;
    };
    const order = (rows ?? []).map((r) => r.id);
    const chosenIdx = order.indexOf(parsed.data.photoId);
    if (chosenIdx > 0) {
      order.splice(chosenIdx, 1);
      order.unshift(parsed.data.photoId);
      for (let i = 0; i < order.length; i++) {
        // biome-ignore lint/suspicious/noExplicitAny: stub generated types
        await (supabase as any)
          .from('listing_photos')
          .update({ sort_order: i })
          .eq('id', order[i])
          .eq('listing_id', parsed.data.listingId);
      }
    }
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

// ─── deleteListingVideo ──────────────────────────────────────────

const DeleteVideoInput = z.object({
  listingId: z.string().uuid(),
  videoId: z.string().uuid(),
});

export type DeleteListingVideoResult = { ok: true } | { ok: false; error: string };

/**
 * Delete a listing_videos row.
 *
 * Authorization: RLS policy "agent manages own listing videos" gates the
 * delete — non-owners affect 0 rows. We do an explicit existence check
 * first so we can return a clean error instead of a silent 0-row delete.
 *
 * Side effects:
 *  - If this video was the listing's cover (`listings.cover_url` matches
 *    its CF Stream thumbnail URL), clear cover_url too. Otherwise the
 *    listing keeps a dangling cover URL pointing at a deleted asset.
 *  - The Cloudflare Stream asset itself is NOT deleted server-side.
 *    Same V1 trade-off as deleteCommunityVideo (see communities/actions.ts:284):
 *    accepted orphan, periodic reconcile job will sweep post-launch.
 */
export async function deleteListingVideo(
  listingId: string,
  videoId: string,
): Promise<DeleteListingVideoResult> {
  const parsed = DeleteVideoInput.safeParse({ listingId, videoId });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthorized' };

  // Look up the row first (RLS-fenced) so we can (a) confirm the caller
  // owns it and (b) read cf_video_id for the cover-url cleanup below.
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: video } = (await (supabase as any)
    .from('listing_videos')
    .select('id, cf_video_id, listing_id')
    .eq('id', parsed.data.videoId)
    .eq('listing_id', parsed.data.listingId)
    .maybeSingle()) as { data: { id: string; cf_video_id: string; listing_id: string } | null };

  if (!video) return { ok: false, error: 'not_found_or_forbidden' };

  // If this video is currently the cover, clear it. We compare cover_url
  // against the thumbnail URL we'd have written when set. Strict equality
  // on the full thumbnail URL is fine because setListingCover writes
  // exactly that string.
  const { thumbnailUrl } = await import('@/lib/cloudflare/stream');
  const thumb = thumbnailUrl(video.cf_video_id);
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select('cover_url')
    .eq('id', parsed.data.listingId)
    .maybeSingle()) as { data: { cover_url: string | null } | null };

  if (listing && listing.cover_url === thumb) {
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    await (supabase as any)
      .from('listings')
      .update({ cover_url: null })
      .eq('id', parsed.data.listingId);
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { error } = await (supabase as any)
    .from('listing_videos')
    .delete()
    .eq('id', parsed.data.videoId)
    .eq('listing_id', parsed.data.listingId);

  if (error) {
    console.error('[deleteListingVideo] delete failed', error);
    return { ok: false, error: 'delete_failed' };
  }

  revalidatePath(`/dashboard/listings/${parsed.data.listingId}/edit`);
  return { ok: true };
}
