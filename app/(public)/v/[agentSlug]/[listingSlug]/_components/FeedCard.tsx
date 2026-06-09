'use client';

/**
 * FeedCard — single full-viewport card in the public listing video feed.
 *
 * Phase 3.4: real HLS playback.
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
      width={16}
      height={16}
    >
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
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

export function FeedCard({ card, agent, listing, isFirst, cardRef, shouldMount, isActive }: Props) {
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

    // iOS Safari: native HLS. Everyone else: hls.js.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        // Conservative buffer caps — three videos × default 60s would be
        // wasteful on mobile data. Keep ~20s ahead.
        maxBufferLength: 20,
        maxMaxBufferLength: 30,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      // No HLS support at all — leave src empty, poster shows.
      return;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Detach src so the browser releases the buffer.
      video.removeAttribute('src');
      video.load();
    };
  }, [shouldMount, card.cfVideoId]);

  // Drive playback from active state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldMount) return;
    if (isActive) {
      video.muted = muted;
      const p = video.play();
      if (p && typeof p.catch === 'function') {
        // Autoplay rejection: stay paused, user can tap.
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
      // First tap = user gesture: also unmute.
      if (muted) {
        setMuted(false);
        video.muted = false;
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
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
          onClick={onTap}
        />
      )}

      {/* Top gradient. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
      {/* Bottom gradient. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/85 to-transparent" />

      {/* Top-left: source badge. */}
      <div className="absolute top-4 left-4">
        <span className="inline-flex items-center rounded-full border border-gold/40 bg-black/55 px-2 py-1 font-medium text-[10px] text-gold tracking-wider backdrop-blur">
          {badgeLabel(card)}
        </span>
      </div>

      {/* Top-right: address + price. */}
      <div className="absolute top-4 right-4 max-w-[60%] text-right">
        <div className="truncate font-serif text-cream text-sm leading-tight drop-shadow">
          {listing.address}
        </div>
        {priceText && (
          <div className="font-semibold text-gold text-xs drop-shadow">{priceText}</div>
        )}
      </div>

      {/* Center: Play icon overlay when paused. Tap-through to <video>. */}
      {paused && (
        <button
          type="button"
          onClick={onTap}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/30 backdrop-blur-md">
            <PlayIcon className="ml-1 text-cream" />
          </span>
        </button>
      )}

      {/* Muted indicator (top of bottom-left strip area). */}
      {shouldMount && isActive && muted && !paused && (
        <div className="absolute top-14 left-4 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] text-cream/80 backdrop-blur">
          <MutedIcon className="text-cream/80" />
          tap to unmute
        </div>
      )}

      {/* Bottom-left: agent strip + caption. */}
      <div className="pointer-events-none absolute right-20 bottom-6 left-4 space-y-2">
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
