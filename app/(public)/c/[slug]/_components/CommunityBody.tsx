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
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { demoCoverFor } from '@/lib/demo-media';
import {
  COMMUNITY_VIDEO_CATEGORIES,
  type CommunityVideoCategoryId,
} from '@/lib/zod/community-video-categories';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

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
            <span className="text-cream/40" aria-hidden="true">·</span>
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

      {/* Body */}
      <div className="px-3 py-4 sm:px-6">
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
    <div className="grid grid-cols-2 gap-x-1 gap-y-2 md:grid-cols-4 md:gap-x-1.5 md:gap-y-3">
      {videos.map((v) => {
        const meta = v.category
          ? CATEGORY_META.get(v.category as CommunityVideoCategoryId)
          : null;
        return (
          <Link
            key={v.id}
            href={`/c/${communitySlug}/feed?start=${v.id}`}
            prefetch={false}
            className="group block"
          >
            <div className="relative aspect-square w-full overflow-hidden bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={demoCoverFor(v.cf_video_id, thumbnailUrl(v.cf_video_id)) ?? thumbnailUrl(v.cf_video_id)}
                alt={meta?.label ?? 'Community video'}
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                loading="lazy"
              />
              {meta ? (
                <>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                  <div className="absolute inset-x-2 bottom-2 text-surface">
                    <div className="truncate font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]">
                      {meta.label}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] opacity-90">{meta.blurb}</div>
                  </div>
                </>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
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
  return (
    <div className="grid grid-cols-2 gap-x-1 gap-y-2 md:grid-cols-4 md:gap-x-1.5 md:gap-y-3">
      {listings.map((card, idx) => (
        <Link
          key={card.listing.id}
          href={
            card.mediaKind === 'video'
              ? `/browse/feed?start=${encodeURIComponent(card.listing.id)}`
              : `/v/${card.agent.slug}/${card.listing.slug}`
          }
          prefetch={false}
          className="group block"
        >
          <div className="relative aspect-square w-full overflow-hidden bg-surface">
            <Image
              src={
                demoCoverFor(
                  card.listing.id,
                  card.mediaKind === 'video'
                    ? thumbnailUrl(card.hero.cfVideoId)
                    : (card.heroPhotoUrl as string),
                ) as string
              }
              alt={card.listing.address}
              fill
              sizes="(max-width: 640px) 50vw, 25vw"
              priority={idx < 4}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            <div className="absolute inset-x-2 bottom-2 text-surface">
              <div className="font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]">
                {formatPrice(card.listing.price)}
              </div>
              <div className="mt-0.5 truncate text-[11px] opacity-95 tracking-wide">
                {[
                  card.listing.beds != null ? `${card.listing.beds} bd` : null,
                  card.listing.baths != null ? `${card.listing.baths} ba` : null,
                  card.listing.sqft != null ? `${card.listing.sqft.toLocaleString()} sqft` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className="mt-px truncate text-[11px] opacity-80">{card.listing.address}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function formatPrice(price: number | null): string {
  if (price == null) return 'Price on request';
  return `$${price.toLocaleString()}`;
}
