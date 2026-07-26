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
import { fetchCityGeoUnits, type GeoUnitDTO } from '@/lib/feed/geo-units';
import { parseFeedPoolQuery } from '@/lib/zod/feed-pool';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CF_STREAM_BASE = 'https://videodelivery.net';

/** §1.7: one tease listing per ten cards in stages 1–2. */
const TEASE_PER = 10;

export interface PoolListingDTO {
  id: string;
  slug: string;
  address: string;
  priceLabel: string;
  bedBathSqft: string;
  heroUrl: string;
  videoUrl?: string;
  communityId?: string;
  /** City unit this listing sits in — a tease swipe credits it (§1.7). */
  geoUnitId?: string;
  /** Set in stages 1–2: likeable, weighted 0.5×, match badge suppressed. */
  tease?: true;
  /** Set in stage 3: preview inside an already-liked community. */
  preview?: true;
}

export interface PoolCommunityDTO {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  heroUrl: string;
  videoUrl?: string;
  blurb?: string;
  listingCount?: number;
}

export interface FeedPoolResponse {
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
    ...(citySlug(card.listing.city, card.listing.state)
      ? { geoUnitId: citySlug(card.listing.city, card.listing.state) }
      : {}),
  };
}

/**
 * Communities are projected from the same BrowseCard rows, de-duped by slug.
 * Only rows that actually carry a community are eligible, and only real fields
 * are emitted — a community with no hero image is dropped rather than shown
 * with a blank card.
 */
function projectCommunities(cards: BrowseCard[]): PoolCommunityDTO[] {
  const bySlug = new Map<string, PoolCommunityDTO>();
  for (const card of cards) {
    const c = card.community;
    if (!c?.slug || bySlug.has(c.slug)) continue;
    const hero = heroUrlFor(card);
    if (!hero) continue;
    bySlug.set(c.slug, {
      id: c.slug,
      slug: c.slug,
      name: c.name,
      city: c.city ?? '',
      state: c.state ?? '',
      heroUrl: hero,
      ...(videoUrlFor(card) ? { videoUrl: videoUrlFor(card) } : {}),
      ...(c.description ? { blurb: c.description } : {}),
      ...(c.listingCount != null ? { listingCount: c.listingCount } : {}),
    });
  }
  return [...bySlug.values()];
}

/**
 * §0.2 gate. Takes every eligible listing and returns only what this stage is
 * allowed to see, tagged so the client renders the right badge suppression.
 */
export function gateListings(
  all: PoolListingDTO[],
  stage: number,
  limit: number,
  likedCommunityIds: string[],
): PoolListingDTO[] {
  if (stage <= 0) return [];

  if (stage <= 2) {
    const teaseCap = Math.ceil(limit / TEASE_PER);
    return all.slice(0, teaseCap).map((l) => ({ ...l, tease: true as const }));
  }

  if (stage === 3) {
    // Previews are scoped to communities the buyer already liked. With no
    // liked communities there is nothing to preview — that is the correct
    // empty result, not a reason to fall back to unfiltered listings.
    if (likedCommunityIds.length === 0) return [];
    const liked = new Set(likedCommunityIds);
    return all
      .filter((l) => l.communityId && liked.has(l.communityId))
      .map((l) => ({ ...l, preview: true as const }));
  }

  return all;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { stage, offset, limit, videosOnly, likedCommunityIds } =
    parseFeedPoolQuery(url);

  // Stage 0 shows no listings at all, so don't pay for the listing query.
  const needsListingRows = stage > 0;

  const [rows, geoUnits] = await Promise.all([
    needsListingRows
      ? videosOnly
        ? fetchBrowseCardsVideosOnly(offset, limit)
        : fetchBrowseCards(offset, limit)
      : Promise.resolve([] as BrowseCard[]),
    fetchCityGeoUnits(),
  ]);

  const listings = gateListings(
    rows.map(projectListing),
    stage,
    limit,
    likedCommunityIds,
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
      communities: projectCommunities(rows),
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
