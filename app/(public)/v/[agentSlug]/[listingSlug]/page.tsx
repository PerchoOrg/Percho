import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { fetchBrowseCards } from '@/lib/feed/browse-cards';
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
  if (!imageUrl && listingVideos[0]?.cf_video_id) {
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

  // Phase 35.3 (2026-06-17): /v/ now mirrors the explore feed so a buyer
  // who lands here from a share link can swipe up/down to neighboring
  // listings — same as if they'd found this listing inside /browse/feed.
  // Tianrou: "explore 里别的 listing 都可以上下滑切其他 listing,为什么
  // 这个滑不了?" — exactly. Buyer doesn't know /v/ is a separate route;
  // their mental model is one explore stream.
  //
  // Strategy:
  //   - Video-backed listing → load the full explore card list, place
  //     this listing at the front, append the rest. We front-place
  //     instead of "find + center" because /browse/feed already builds
  //     this listing card with multi-hero pool / community videos /
  //     POIs from loadListingFeedBySlug, while fetchBrowseCards builds
  //     a slimmer card. Front-place keeps this listing's rich card +
  //     hands the swipe-down lane to explore neighbors.
  //   - Photo-only listing → keep old single-card behavior. Explore
  //     feed is video-only by product rule (BrowseFeedPage filters
  //     mediaKind === 'video'), so there's no neighbor lane to swipe
  //     into. Single card here matches that constraint.
  //
  // Dedup: drop any explore card whose listing.id === this listing.id
  // so we don't render the same listing twice.
  // Phase 35.4 (2026-06-18): photo listings also flow into the explore
  // tail now (see browse/feed/page.tsx). Same front-place strategy as
  // video — keep this listing's rich card on top, append explore
  // neighbors (mixed photo + video) so a buyer who landed via a share
  // link can swipe through the rest of Explore.
  const photos =
    data.listingVideos.length === 0 ? await loadListingPhotos(data.listing.id) : null;
  const localCards = await buildListingCards(data, photos);
  const headCard = localCards[0];

  let cards = localCards;
  if (headCard) {
    const exploreCards = await fetchBrowseCards();
    const tail = exploreCards.filter((c) => c.listing.id !== data.listing.id);
    cards = [headCard, ...tail];
  }

  return <VideoFeed listingId={data.listing.id} cards={cards} />;
}
