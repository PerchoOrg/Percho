/**
 * CommunityCarousel — Scenario A · L2
 *
 * Phase 34b (V1 redo, 2026-06-17): fullscreen horizontal-swipe carousel
 * over a community's videos. Opens after a buyer taps a video thumbnail
 * in CommunitySheet (L1). Per V1 prototype:
 *
 * - Horizontal swipe / left-right arrow keys / desktop nav arrows cycle
 *   between community videos.
 * - Top-left "‹ Back · <listing address>" returns to L0 (NOT to the sheet).
 *   The sheet was a transient lookup; the user's real anchor is the
 *   listing they came from. Closing the carousel also closes the sheet.
 * - Counter "1 / N" + segmented progress bar at the top.
 * - Each card shows the community video with its category label below
 *   the player.
 *
 * Constraints (recurring on this project):
 * - No mute button (system volume keys per phase34a.T2).
 * - Tap targets ≥ 44×44.
 * - English only.
 *
 * Implementation note: this is a self-contained overlay; videos load
 * lazily on activation (only the active and ±1 sibling get a video tag
 * to keep the network reasonable).
 */
'use client';

import Hls from 'hls.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import type { BrowseSourceVideo } from './BrowseFeed';

interface Props {
  open: boolean;
  /** The community videos to swipe through (from `card.categoryVideos`). */
  videos: BrowseSourceVideo[];
  /** Index to start on. Clamped to [0, videos.length - 1]. */
  startIndex: number;
  /** Listing address shown in the back-button label so context is explicit. */
  backLabel: string;
  onClose: () => void;
}

export function CommunityCarousel({
  open,
  videos,
  startIndex,
  backLabel,
  onClose,
}: Props) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Sync active index when the overlay opens at a new starting position.
  useEffect(() => {
    if (open) {
      setActive(Math.max(0, Math.min(startIndex, videos.length - 1)));
    }
  }, [open, startIndex, videos.length]);

  // Lock body scroll & handle Esc / arrow keys.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight')
        setActive((i) => Math.min(videos.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, videos.length, onClose]);

  // Touch swipe — horizontal only, ignore vertical scrolls.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) setActive((i) => Math.min(videos.length - 1, i + 1));
    else setActive((i) => Math.max(0, i - 1));
  }

  if (!open || videos.length === 0) return null;

  const total = videos.length;
  const safeActive = Math.min(active, total - 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${videos[safeActive]?.line1 ?? 'Community'} video carousel`}
      className="fixed inset-0 z-[60] flex flex-col bg-black"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar: back + counter. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to listing"
          className="flex h-11 items-center gap-2 rounded-full border border-cream/20 bg-ink/55 pr-3 pl-2 text-cream backdrop-blur-md transition-colors hover:border-gold hover:text-gold"
        >
          <span className="text-xl leading-none">‹</span>
          <span className="flex flex-col text-left leading-tight">
            <span className="text-[12px] font-semibold">Back</span>
            <span className="max-w-[40vw] truncate text-[10px] text-cream/65">
              {backLabel}
            </span>
          </span>
        </button>
        <div className="flex h-9 items-center rounded-full bg-ink/55 px-3 font-medium text-[12px] text-cream backdrop-blur-md tabular-nums">
          {safeActive + 1} / {total}
        </div>
      </div>

      {/* Segmented progress bar */}
      <div className="absolute inset-x-3 top-16 z-10 flex gap-1">
        {videos.map((v, i) => (
          <div
            key={`${v.cfVideoId}-prog`}
            className={`h-0.5 flex-1 rounded-full ${
              i <= safeActive ? 'bg-gold' : 'bg-cream/20'
            }`}
          />
        ))}
      </div>

      {/* Track — translateX animates between active slides. */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={trackRef}
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${safeActive * 100}%)` }}
        >
          {videos.map((v, i) => (
            <CarouselSlide
              key={`${v.cfVideoId}-${i}`}
              video={v}
              shouldMount={Math.abs(i - safeActive) <= 1}
              isActive={i === safeActive}
            />
          ))}
        </div>

        {/* Desktop arrows (≥md). */}
        {safeActive > 0 && (
          <button
            type="button"
            onClick={() => setActive((i) => Math.max(0, i - 1))}
            aria-label="Previous video"
            className="-translate-y-1/2 absolute top-1/2 left-3 hidden h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-gold hover:text-gold md:flex"
          >
            ‹
          </button>
        )}
        {safeActive < total - 1 && (
          <button
            type="button"
            onClick={() => setActive((i) => Math.min(total - 1, i + 1))}
            aria-label="Next video"
            className="-translate-y-1/2 absolute top-1/2 right-3 hidden h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-gold hover:text-gold md:flex"
          >
            ›
          </button>
        )}

        {/* Swipe hint, fades after first move. */}
        {safeActive === 0 && total > 1 && (
          <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[10px] text-cream/70 uppercase tracking-widest">
            ← swipe →
          </div>
        )}
      </div>
    </div>
  );
}

function CarouselSlide({
  video,
  shouldMount,
  isActive,
}: {
  video: BrowseSourceVideo;
  shouldMount: boolean;
  isActive: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const poster = useMemo(() => {
    try {
      return thumbnailUrl(video.cfVideoId);
    } catch {
      return null;
    }
  }, [video.cfVideoId]);

  useEffect(() => {
    if (!shouldMount) return;
    const v = ref.current;
    if (!v) return;
    let src: string;
    try {
      src = hlsUrl(video.cfVideoId);
    } catch {
      return;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    v.removeAttribute('src');
    v.load();
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 20 });
      hls.loadSource(src);
      hls.attachMedia(v);
      hlsRef.current = hls;
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [shouldMount, video.cfVideoId]);

  // Play only the active slide; pause siblings to save battery.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isActive) {
      // Always start muted to satisfy autoplay-with-sound policies.
      v.muted = true;
      void v.play().catch(() => {
        /* swallow autoplay errors */
      });
    } else {
      v.pause();
    }
  }, [isActive]);

  return (
    <div className="relative h-full w-full shrink-0 basis-full">
      {shouldMount ? (
        <video
          ref={ref}
          // biome-ignore lint/a11y/useMediaCaption: HLS source has no caption track.
          poster={poster ?? undefined}
          className="h-full w-full bg-black object-contain"
          playsInline
          muted
          loop
          preload="metadata"
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="h-full w-full bg-black object-contain" />
      ) : null}

      {/* Category label */}
      <div className="absolute top-24 left-4 inline-flex items-center rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-[11px] font-medium text-gold uppercase tracking-wider backdrop-blur-md">
        {video.line1}
      </div>
      {video.line2 && (
        <div className="absolute right-4 bottom-8 left-4 text-[13px] text-cream/85 leading-snug drop-shadow">
          {video.line2}
        </div>
      )}
    </div>
  );
}
