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
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 md:gap-x-5 md:gap-y-12">
      {videos.map((v) => {
        // Phase 45.12 (2026-06-20): caption shows category label + blurb
        // (the editorial description), not `v.title` — titles default to
        // raw filenames like "IMG_2349.mp4" and leak that artifact onto
        // the buyer surface. The category taxonomy is the SSOT for "what
        // this video is about" (see lib/zod/community-video-categories).
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
            </div>
            {meta ? (
              <div className="pt-3">
                <div className="truncate font-serif text-base text-ink leading-tight tracking-[-0.012em]">
                  {meta.label}
                </div>
                <div className="mt-1 line-clamp-2 text-ink2 text-[12px] leading-snug">
                  {meta.blurb}
                </div>
              </div>
            ) : null}
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
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 md:gap-x-5 md:gap-y-12">
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
          </div>
          <div className="pt-3">
            <div className="font-serif text-base text-ink leading-tight tracking-[-0.012em]">
              {formatPrice(card.listing.price)}
            </div>
            <div className="mt-1 truncate text-ink2 text-[12px]">{card.listing.address}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
              {card.listing.beds != null && <span>{card.listing.beds} bd</span>}
              {card.listing.baths != null && <span>· {card.listing.baths} ba</span>}
              {card.listing.sqft != null && (
                <span>· {card.listing.sqft.toLocaleString()} sqft</span>
              )}
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
