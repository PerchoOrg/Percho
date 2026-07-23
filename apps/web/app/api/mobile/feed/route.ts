/**
 * Mobile feed pagination endpoint.
 *
 * Contract in `packages/shared/src/types.ts` (FeedPage). Reuses the
 * server-side `fetchBrowseCards` from the web browse feed and projects
 * BrowseCard → mobile FeedCard (a much thinner shape — no cf-stream
 * videos, no rail categories, no photo carousels; those live behind
 * "Explore →" on the detail page).
 *
 * See paginated-feed-and-swipe-ui skill: `.range(offset, offset+limit-1)`,
 * clamp `limit` server-side, `done: fresh.length < limit`.
 *
 * Ask-cards are NOT injected here. Mobile client owns ask interleaving
 * so it can skip scope layers the user has already answered.
 */

import { NextResponse } from 'next/server';
import { fetchBrowseCards, fetchBrowseCardsVideosOnly } from '@/lib/feed/browse-cards';
import type {
  FeedCard,
  FeedPage,
  CommunityCard,
  ListingCard,
} from '@percho/shared';
import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';

export const dynamic = 'force-dynamic';

const CF_STREAM_BASE = 'https://videodelivery.net';

function heroUrlFor(card: BrowseCard): string {
  if (card.mediaKind === 'photo' && card.heroPhotoUrl) return card.heroPhotoUrl;
  if (card.gridCoverUrl) return card.gridCoverUrl;
  // Cloudflare Stream thumbnail — first frame as still.
  const cfId = card.hero?.cfVideoId;
  if (cfId) return `${CF_STREAM_BASE}/${cfId}/thumbnails/thumbnail.jpg?time=1s`;
  return '';
}

function videoUrlFor(card: BrowseCard): string | undefined {
  if (card.mediaKind !== 'video') return undefined;
  if (card.hero?.externalUrl) return card.hero.externalUrl;
  const cfId = card.hero?.cfVideoId;
  if (cfId) return `${CF_STREAM_BASE}/${cfId}/manifest/video.m3u8`;
  return undefined;
}

function formatBedBathSqft(l: BrowseCard['listing']): string {
  const parts: string[] = [];
  if (l.beds != null) parts.push(`${l.beds} bd`);
  if (l.baths != null) parts.push(`${l.baths} ba`);
  if (l.sqft != null) parts.push(`${l.sqft.toLocaleString()} sqft`);
  return parts.join(' · ');
}

function formatPrice(price: number | null): string {
  if (price == null) return '';
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(price / 1000)}K`;
}

function projectListing(card: BrowseCard): ListingCard {
  return {
    kind: 'listing',
    id: card.listing.id,
    slug: card.listing.slug,
    address: card.listing.address,
    priceLabel: formatPrice(card.listing.price),
    bedBathSqft: formatBedBathSqft(card.listing),
    heroUrl: heroUrlFor(card),
    videoUrl: videoUrlFor(card),
    // No matchScore yet — mobile computes locally from persona.
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20;
  const limit = Math.min(40, Math.max(1, limitRaw));
  const videosOnly = url.searchParams.get('videosOnly') === '1';

  const rows = videosOnly
    ? await fetchBrowseCardsVideosOnly(offset, limit)
    : await fetchBrowseCards(offset, limit);
  const cards: FeedCard[] = rows.map(projectListing);

  const body: FeedPage = {
    cards,
    offset,
    limit,
    done: rows.length < limit,
  };
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store',
      // CORS — mobile hits this from Expo Go / native app on a different
      // origin. Read-only endpoint, no cookies needed.
      'Access-Control-Allow-Origin': '*',
    },
  });
}
