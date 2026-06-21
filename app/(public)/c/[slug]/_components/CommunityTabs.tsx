'use client';

/**
 * CommunityTabs — client island that toggles between "Community Videos" and
 * "Active Listings" inside a single community page.
 *
 * Phase 45.10 (2026-06-20): introduced.
 * Phase 45.11 (2026-06-20): owner round 3 —
 *   - Width matches the rest of the page (`max-w-6xl px-3 sm:px-6`) so the
 *     grid below the hero aligns with /browse / /communities.
 *   - Tab pills use square (1:1) thumbs visually via the toggle row, and the
 *     content cards inside each tab now use a 1:1 frame.
 *   - Counts dropped from the tab labels per owner.
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

export function CommunityTabs({
  communitySlug,
  videos,
  listings,
}: {
  communitySlug: string;
  videos: CommunityVideo[];
  listings: BrowseCard[];
}) {
  const [tab, setTab] = useState<Tab>('videos');

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-4">
      {/* Pill row — same shape as TopBar sub-tabs / SavedClient pills. */}
      <div className="-mx-1 mb-5 flex items-center gap-1 overflow-x-auto">
        <TabButton active={tab === 'videos'} onClick={() => setTab('videos')}>
          Community Videos
        </TabButton>
        <TabButton active={tab === 'listings'} onClick={() => setTab('listings')}>
          Active Listings
        </TabButton>
      </div>

      {tab === 'videos' ? (
        <VideosGrid communitySlug={communitySlug} videos={videos} />
      ) : (
        <ListingsGrid listings={listings} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm transition',
        active
          ? 'bg-ink text-bg'
          : 'border border-line text-ink2 hover:border-line-strong hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
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
        // Phase 45.12: caption shows category label + blurb (not raw filename).
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
                  {/* Phase 45.26 (2026-06-21): TikTok-density overlay D. */}
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
            {/* Phase 45.26 (2026-06-21): TikTok-density overlay D. */}
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
