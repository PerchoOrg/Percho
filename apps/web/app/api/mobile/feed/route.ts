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

import { fetchAiTourVideoByCommunity } from '@/lib/feed/ai-tour-videos';
import type { BrowseCard } from '@/lib/feed/browse-card';
import {
  fetchBrowseCards,
  fetchBrowseCardsByIds,
  fetchBrowseCardsVideosOnly,
} from '@/lib/feed/browse-cards';
import {
  type PoolCommunityDTO,
  fetchCommunityPool,
  fetchCommunityPoolByIds,
} from '@/lib/feed/community-pool';
import { fetchNeighborhoodScores } from '@/lib/feed/fetch-neighborhood-scores';
import { type GeoUnitDTO, fetchCityGeoUnits } from '@/lib/feed/geo-units';
import { type LikedCommunityRef, type PoolListingDTO, gateListings } from '@/lib/feed/listing-gate';
import { listingHighlightDims } from '@/lib/feed/listing-highlights';
import {
  fetchVerticalVideoCommunityIds,
  fetchVerticalVideoListingIds,
  fetchVerticalVideos,
  streamManifestUrl,
} from '@/lib/feed/vertical-videos';
import { createServiceClient } from '@/lib/supabase/server';
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

/**
 * The video URL a PHONE card may play, from the browse card alone.
 *
 * Deliberately does NOT fall back to `card.hero.cfVideoId`. That field is built
 * by `lib/feed/browse-cards.ts` with `webVideoUid`, which prefers the wide web
 * render — so whenever this fallback fired, the phone played the web cut
 * (owner 2026-08-21: "for listing, we still use web video instead of ios video
 * on ios"). The phone's cut is resolved by `fetchVerticalVideos`, which uses
 * the phone's preference order, and that is the only CF uid allowed through.
 *
 * `externalUrl` survives because it is shape-agnostic: a demo listing ships one
 * file and there is no other render to prefer.
 */
function phoneVideoUrlFor(card: BrowseCard): string | undefined {
  if (card.mediaKind !== 'video') return undefined;
  return card.hero?.externalUrl ?? undefined;
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
  return `$${price.toLocaleString('en-US')}`;
}

