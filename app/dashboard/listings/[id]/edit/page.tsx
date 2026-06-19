/**
 * /dashboard/listings/[id]/edit — listing edit page (Phase 4.3a).
 *
 * Phase 4.3a: metadata fields (price/beds/baths/sqft/year_built/lot_size/hoa/style/description).
 * Phase 4.3b will add the video panel (list, upload, dnd-kit reorder).
 * Phase 4.3c will add the cover photo selector.
 *
 * Address/city/state/zip/lat/lng are read-only on this page — see
 * `actions.ts` header for rationale.
 */

import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { type CommunityOption, EditListingForm, type ListingContext } from './EditListingForm';
import { GenerateTourPanel } from './GenerateTourPanel';
import { type ListingPhotoRow, PhotoPanel } from './PhotoPanel';
import { PublishPanel } from './PublishPanel';
import { SocialCopyPanel } from './SocialCopyPanel';
import { type ListingVideoRow, VideoPanel } from './VideoPanel';

interface ListingRow {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  neighborhood: string | null;
  status: string;
  slug: string;
  agent_id: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  lot_size: string | null;
  hoa: string | null;
  style: string | null;
  description: string[] | null;
  cover_url: string | null;
  community_id: string | null;
}

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=%2Fdashboard%2Flistings%2F${id}%2Fedit`);

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select(
      'id, address, city, state, zip, neighborhood, status, slug, agent_id, price, beds, baths, sqft, year_built, lot_size, hoa, style, description, cover_url, community_id',
    )
    .eq('id', id)
    .maybeSingle()) as { data: ListingRow | null };

  if (!listing) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-ink2">Listing not found, or you don&apos;t have access to it.</p>
      </div>
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: videosRaw } = (await (supabase as any)
    .from('listing_videos')
    .select('id, cf_video_id, kind, title, status, sort_order')
    .eq('listing_id', listing.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })) as { data: ListingVideoRow[] | null };

  const videos = videosRaw ?? [];

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const photosResp = (await (supabase as any)
    .from('listing_photos')
    .select('id, storage_path, alt_text, width, height, sort_order')
    .eq('listing_id', listing.id)
    .order('sort_order', { ascending: true })
    .then(
      (r: { data: ListingPhotoRow[] | null }) => r,
      // Hotfix (2026-06-12): migration 0011 may not be applied. Fall back
      // to empty list so the edit page still loads — PhotoPanel will just
      // show no photos and any upload attempt will surface its own error.
      () => ({ data: [] }),
    )) as { data: ListingPhotoRow[] | null };
  const photos = photosResp.data ?? [];

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: communitiesRaw } = (await (supabase as any)
    .from('communities')
    .select('id, name, city, state')
    .order('name', { ascending: true })) as { data: CommunityOption[] | null };
  const communities = communitiesRaw ?? [];

  // Match the persisted cover_url back to a videoId by recomputing the
  // CF Stream thumbnail URL for each video. We don't store the videoId
  // directly on the listing — only the rendered URL, because the public
  // feed reads `cover_url` directly.
  let initialCoverVideoId: string | null = null;
  if (listing.cover_url) {
    for (const v of videos) {
      try {
        if (thumbnailUrl(v.cf_video_id) === listing.cover_url) {
          initialCoverVideoId = v.id;
          break;
        }
      } catch {
        // ignore — env might be missing in dev for one video; skip
      }
    }
  }

  // Same idea for the photo cover: match cover_url against each photo's
  // public URL. Video cover and photo cover are mutually exclusive — they
  // share one column (`cover_url`) — so at most one of these will match.
  let initialCoverPhotoId: string | null = null;
  if (listing.cover_url && initialCoverVideoId === null) {
    const { photoPublicUrl } = await import('@/lib/supabase/storage');
    for (const p of photos) {
      if (photoPublicUrl(p.storage_path) === listing.cover_url) {
        initialCoverPhotoId = p.id;
        break;
      }
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('slug')
    .eq('id', listing.agent_id)
    .maybeSingle()) as { data: { slug: string } | null };

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{listing.address}</h1>
          <p className="mt-1 text-sm text-ink2">
            {listing.city}, {listing.state}
            {listing.zip ? ` ${listing.zip}` : ''}
            {listing.neighborhood ? ` · ${listing.neighborhood}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-2">
          {listing.status === 'published' && agent?.slug ? (
            <a
              href={`/v/${agent.slug}/${listing.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-3 py-1.5 text-xs text-ink2 transition hover:border-line-strong hover:text-ink"
            >
              Public URL ↗
            </a>
          ) : null}
          <a
            href={`/dashboard/listings/${listing.id}/analytics`}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-3 py-1.5 text-xs text-ink2 transition hover:border-line-strong hover:text-ink"
          >
            View analytics →
          </a>
        </div>
      </header>

      <PublishPanel listingId={listing.id} status={listing.status} />

      <section className="rounded border border-line bg-surface p-6">
        <h2 className="mb-4 text-base font-semibold">Listing details</h2>
        <EditListingForm
          listingId={listing.id}
          initial={{
            price: listing.price,
            beds: listing.beds,
            baths: listing.baths,
            sqft: listing.sqft,
            year_built: listing.year_built,
            lot_size: listing.lot_size,
            hoa: listing.hoa,
            style: listing.style,
            description: listing.description ?? [],
            community_id: listing.community_id,
          }}
          communities={communities}
          listingContext={
            {
              address: listing.address,
              city: listing.city,
              state: listing.state,
              neighborhood: listing.neighborhood,
            } satisfies ListingContext
          }
        />
      </section>

      <section className="rounded border border-line bg-surface p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-base font-semibold">Videos</h2>
          <span className="text-xs text-muted">Drag to reorder · use ⓒ to set cover</span>
        </div>
        <VideoPanel
          listingId={listing.id}
          initialVideos={videos}
          initialCoverVideoId={initialCoverVideoId}
        />
      </section>

      <section className="rounded border border-line bg-surface p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-base font-semibold">Photos</h2>
          <span className="text-xs text-muted">
            JPEG / PNG / WebP — used as fallback when no video is uploaded · use ⓒ to set cover
          </span>
        </div>
        <PhotoPanel
          listingId={listing.id}
          initialPhotos={photos}
          initialCoverPhotoId={initialCoverPhotoId}
        />
      </section>

      <section className="rounded border border-line bg-surface p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-base font-semibold">Social copy</h2>
          <span className="text-xs text-muted">Facebook + Instagram drafts, copy to clipboard</span>
        </div>
        <SocialCopyPanel listingId={listing.id} />
      </section>

      <GenerateTourPanel listingId={listing.id} />
    </div>
  );
}
