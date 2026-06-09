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
import { PublishPanel } from './PublishPanel';
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
        <p className="text-sm text-cream/60">
          Listing not found, or you don&apos;t have access to it.
        </p>
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

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: agent } = (await (supabase as any)
    .from('agents')
    .select('slug')
    .eq('id', listing.agent_id)
    .maybeSingle()) as { data: { slug: string } | null };

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{listing.address}</h1>
        <p className="mt-1 text-sm text-cream/60">
          {listing.city}, {listing.state}
          {listing.zip ? ` ${listing.zip}` : ''}
          {listing.neighborhood ? ` · ${listing.neighborhood}` : ''} · slug:{' '}
          <code className="text-cream">{listing.slug}</code>
        </p>
      </header>

      <PublishPanel
        listingId={listing.id}
        status={listing.status}
        agentSlug={agent?.slug ?? null}
        listingSlug={listing.slug}
      />

      <section className="rounded border border-bronze/30 bg-ink2 p-6">
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

      <section className="rounded border border-bronze/30 bg-ink2 p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Videos</h2>
          <span className="text-xs text-cream/50">Drag to reorder · use ⓒ to set cover</span>
        </div>
        <VideoPanel
          listingId={listing.id}
          initialVideos={videos}
          initialCoverVideoId={initialCoverVideoId}
        />
      </section>
    </div>
  );
}