function citySlug(city: string | null, state: string | null): string | undefined {
  if (!city || !state) return undefined;
  const slug = `${city}-${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `city:${slug}`;
}

/**
 * @param verticalUid 9:16 stream uid for this listing, when one exists. Preferred
 * over the browse-card hero because that hero resolves to
 * `cf_video_id_landscape` in production — landscape video on a full-bleed 9:16
 * card. See `lib/feed/vertical-videos.ts`.
 */
function projectListing(card: BrowseCard, verticalUid?: string): PoolListingDTO {
  const dims = listingHighlightDims(card.listing.description);
  return {
    id: card.listing.id,
    slug: card.listing.slug,
    address: card.listing.address,
    priceLabel: formatPrice(card.listing.price),
    // The real number alongside the label — §1.6's challenge card cannot round.
    ...(card.listing.price != null ? { price: card.listing.price } : {}),
    bedBathSqft: formatBedBathSqft(card.listing),
    heroUrl: heroUrlFor(card),
    // Coordinates for the card's locality map thumbnail. Both or neither.
    ...(card.listing.lat != null && card.listing.lng != null
      ? { lat: card.listing.lat, lng: card.listing.lng }
      : {}),
    ...(card.listing.mapUrl ? { mapUrl: card.listing.mapUrl } : {}),
    ...(verticalUid
      ? { videoUrl: streamManifestUrl(verticalUid) }
      : phoneVideoUrlFor(card)
        ? { videoUrl: phoneVideoUrlFor(card) }
        : {}),
    ...(card.community?.slug ? { communityId: card.community.slug } : {}),
    ...(card.listing.city ? { city: card.listing.city } : {}),
    ...(card.listing.state ? { state: card.listing.state } : {}),
    // Real prose only — an empty array is omitted so the client renders no
    // paragraph rather than an empty block (§3 "real or absent").
    ...(card.listing.description && card.listing.description.length > 0
      ? { description: card.listing.description }
      : {}),
    // The redline's chip row above the CTA. Omitted (not `[]`) when the listing's
    // own copy asserts none of the dims — see lib/feed/listing-highlights.ts.
    ...(dims.length > 0 ? { dims } : {}),
    // >1 only — see the field docs. A "1 Photos" pill is worse than none.
    ...(card.photoCount !== undefined && card.photoCount > 1
      ? { photoCount: card.photoCount }
      : {}),
    ...(citySlug(card.listing.city, card.listing.state)
      ? { geoUnitId: citySlug(card.listing.city, card.listing.state) }
      : {}),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { stage, offset, limit, videosOnly, videoFirst, likedCommunityIds, cities } =
    parseFeedPoolQuery(url);

  // Stage 0 shows no listings at all, so don't pay for the listing query.
  const needsListingRows = stage > 0;
  // Communities are Stage 3's main card type; earlier stages don't show them.
  const needsCommunities = stage >= 3;

  const [pageRows, geoUnits, communities, verticalVideos, aiTourVideos] = await Promise.all([
    needsListingRows
      ? videosOnly
        ? fetchBrowseCardsVideosOnly(offset, limit)
        : fetchBrowseCards(offset, limit)
      : Promise.resolve([] as BrowseCard[]),
    fetchCityGeoUnits(),
    needsCommunities
      ? fetchCommunityPool({ offset, limit, cities })
      : Promise.resolve([] as PoolCommunityDTO[]),
    // Cheap (15 ready rows) and needed for both listings and communities.
    fetchVerticalVideos(),
    // AI-generated community tours (Seedance); only communities have these.
    needsCommunities ? fetchAiTourVideoByCommunity() : Promise.resolve(new Map<string, string>()),
  ]);

  /**
   * `videoFirst` has to FETCH the video-bearing listings, not just sort the page.
   *
   * First attempt only reordered `pageRows`, which changed nothing: the six
   * listings with a 9:16 video are not in the newest-first first page at all, so
   * there was nothing to move. Sorting a page you have cannot surface a row you
   * did not fetch — the reason this needs its own read.
   */
  let rows = pageRows;
  if (needsListingRows && videoFirst && !videosOnly) {
    const videoIds = await fetchVerticalVideoListingIds();
    const videoCards = videoIds.length > 0 ? await fetchBrowseCardsByIds(videoIds) : [];
    const seen = new Set(videoCards.map((c) => c.listing.id));
    rows = [...videoCards, ...pageRows.filter((c) => !seen.has(c.listing.id))];
  }

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
    liked.length > 0 ? liked : cities.map((city) => ({ id: `city:${city}`, city }));

  const projected = rows.map((card) =>
    projectListing(card, verticalVideos.byListing.get(card.listing.id)),
  );

  /**
   * Neighborhood scores, attached after projection so it is ONE batched read for
   * the whole page instead of one per card.
   *
   * Failure here must not take the feed down: scores are decoration on a card
   * whose price/photo/address are the actual payload. A thrown POI query would
   * otherwise turn a cosmetic panel into a blank feed.
   */
  let scored = projected;
  if (needsListingRows && projected.length > 0) {
    try {
      const scores = await fetchNeighborhoodScores(
        // Service role, deliberately: RLS caps anon at `status = 'approved'`,
        // which on real data is 4 of 161 links. See the module header — this
        // returns aggregates only, never POI names.
        createServiceClient(),
        projected.map((l) => l.id),
      );
      scored = projected.map((l) => {
        const s = scores.get(l.id);
        return s ? { ...l, scores: s } : l;
      });
    } catch (err) {
      console.warn(
        '[feed] neighborhood scores unavailable, serving cards without them:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Dev-only reordering (§ see `videoFirst` in lib/zod/feed-pool.ts): surface the
  // cards that actually have a 9:16 video so video playback is testable without
  // swiping through the whole photo-only pool. Order within each group is
  // preserved, so this only moves cards forward — it never invents or drops any.
  const ordered = videoFirst
    ? [...scored.filter((l) => l.videoUrl), ...scored.filter((l) => !l.videoUrl)]
    : scored;

  const listings = gateListings(ordered, stage, limit, likedRefs);

  /**
   * `videoFirst` has to FETCH the video-bearing communities, exactly as it does
   * for listings above — reordering the page is not enough.
   *
   * Owner on device (2026-08-02): 「ios上测试dev sampler里一条带视频的community都
   * 没有看到」. The community pool is ordered by `name` and read as
   * `offset=0, limit=12`, and the only community with a ready video today is
   * Ashley Crossing — **~280th alphabetically**. The sort below had nothing to
   * hoist because the row was never in the page. Same bug, same fix as the
   * `videoFirst` block for listings; the listing half was fixed and the
   * community half was left sorting an empty set.
   */
  let communityRows = communities;
  if (needsCommunities && videosOnly) {
    /**
     * `videosOnly` covered listings and silently ignored communities, so the
     * flag that promises "only cards with video" still shipped 12 photo-only
     * community cards (owner 2026-08-21: "only show cards with videos, either
     * community or listing").
     *
     * Fetched by id for the same reason the `videoFirst` block below does it:
     * the community pool is ordered by name over 8,684 rows and the handful
     * with a tour are nowhere near the first page. Filtering the page would
     * return nothing at all.
     */
    const videoCommunityIds = await fetchVerticalVideoCommunityIds();
    const allVideoIds = [...new Set([...videoCommunityIds, ...aiTourVideos.keys()])];
    communityRows = allVideoIds.length > 0 ? await fetchCommunityPoolByIds(allVideoIds) : [];
  } else if (needsCommunities && videoFirst) {
    const videoCommunityIds = await fetchVerticalVideoCommunityIds();
    const aiVideoIds = [...aiTourVideos.keys()];
    const allVideoIds = [...new Set([...videoCommunityIds, ...aiVideoIds])];
    const extra = allVideoIds.length > 0 ? await fetchCommunityPoolByIds(allVideoIds) : [];
    const seen = new Set(extra.map((c) => c.id));
    communityRows = [...extra, ...communities.filter((c) => !seen.has(c.id))];
  }

  // Attach vertical video to communities too. `CommunityFace` already renders
  // `CardVideo` when `videoUrl` is set; the DTO just never carried the field.
  // AI tour videos (Seedance) attach the same way; vertical wins if both exist.
  const communitiesWithVideo = communityRows.map((c) => {
    const uid = verticalVideos.byCommunity.get(c.id);
    if (uid) return { ...c, videoUrl: streamManifestUrl(uid) };
    const aiUrl = aiTourVideos.get(c.id);
    return aiUrl ? { ...c, videoUrl: aiUrl } : c;
  });
  // Belt and braces: the id lists above come from two different tables, and a
  // row can be listed there and still resolve to no playable URL. `videosOnly`
  // is a promise about what the buyer sees, so it is enforced on the thing the
  // buyer actually gets.
  const videoBearing = videosOnly
    ? communitiesWithVideo.filter((c) => c.videoUrl)
    : communitiesWithVideo;
  const orderedCommunities = videoFirst
    ? [...videoBearing.filter((c) => c.videoUrl), ...videoBearing.filter((c) => !c.videoUrl)]
    : // `videoBearing`, not `communitiesWithVideo` — the un-sorted branch has to
      // honour the filter too, or `videosOnly` would only work with `videoFirst`.
      videoBearing;

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
      communities: orderedCommunities,
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
