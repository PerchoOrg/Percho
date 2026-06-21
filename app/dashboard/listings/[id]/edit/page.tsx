/**
 * /dashboard/listings/[id]/edit — listing detail (Phase 46 rebuild).
 *
 * New layout:
 *   - Hero cover (same aspect ratio as buyer-facing community page).
 *   - StatusPill in the top-right of the hero — Active/Inactive toggle
 *     replaces the old PublishPanel.
 *   - Sticky HubTabs underneath: Details · Media · Social · Tour.
 *   - Each tab renders inline; switching is `?tab=` URL state, no
 *     server nav. Auto-save (existing in EditListingForm/VideoPanel/
 *     PhotoPanel) keeps everything persistent.
 *
 * No more long-scroll multi-section page. No more PublishPanel block.
 *
 * Removed surface: `View analytics` link. Analytics is reachable via
 * the listing dashboard top bar; redundant on the hero. (If owner
 * wants it back, a small button can sit beside StatusPill.)
 */

import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

import { HubDetailShell } from '@/app/dashboard/_components/HubDetailShell';
import { StatusPill } from '@/app/dashboard/_components/StatusPill';

import { type CommunityOption, EditListingForm, type ListingContext } from './EditListingForm';
import { GenerateTourPanel } from './GenerateTourPanel';
import type { ListingPhotoRow } from './PhotoPanel';
import { PhotoPanelPrefillBridge } from './PhotoPanelPrefillBridge';
import { SocialCopyPanel } from './SocialCopyPanel';
import { type ListingVideoRow, VideoPanel } from './VideoPanel';
import { ListingDetailMenu } from './ListingDetailMenu';

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  await searchParams; // tab handled client-side by HubTabs
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
      <div className="mx-auto max-w-2xl px-4 py-12 text-center sm:px-6">
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
      () => ({ data: [] }),
    )) as { data: ListingPhotoRow[] | null };
  const photos = photosResp.data ?? [];

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: communitiesRaw } = (await (supabase as any)
    .from('communities')
    .select('id, name, city, state')
    .order('name', { ascending: true })) as { data: CommunityOption[] | null };
  const communities = communitiesRaw ?? [];

  // Match the persisted cover_url back to a videoId/photoId so the
  // VideoPanel / PhotoPanel can highlight the cover marker.
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

  // Hero cover fallback: cover_url, else first ready video thumb,
  // else first photo URL, else null.
  let heroCover = listing.cover_url ?? null;
  if (!heroCover) {
    const firstReadyVideo = videos.find((v) => v.status === 'ready');
    if (firstReadyVideo) {
      try {
        heroCover = thumbnailUrl(firstReadyVideo.cf_video_id);
      } catch {
        // skip
      }
    }
  }
  if (!heroCover && photos.length > 0 && photos[0]) {
    const { photoPublicUrl } = await import('@/lib/supabase/storage');
    heroCover = photoPublicUrl(photos[0].storage_path);
  }

  const subtitle =
    [listing.city, listing.state].filter(Boolean).join(', ') +
    (listing.zip ? ` ${listing.zip}` : '') +
    (listing.neighborhood ? ` · ${listing.neighborhood}` : '');

  const listingContext: ListingContext = {
    address: listing.address,
    city: listing.city,
    state: listing.state,
    neighborhood: listing.neighborhood,
  };

  return (
    <HubDetailShell
      coverUrl={heroCover}
      title={listing.address}
      subtitle={subtitle}
      rightOverlay={
        <div className="flex items-center gap-2">
          <StatusPill id={listing.id} status={listing.status} variant="listing" />
          <ListingDetailMenu listingId={listing.id} />
        </div>
      }
      tabs={[
        { id: 'details', label: 'Details' },
        { id: 'media', label: 'Media' },
        { id: 'social', label: 'Social' },
        { id: 'tour', label: 'Tour' },
      ]}
      defaultTab="details"
      panels={{
        details: (
          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
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
              listingContext={listingContext}
            />
          </section>
        ),
        media: (
          <div className="space-y-6">
            <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h2 className="text-base font-semibold">Videos</h2>
                <span className="text-muted text-xs">
                  Drag to reorder · use ⓒ to set cover
                </span>
              </div>
              <VideoPanel
                listingId={listing.id}
                initialVideos={videos}
                initialCoverVideoId={initialCoverVideoId}
              />
            </section>
            <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h2 className="text-base font-semibold">Photos</h2>
                <span className="text-muted text-xs">
                  JPEG / PNG / WebP — fallback cover when no video · use ⓒ to set cover
                </span>
              </div>
              <PhotoPanelPrefillBridge
                listingId={listing.id}
                initialPhotos={photos}
                initialCoverPhotoId={initialCoverPhotoId}
              />
            </section>
          </div>
        ),
        social: (
          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-base font-semibold">Social copy</h2>
              <span className="text-muted text-xs">
                Facebook + Instagram drafts, copy to clipboard
              </span>
            </div>
            <SocialCopyPanel listingId={listing.id} />
          </section>
        ),
        tour: (
          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
            <GenerateTourPanel listingId={listing.id} />
          </section>
        ),
      }}
    />
  );
}
