/**
 * /dashboard/listings/[id]/edit — listing detail (Phase 47.5–47.8 rebuild).
 *
 * Hero: 3-section grid header (HeroHeader) — Row 1 chromeless controls,
 * Row 2 left-aligned title/subtitle, Row 3 three frosted-glass stats
 * (Views / Saves / Leads). No absolute positioning. No overlap risk.
 *
 * Tabs (5): Details · Media · Marketing · Leads · Analytics.
 *   - "Marketing" merges the old Social + Tour tabs (sub-tabs inside).
 *   - "Leads" is a per-listing slice of the global lead inbox.
 *   - "Analytics" inlines what used to live at /dashboard/listings/[id]/analytics
 *     (that route now redirects here with ?tab=analytics).
 *
 * Stats are SSR-fetched once per page load. They're snapshot numbers, not
 * realtime — the dedicated Analytics tab carries the funnel + breakdowns
 * for deeper inspection.
 */

import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

import { HubTabs } from '@/app/dashboard/_components/HubTabs';
import { FileText, ImageIcon, Megaphone, Users, LineChart } from 'lucide-react';
import { HeroHeader } from '@/app/dashboard/_components/HeroHeader';
import { HeroControl } from '@/app/dashboard/_components/HeroControl';
import { InstantStatusToggle } from '@/app/dashboard/_components/InstantStatusToggle';

import { type CommunityOption, EditListingForm, type ListingContext } from './EditListingForm';
import { DraftAddressPanel } from './DraftAddressPanel';
import { isDraftAddress } from '@/app/dashboard/listings/draft';
import { GenerateTourPanel } from './GenerateTourPanel';
import type { ListingPhotoRow } from './PhotoPanel';
import { MediaPanel } from './MediaPanel';
import type { ListingVideoRow } from './VideoPanel';
import { SocialCopyPanel } from './SocialCopyPanel';
import { ListingLeadsPanel } from './ListingLeadsPanel';
import { AnalyticsPanel } from '@/app/dashboard/_components/AnalyticsPanel';
import { DangerZone } from './DangerZone';

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
  // Phase 53D: getSession() reads cookie locally (~5ms) instead of round-tripping
  // to Supabase to validate the JWT (~150ms). Middleware re-validates on each
  // request — page-level check is defense-in-depth, not the source of truth.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
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

  // ── Cover resolution (unchanged from phase 46) ───────────────────────
  let initialCoverVideoId: string | null = null;
  if (listing.cover_url) {
    for (const v of videos) {
      try {
        if (thumbnailUrl(v.cf_video_id) === listing.cover_url) {
          initialCoverVideoId = v.id;
          break;
        }
      } catch {
        // ignore
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

  const draft = isDraftAddress(listing.address);

  const subtitle = draft
    ? 'Draft — set an address to continue'
    : [listing.city, listing.state].filter(Boolean).join(', ') +
      (listing.zip ? ` ${listing.zip}` : '') +
      (listing.neighborhood ? ` · ${listing.neighborhood}` : '');

  const heroTitle = draft ? 'New listing' : listing.address;

  const listingContext: ListingContext = {
    address: listing.address,
    city: listing.city,
    state: listing.state,
    neighborhood: listing.neighborhood,
  };

  return (
    <>
      <HeroHeader
        coverUrl={heroCover}
        title={heroTitle}
        subtitle={subtitle}
        controls={
          <>
            <HeroControl href={`/dashboard/listings/${listing.id}/preview`}>
              <span aria-hidden>↗</span>
              <span>Preview</span>
            </HeroControl>
            <InstantStatusToggle id={listing.id} status={listing.status} />
          </>
        }
      />

      <HubTabs
        tabs={[
          { id: 'details', label: 'Details', icon: <FileText className="h-5 w-5" strokeWidth={1.6} /> },
          { id: 'media', label: 'Media', icon: <ImageIcon className="h-5 w-5" strokeWidth={1.6} /> },
          { id: 'marketing', label: 'Marketing', icon: <Megaphone className="h-5 w-5" strokeWidth={1.6} /> },
          { id: 'leads', label: 'Leads', icon: <Users className="h-5 w-5" strokeWidth={1.6} /> },
          { id: 'analytics', label: 'Analytics', icon: <LineChart className="h-5 w-5" strokeWidth={1.6} /> },
        ]}
        defaultTab="details"
        panels={{
          details: draft ? (
            <DraftAddressPanel listingId={listing.id} />
          ) : (
            <div className="space-y-6">
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
              <DangerZone listingId={listing.id} />
            </div>
          ),
          media: draft ? (
            <DraftLockedNotice />
          ) : (
            <div className="space-y-4">
              <MediaPanel
                listingId={listing.id}
                initialVideos={videos}
                initialCoverVideoId={initialCoverVideoId}
                initialPhotos={photos}
                initialCoverPhotoId={initialCoverPhotoId}
              />
              <GenerateTourPanel listingId={listing.id} />
            </div>
          ),
          marketing: draft ? <DraftLockedNotice /> : <SocialCopyPanel listingId={listing.id} />,
          leads: draft ? <DraftLockedNotice /> : <ListingLeadsPanel listingId={listing.id} />,
          analytics: draft ? (
            <DraftLockedNotice />
          ) : (
            <AnalyticsPanel entityKind="listing" entityId={listing.id} />
          ),
        }}
      />
    </>
  );
}

function DraftLockedNotice() {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-ink2 text-sm">Set an address on the Details tab to unlock this section.</p>
    </section>
  );
}
