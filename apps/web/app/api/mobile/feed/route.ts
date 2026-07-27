/**
 * Mobile feed **pool** endpoint (v3, spec-v3 `01-feed.md` §0.2 / §1.7).
 *
 * This is NOT a composed feed. The v3 composition engine is client-side and
 * pure (`apps/mobile/lib/feed/generate-feed.ts`) because §1.7 re-evaluates
 * funnel advance after *every* swipe and §1.9 requires the feed to keep working
 * offline — a round trip per swipe would break the §1.8 flyout→settle window
 * and could not insert a milestone card while offline. So the server's job is
 * to supply eligible *inventory* and to enforce the funnel's data gate.
 *
 *   GET /api/mobile/feed?stage=1&offset=0&limit=12
 *   → { stage, offset, limit, done,
 *       pool: { geoUnits, listings, communities } }
 *
 * **§0.2 listing hard gate, enforced here as well as on the client.** Defence
 * in depth: the client gate is not the only one, because "no listings before
 * the buyer has told us anything" is the product's core promise, and a stale
 * app build must not be able to break it.
 *   stage 0    → zero listings, full stop.
 *   stage 1–2  → at most ceil(limit/10) tease listings (the §1.7 1-per-10 rate).
 *   stage 3    → previews only inside communities the buyer already liked.
 *   stage 4    → unlocked.
 *
 * Ask / tradeoff / challenge pools stay client-side static — they have no data
 * dependency, matching this route's original comment ("Ask-cards are NOT
 * injected here. Mobile client owns ask interleaving").
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { fetchBrowseCards, fetchBrowseCardsVideosOnly } from '@/lib/feed/browse-cards';
import {
  fetchCommunityPool,
  type PoolCommunityDTO,
} from '@/lib/feed/community-pool';
import { fetchCityGeoUnits, type GeoUnitDTO } from '@/lib/feed/geo-units';
import {
  gateListings,
  type LikedCommunityRef,
  type PoolListingDTO,
} from '@/lib/feed/listing-gate';
import { parseFeedPoolQuery } from '@/lib/zod/feed-pool';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CF_STREAM_BASE = 'https://videodelivery.net';

interface FeedPoolResponse {
  stage: number;
  offset: number;
  limit: number;
  done: boolean;
  pool: {
    geoUnits: GeoUnitDTO[];
    listings: PoolListingDTO[];
    communities: PoolCommunityDTO[];
  };
}

function heroUrlFor(card: BrowseCard): string {
  if (card.mediaKind === 'photo' && card.heroPhotoUrl) return card.heroPhotoUrl;
  if (card.gridCoverUrl) return card.gridCoverUrl;
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

function citySlug(city: string | null, state: string | null): string | undefined {
  if (!city || !state) return undefined;
  const slug = `${city}-${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `city:${slug}`;
}

function projectListing(card: BrowseCard): PoolListingDTO {
  return {
    id: card.listing.id,
    slug: card.listing.slug,
    address: card.listing.address,
    priceLabel: formatPrice(card.listing.price),
    bedBathSqft: formatBedBathSqft(card.listing),
    heroUrl: heroUrlFor(card),
    ...(videoUrlFor(card) ? { videoUrl: videoUrlFor(card) } : {}),
    ...(card.community?.slug ? { communityId: card.community.slug } : {}),
    ...(card.listing.city ? { city: card.listing.city } : {}),
    ...(citySlug(card.listing.city, card.listing.state)
      ? { geoUnitId: citySlug(card.listing.city, card.listing.state) }
      : {}),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { stage, offset, limit, videosOnly, likedCommunityIds, cities } =
    parseFeedPoolQuery(url);

  // Stage 0 shows no listings at all, so don't pay for the listing query.
  const needsListingRows = stage > 0;
  // Communities are Stage 3's main card type; earlier stages don't show them.
  const needsCommunities = stage >= 3;

  const [rows, geoUnits, communities] = await Promise.all([
    needsListingRows
      ? videosOnly
        ? fetchBrowseCardsVideosOnly(offset, limit)
        : fetchBrowseCards(offset, limit)
      : Promise.resolve([] as BrowseCard[]),
    fetchCityGeoUnits(),
    needsCommunities
      ? fetchCommunityPool({ offset, limit, cities })
      : Promise.resolve([] as PoolCommunityDTO[]),
  ]);

  // The buyer's liked-community ids arrive without their cities, so pair each
  // id with a city when we can. `cities` is the funnel's current city scope,
  // which is where the liked communities came from.
  const liked: LikedCommunityRef[] = likedCommunityIds.map((id) => {
    const match = communities.find((c) => c.id === id || c.slug === id);
    return match?.city ? { id, city: match.city } : { id };
  });
  // With no id/city pairing available, fall back to the funnel's city scope so
  // Stage 3 still previews listings in the areas the buyer narrowed to.
  const likedRefs: LikedCommunityRef[] =
    liked.length > 0
      ? liked
      : cities.map((city) => ({ id: `city:${city}`, city }));

  const listings = gateListings(
    rows.map(projectListing),
    stage,
    limit,
    likedRefs,
  );

  const body: FeedPoolResponse = {
    stage,
    offset,
    limit,
    // `done` tracks the underlying inventory scan, NOT the gated listing count:
    // stage 1 returns 2 of 12 rows by design, and reporting done=false there
    // would make the client loop forever trying to fill a page.
    done: needsListingRows ? rows.length < limit : true,
    pool: {
      geoUnits,
      listings,
      communities,
    },
  };

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store',
      // CORS — mobile hits this from Expo Go / the native app on a different
      // origin. Read-only endpoint, no cookies needed.
      'Access-Control-Allow-Origin': '*',
    },
  });
}
