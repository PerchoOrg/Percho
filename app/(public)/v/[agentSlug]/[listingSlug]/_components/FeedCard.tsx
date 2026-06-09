'use client';

/**
 * FeedCard — single full-viewport card in the public listing video feed.
 *
 * Phase 3.3: poster image + Play icon overlay (no playback). Top: address +
 * price. Bottom: agent strip + caption. Top-left badge differentiates source
 * (LISTING vs SCHOOL/POI/NEIGHBORHOOD). Right-edge negative space reserved
 * for the global ActionRail (rendered by VideoFeed).
 *
 * Phase 3.4 will wire <video> + hls.js, IntersectionObserver autoplay, and a
 * max-3-mounted policy.
 */

import { thumbnailUrl } from '@/lib/cloudflare/stream';
import type { FeedAgent, FeedCard as FeedCardData, FeedListing } from './types';

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      width={28}
      height={28}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

type Props = {
  card: FeedCardData;
  agent: FeedAgent;
  listing: FeedListing;
  isFirst: boolean;
  isLast: boolean;
  liked: boolean;
  onToggleLike: () => void;
};

function badgeLabel(card: FeedCardData): string {
  if (card.source === 'listing') return 'LISTING';
  // community kinds: SCHOOL, POI, NEIGHBORHOOD, ...
  return card.kind.toUpperCase();
}

export function FeedCard({ card, agent, listing, isFirst }: Props) {
  let poster: string | null = null;
  try {
    poster = thumbnailUrl(card.cfVideoId);
  } catch {
    poster = null;
  }

  const priceText = listing.price ? `$${listing.price.toLocaleString()}` : null;
  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="relative h-[100dvh] w-full flex-shrink-0 snap-start overflow-hidden bg-ink">
      {/* Poster. Plain <img> — Cloudflare CDN already optimizes thumbnails,
          and next/image's domain config isn't worth the friction here. */}
      {poster ? (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading={isFirst ? 'eager' : 'lazy'}
        />
      ) : (
        <div className="absolute inset-0 bg-ink2" />
      )}

      {/* Top gradient for legibility. */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
      {/* Bottom gradient. */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/85 to-transparent" />

      {/* Top-left: source badge. */}
      <div className="absolute top-4 left-4">
        <span className="inline-flex items-center rounded-full border border-gold/40 bg-black/55 px-2 py-1 font-medium text-[10px] text-gold tracking-wider backdrop-blur">
          {badgeLabel(card)}
        </span>
      </div>

      {/* Top-right: address + price (small, less prominent than demo's overlay). */}
      <div className="absolute top-4 right-4 max-w-[60%] text-right">
        <div className="truncate font-serif text-cream text-sm leading-tight drop-shadow">
          {listing.address}
        </div>
        {priceText && (
          <div className="font-semibold text-gold text-xs drop-shadow">{priceText}</div>
        )}
      </div>

      {/* Center: Play icon. Pure visual cue for Phase 3.3. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/30 backdrop-blur-md">
          <PlayIcon className="ml-1 text-cream" />
        </span>
      </div>

      {/* Bottom-left: agent strip + caption. (Right side reserved for ActionRail.) */}
      <div className="absolute right-20 bottom-6 left-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-gold bg-ink2 font-semibold text-cream text-xs">
            {agent.name
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-cream text-xs drop-shadow">{agent.name}</div>
            <div className="truncate text-[10px] text-cream/70 drop-shadow">
              {listing.city}, {listing.state} {specs ? `· ${specs}` : ''}
            </div>
          </div>
        </div>
        {card.title && (
          <div className="line-clamp-2 text-cream text-sm leading-snug drop-shadow">
            {card.title}
          </div>
        )}
      </div>
    </section>
  );
}
