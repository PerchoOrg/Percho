/**
 * Ingest the photos on a web page into `listing_photos`.
 *
 * The home tour's counterpart to `ingestPagePhotos`, added 2026-09-02 because
 * a listing's photos do not always arrive by upload. A builder's quick move-in
 * has no MLS feed and no agent photo shoot — its imagery lives on the
 * builder's own page, and until now the only way in was an admin script
 * (`scripts/admin/import-jw-listing.ts`, written for one builder's markup).
 *
 * Everything up to "these are the bytes worth keeping" is shared with the
 * community path via `collectPagePhotos` — the same furniture filter, the same
 * size floor, the same 80-image cap. What differs is where the rows land and
 * what state they land in:
 *
 *   community   poi_photos, `status='pending'` — a Google-scraped place nobody
 *               has looked at, so approving is the work.
 *   listing     listing_photos, review_status left at its column default of
 *               `approved` (migration 20260821100000, owner: "all the photos
 *               in the listing should be auto approved for plan purpose").
 *               Reviewing a home tour is REJECTING the few that should not be
 *               in the film, and a page an admin pasted by hand is no less
 *               deliberate than an upload.
 *
 * Re-fetching the same page is free: the storage path is content-addressed, so
 * a photo already held is recognised by its bytes rather than by its URL —
 * which matters, because a resize CDN hands the same photograph a new URL when
 * the page is re-rendered.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { LISTING_PHOTOS_BUCKET, photoPublicUrl } from '@/lib/supabase/storage';
import { collectPagePhotos, extensionFor } from './ingest-page-photos';

export interface ListingIngestResult {
  listing_id: string;
  found: number;
  added: number;
  skipped: Array<{ url: string; reason: string }>;
}

/**
 * Where a web-fetched photo is stored.
 *
 * `{listingId}/…` is not decoration — the storage RLS policy scopes writes by
 * `split_part(name, '/', 1)`, and the render worker reads the listing's photos
 * by prefix. The `web-` marker is the only trace of provenance a
 * `listing_photos` row can carry: the table has no `content_hash` or
 * `attribution` column, and adding two for a filename felt like the wrong
 * trade.
 */
export function webPhotoStoragePath(
  listingId: string,
  contentHash: string,
  contentType: string,
): string {
  return `${listingId}/web-${contentHash.slice(0, 24)}${extensionFor(contentType)}`;
}

export async function ingestListingPagePhotos(
  listingId: string,
  pageUrl: string,
): Promise<ListingIngestResult | { error: string; message: string }> {
  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const sb: any = createServiceClient();

  const { data: listing } = (await sb
    .from('listings')
    .select('id, cover_url')
    .eq('id', listingId)
    .maybeSingle()) as { data: { id: string; cover_url: string | null } | null };
  if (!listing) return { error: 'not_found', message: 'No such listing.' };

  const harvest = await collectPagePhotos(pageUrl);
  if ('error' in harvest) return harvest;

  // New photos go after the ones already there, in the order the page listed
  // them. `sort_order` is what the table and the plan step read as "the
  // agent's order", so appending is the only non-destructive answer.
  const { data: maxRow } = (await sb
    .from('listing_photos')
    .select('sort_order')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: { sort_order: number } | null };
  let nextSort = (maxRow?.sort_order ?? -1) + 1;

  const skipped: ListingIngestResult['skipped'] = [...harvest.skipped];
  let added = 0;
  let firstPath: string | null = null;

  for (const image of harvest.images) {
    const { url, bytes, contentType, contentHash } = image;
    const storagePath = webPhotoStoragePath(listingId, contentHash, contentType);

    const { data: existing } = (await sb
      .from('listing_photos')
      .select('id')
      .eq('listing_id', listingId)
      .eq('storage_path', storagePath)
      .maybeSingle()) as { data: { id: string } | null };
    if (existing) {
      skipped.push({ url, reason: 'already ingested' });
      continue;
    }

    const { error: upErr } = await sb.storage
      .from(LISTING_PHOTOS_BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: true });
    if (upErr) {
      skipped.push({ url, reason: `upload failed: ${upErr.message}` });
      continue;
    }

    const { error: rowErr } = await sb.from('listing_photos').insert({
      listing_id: listingId,
      storage_path: storagePath,
      width: image.width,
      height: image.height,
      status: 'ready',
      sort_order: nextSort,
      // `review_status` and `enhanced_status` are left to their column
      // defaults — 'approved' and 'queued'. The second is the enhance queue
      // itself (migration 20260821120000), so setting it here would be
      // duplicating the schema, and getting it wrong would silently skip the
      // upscale the render worker expects to have run.
    });
    if (rowErr) {
      skipped.push({ url, reason: `insert failed: ${rowErr.message}` });
      continue;
    }

    firstPath ??= storagePath;
    nextSort += 1;
    added += 1;
  }

  // Same rule as the dashboard's upload action: the first asset a listing ever
  // gets becomes its cover, and an existing pick is never overridden.
  if (firstPath && !listing.cover_url) {
    await sb
      .from('listings')
      .update({ cover_url: photoPublicUrl(firstPath) })
      .eq('id', listingId);
  }

  return { listing_id: listingId, found: harvest.found, added, skipped };
}
