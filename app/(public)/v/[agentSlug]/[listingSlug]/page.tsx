import { thumbnailUrl } from '@/lib/cloudflare/stream';
import {
  buildListingCards,
  loadListingFeedBySlug,
  loadListingPhotos,
} from '@/lib/listing-feed/load';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VideoFeed } from './_components/VideoFeed';

/**
 * Public listing page — `/v/[agentSlug]/[listingSlug]`.
 *
 * 2026-06-11 (parity hotfix): now reuses `/browse`'s `BrowseFeed` so the
 * right rail (Like / Schools / Nearby / Area / Sound / Share / Contact) is
 * identical to discovery.
 *
 * 2026-06-17 (Phase 27.10): data load + card build extracted to
 * `lib/listing-feed/load.ts` so the dashboard preview route can render the
 * same feed for draft / archived listings without duplicating logic. This
 * file is now a thin wrapper that:
 *   - filters to published-only (public web)
 *   - 404s on miss
 *   - keeps OG metadata behavior unchanged
 *
 * Uses anon supabase client + RLS (Phase 0 schema grants public SELECT on
 * published listings + ready videos + communities/schools/pois).
 */

export const revalidate = 3600;

type PageParams = { agentSlug: string; listingSlug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { agentSlug, listingSlug } = await params;
  const data = await loadListingFeedBySlug(agentSlug, listingSlug);
  if (!data) return { title: 'Listing not found · Vicinity' };
  const { listing, agent, listingVideos } = data;

  const title = `${listing.address} · ${listing.city}, ${listing.state}`;
  const priceText = listing.price ? `$${listing.price.toLocaleString()}` : null;
  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const description = [priceText, specs, `Listed by ${agent.name}`].filter(Boolean).join(' — ');

  let imageUrl: string | null = listing.cover_url ?? null;
  if (!imageUrl && listingVideos[0]) {
    try {
      imageUrl = thumbnailUrl(listingVideos[0].cf_video_id);
    } catch {
      imageUrl = null;
    }
  }

  const url = `/v/${agentSlug}/${listingSlug}`;
  const images = imageUrl ? [{ url: imageUrl, width: 1280, height: 720 }] : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'Vicinity',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function PublicListingPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { agentSlug, listingSlug } = await params;
  const data = await loadListingFeedBySlug(agentSlug, listingSlug);
  if (!data) notFound();

  const photos =
    data.listingVideos.length === 0 ? await loadListingPhotos(data.listing.id) : null;
  const cards = await buildListingCards(data, photos);

  return <VideoFeed listingId={data.listing.id} cards={cards} />;
}
