'use client';

/**
 * FeedCard — single full-viewport card in the public listing video feed.
 *
 * Phase 3.4: real HLS playback.
 * Phase 8.3: visual polish — price/address moved to top-left with Playfair
 * serif treatment, larger card-type chip top-right, heart-pop animation
 * propagated from VideoFeed via likeAnimKey, gradient stops tightened.
 *
 * Mount policy is owned by VideoFeed (only ±1 around the active card mount
 * a <video>). When `shouldMount` is false, the card renders the poster only —
 * cheap, no hls.js instance. When true, hls.js attaches (or native HLS on
 * iOS Safari).
 *
 * Active card autoplays muted (browser autoplay policy). Inactive but mounted
 * cards stay paused but pre-buffered, so swiping forward starts instantly.
 *
 * Tap toggles play/pause; first tap also unmutes (treated as user gesture).
 */

import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import { track } from '@/lib/events/track';
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
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

function MutedIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      width={14}
      height={14}
    >
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

type Props = {
  card: FeedCardData;
  agent: FeedAgent;
  listing: FeedListing;
  listingId: string;
  isFirst: boolean;
  isLast: boolean;
  liked: boolean;
  onToggleLike: () => void;
  /** Card index passed back to parent for IntersectionObserver tracking. */
  index: number;
  /** Parent observes this ref to detect which card is active. */
  cardRef: (el: HTMLElement | null) => void;
  /** Within mount window (active ±1)? If false, poster only — no <video>. */
  shouldMount: boolean;
  /** Active card autoplays; mounted-but-inactive cards pre-buffer + pause. */
  isActive: boolean;
};

function badgeLabel(card: FeedCardData): string {
  if (card.source === 'listing') return 'LISTING';
  return card.kind.toUpperCase();
}

function formatPrice(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

export function FeedCard({
  card,
  agent,
  listing,
  listingId,
  isFirst,
  cardRef,
  shouldMount,
  isActive,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(true);

  let poster: string | null = null;
  try {
    poster = thumbnailUrl(card.cfVideoId);
  } catch {
    poster = null;
  }

  // Attach / detach hls.js as the mount window slides.
  useEffect(() => {
    if (!shouldMount) return;
    const video = videoRef.current;
    if (!video) return;

    let src: string;
    try {
      src = hlsUrl(card.cfVideoId);
    } catch {
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 20,
        maxMaxBufferLength: 30,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      return;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [shouldMount, card.cfVideoId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldMount) return;
    if (isActive) {
      video.muted = muted;
      const p = video.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => setPaused(true));
      }
    } else {
      video.pause();
    }
  }, [isActive, shouldMount, muted]);

  function onTap() {
    const video = videoRef.current;
    if (!video || !shouldMount) return;
    if (video.paused) {
      if (muted) {
        setMuted(false);
        video.muted = false;
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  const priceText = formatPrice(listing.price);
  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      ref={cardRef}
      data-card-index={card.id}
      className="relative h-[100dvh] w-full flex-shrink-0 snap-start overflow-hidden bg-ink"
    >
      {/* Poster (always rendered as background fallback). */}
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

      {/* Video element (only when within mount window). */}
      {shouldMount && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users get the Play button overlay below
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted={muted}
          loop
          preload="metadata"
          poster={poster ?? undefined}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onEnded={() => {
            track({
              event_type: 'video_complete',
              listing_id: listingId,
              card_id: card.id,
              meta: { source: card.source, kind: card.kind, cf_video_id: card.cfVideoId },
            });
          }}
          onClick={onTap}
        />
      )}

      {/* Top gradient — slightly taller for the larger header treatment. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />
      {/* Bottom gradient. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

      {/* Top-left: address + price (Playfair) — demo parity. */}
      <div className="absolute top-4 left-4 z-10 max-w-[70%]">
        <div className="truncate font-serif text-cream text-lg leading-tight drop-shadow-md">
          {listing.address}
        </div>
        {priceText && (
          <div className="mt-0.5 font-serif font-semibold text-gold text-2xl leading-none drop-shadow-md">
            {priceText}
          </div>
        )}
        <div className="mt-1 truncate text-[11px] text-cream/80 drop-shadow">
          {listing.city}, {listing.state}
          {specs ? ` · ${specs}` : ''}
        </div>
      </div>

      {/* Top-right: source kind chip — gold ribbon. */}
      <div className="absolute top-4 right-4 z-10">
        <span className="inline-flex items-center rounded-full border border-gold/50 bg-ink/70 px-2.5 py-1 font-medium text-[10px] text-gold tracking-[0.12em] backdrop-blur-md">
          {badgeLabel(card)}
        </span>
      </div>

      {/* Center: Play icon overlay when paused. Tap-through to <video>. */}
      {paused && (
        <button
          type="button"
          onClick={onTap}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full border border-white/25 bg-black/35 shadow-2xl backdrop-blur-md transition-transform hover:scale-105">
            <PlayIcon className="ml-1 text-cream" />
          </span>
        </button>
      )}

      {/* Muted indicator — top center-ish, demo-parity chip. */}
      {shouldMount && isActive && muted && !paused && (
        <div className="-translate-x-1/2 pointer-events-none absolute top-32 left-1/2 flex items-center gap-1 rounded-full border border-white/15 bg-ink/65 px-2.5 py-1 text-[10px] text-cream/80 backdrop-blur-md">
          <MutedIcon className="text-gold" />
          <span>tap to unmute</span>
        </div>
      )}

      {/* Bottom-left: overlay (community cards) + agent strip + caption. */}
      <div className="pointer-events-none absolute right-20 bottom-6 left-4 space-y-2.5">
        {card.overlay && (
          <div className="inline-block max-w-full rounded-lg border border-gold/30 bg-ink/65 px-3 py-2 backdrop-blur-md">
            <div className="truncate font-serif text-cream text-sm leading-tight">
              {card.overlay.line1}
            </div>
            {card.overlay.line2 && (
              <div className="mt-0.5 truncate text-[11px] text-gold/90 leading-tight">
                {card.overlay.line2}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-gold bg-ink2 font-semibold text-cream text-xs shadow-md">
            {agent.name
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-cream text-xs drop-shadow">{agent.name}</div>
            <div className="truncate text-[10px] text-cream/70 drop-shadow">Listing agent</div>
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
