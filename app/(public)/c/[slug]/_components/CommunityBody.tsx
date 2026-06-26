'use client';

/**
 * CommunityBody — client island that owns both the hero (so a CTA pill can sit
 * absolute inside it) and the videos/listings grid below.
 *
 * Phase 45.28 (2026-06-21, owner immersion pass):
 *   - Hero shrunk: aspect-[16/7] → aspect-[5/2] mobile (~9% shorter),
 *     md:aspect-[21/5] → md:aspect-[5/1] desktop (~16% shorter).
 *   - Removed the [Community Videos | Active Listings] pill toggle row —
 *     videos render by default so the grid butts directly against the hero
 *     for a more immersive feel.
 *   - Added a "Live here →" CTA pill at the hero's bottom-right; clicking it
 *     switches the body to the listings grid. A subtle "← Community videos"
 *     text link above the listings grid provides the return path.
 *   - Hero moved out of page.tsx into this client island so the CTA can
 *     drive the videos/listings tab state without a route round-trip.
 *
 * Phase 47.2 (2026-06-21): videos + listings grids refactored on top of
 * GridFrame + GridCard / ListingGrid so /c/[slug] matches /browse,
 * /communities, /dashboard, /dashboard/communities, /saved, /nearby — all
 * grid surfaces now share aspect-[3/4], gap-1 md:gap-1.5, and identical
 * caption/badge styling. Inline aspect-square card markup deleted.
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { GridCard, GridCardCaption } from '@/app/_components/GridCard';
import { GridFrame } from '@/app/_components/GridFrame';
import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { track } from '@/lib/events/track';
import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
} from '@/lib/zod/community-video-categories';
import { useEffect, useState } from 'react';

const CATEGORY_META = new Map(COMMUNITY_VIDEO_CATEGORIES.map((m) => [m.id, m] as const));

type CommunityVideo = {
  id: string;
  cf_video_id: string;
  title: string | null;
  category: string | null;
};

type Tab = 'videos' | 'listings';

export function CommunityBody({
  community,
  heroCoverUrl,
  videos,
  listings,
}: {
  community: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    state: string;
    description: string | null;
  };
  heroCoverUrl: string | null;
  videos: CommunityVideo[];
  listings: BrowseCard[];
}) {
  const [tab, setTab] = useState<Tab>('videos');

  // Phase 50: fire one page_view per community visit so the agent's
  // Analytics tab on /dashboard/communities/[id] has data to show. The
  // events route enforces XOR(listing_id, community_id) — we only set
  // community_id here.
  useEffect(() => {
    track({ event_type: 'page_view', community_id: community.id });
  }, [community.id]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Hero — phase 45.28: 5/2 mobile, 5/1 desktop. */}
      <div className="relative aspect-[5/2] w-full overflow-hidden bg-surface md:aspect-[5/1] sm:rounded-b-xl">
        {heroCoverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroCoverUrl}
            alt={community.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-bronze/30 to-ink" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/10" />
        <div className="absolute inset-x-0 bottom-0 px-4 py-3 sm:px-6 sm:py-4">
          <h1 className="font-semibold text-2xl text-cream tracking-tight sm:text-3xl">
            {community.name}
          </h1>
          {/* Phase 45.28.6: CTA folds back inline (variant I1).
           *   Same line as the city, weight 600 / pure white /
           *   1.5px underline / arrow. Loud enough to land in 1s but
           *   still reads as a sentence, not chrome. State-flips to
           *   "← Walk through" on the listings tab. */}
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-cream/75">
              {community.city ? `${community.city}, ${community.state}` : community.state}
            </span>
            <span className="text-cream/40" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={() => setTab(tab === 'videos' ? 'listings' : 'videos')}
              className="font-semibold text-cream underline decoration-cream decoration-[1.5px] underline-offset-[3px] transition hover:decoration-cream/70"
            >
              {tab === 'videos' ? (
                <>
                  Live here <span aria-hidden="true">→</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">←</span> Walk through
                </>
              )}
            </button>
          </div>
          {community.description ? (
            <p className="mt-1 max-w-2xl text-cream/80 text-xs sm:text-sm">
              {community.description}
            </p>
          ) : null}
        </div>
      </div>

      {/* Body — Phase 47.2: padding aligned with grid gap (px-1 md:px-1.5)
          so the outer margin matches inter-card gutters and matches
          GridPageShell elsewhere. */}
      <div className="px-1 py-4 md:px-1.5">
        {tab === 'videos' ? (
          <VideosGrid communitySlug={community.slug} videos={videos} />
        ) : (
          <ListingsGrid listings={listings} />
        )}
      </div>
    </div>
  );
}

function VideosGrid({
  communitySlug,
  videos,
}: {
  communitySlug: string;
  videos: CommunityVideo[];
}) {
  if (videos.length === 0) {
    return (
      <div className="rounded border border-line border-dashed bg-surface px-6 py-12 text-center">
        <p className="text-ink2 text-sm">No videos in this community yet.</p>
      </div>
    );
  }
  return (
    <GridFrame>
      {videos.map((v) => {
        const meta = v.category ? CATEGORY_META.get(v.category as CommunityVideoCategoryId) : null;
        const coverUrl = thumbnailUrl(v.cf_video_id);
        return (
          <GridCard
            key={v.id}
            href={`/c/${communitySlug}/feed?start=${v.id}`}
            coverUrl={coverUrl}
            alt={meta?.label ?? 'Community video'}
            fallback={
              <div className="grid h-full w-full place-items-center text-muted text-xs">
                No cover
              </div>
            }
            caption={
              meta ? (
                <GridCardCaption title={meta.label} sub={meta.blurb} />
              ) : (
                <span className="sr-only">Community video</span>
              )
            }
          />
        );
      })}
    </GridFrame>
  );
}

function ListingsGrid({ listings }: { listings: BrowseCard[] }) {
  if (listings.length === 0) {
    return (
      <div className="rounded border border-line border-dashed bg-surface px-6 py-12 text-center">
        <p className="text-ink2 text-sm">No active listings in this community yet.</p>
      </div>
    );
  }
  const items: ListingGridItem[] = listings.map((card) => {
    // Phase 60: agent's cover_url wins over the mediaKind hero.
    const realSrc =
      card.gridCoverUrl ??
      (card.mediaKind === 'video'
        ? thumbnailUrl(card.hero.cfVideoId)
        : (card.heroPhotoUrl as string));
    return {
      id: card.listing.id,
      href:
        card.mediaKind === 'video'
          ? `/browse/feed?start=${encodeURIComponent(card.listing.id)}`
          : `/v/${card.agent.slug}/${card.listing.slug}`,
      coverUrl: realSrc ?? null,
      price: card.listing.price,
      beds: card.listing.beds,
      baths: card.listing.baths,
      sqft: card.listing.sqft,
      address: card.listing.address,
    };
  });
  return <ListingGrid items={items} />;
}
