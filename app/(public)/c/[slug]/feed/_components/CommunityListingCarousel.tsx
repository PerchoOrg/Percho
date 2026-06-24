/**
 * CommunityListingCarousel — Scenario B · L3
 *
 * Phase 34b (V1 redo, 2026-06-17): fullscreen horizontal-swipe carousel
 * over the listings of a community. Opens after a buyer taps a row in
 * CommunityListingsSheet (L2). Per V1 prototype:
 *
 * - Horizontal swipe / arrow keys / desktop nav arrows cycle listings.
 * - Top-left "‹ Back · <community>" returns to L0 (the community feed),
 *   not back into the sheet — same simplification as Scenario A's L2:
 *   the sheet was a transient lookup, the user's anchor is the
 *   neighborhood. Closing the carousel also closes the sheet.
 * - Counter "1 / N" + segmented progress bar at the top.
 * - Each slide:
 *     • If the listing has a hero video → HLS player (autoplay muted).
 *     • Else → hero photo cover.
 *   Bottom overlay shows price · address · city · bd/ba/sqft (real
 *   fields only; nulls are omitted, no placeholders).
 *
 * Constraints:
 * - No mute button (system volume keys per phase34a.T2).
 * - Tap targets ≥ 44×44.
 * - English only.
 */
'use client';

import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import Hls from 'hls.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommunityListingItem } from '../CommunityVideoFeed';

interface Props {
  open: boolean;
  listings: CommunityListingItem[];
  startIndex: number;
  backLabel: string;
  onClose: () => void;
}

function formatPrice(n: number | null): string {
  if (n == null) return '';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

export function CommunityListingCarousel({
  open,
  listings,
  startIndex,
  backLabel,
  onClose,
}: Props) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setActive(Math.max(0, Math.min(startIndex, listings.length - 1)));
    }
  }, [open, startIndex, listings.length]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setActive((i) => Math.min(listings.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, listings.length, onClose]);

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
    if (dx < 0) setActive((i) => Math.min(listings.length - 1, i + 1));
    else setActive((i) => Math.max(0, i - 1));
  }

  if (!open || listings.length === 0) return null;

  const total = listings.length;
  const safeActive = Math.min(active, total - 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${listings[safeActive]?.address ?? 'Listing'} carousel`}
      className="fixed inset-0 z-[60] flex flex-col bg-black"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to community"
          className="flex h-11 items-center gap-2 rounded-full border border-line bg-bg pr-3 pl-2 text-ink backdrop-blur-md transition-colors hover:border-line-strong hover:text-ink"
        >
          <span className="text-xl leading-none">‹</span>
          <span className="flex flex-col text-left leading-tight">
            <span className="font-semibold text-[12px]">Back</span>
            <span className="max-w-[40vw] truncate text-[10px] text-ink2">{backLabel}</span>
          </span>
        </button>
        <div className="flex h-9 items-center rounded-full bg-bg px-3 font-medium text-[12px] text-ink backdrop-blur-md tabular-nums">
          {safeActive + 1} / {total}
        </div>
      </div>

      {/* Progress */}
      <div className="absolute inset-x-3 top-16 z-10 flex gap-1">
        {listings.map((l, i) => (
          <div
            key={`${l.id}-prog`}
            className={`h-0.5 flex-1 rounded-full ${i <= safeActive ? 'bg-ink' : 'bg-surface/20'}`}
          />
        ))}
      </div>

      {/* Track */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={trackRef}
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${safeActive * 100}%)` }}
        >
          {listings.map((l, i) => (
            <ListingSlide
              key={`${l.id}-${i}`}
              listing={l}
              shouldMount={Math.abs(i - safeActive) <= 1}
              isActive={i === safeActive}
            />
          ))}
        </div>

        {/* Desktop arrows */}
        {safeActive > 0 && (
          <button
            type="button"
            onClick={() => setActive((i) => Math.max(0, i - 1))}
            aria-label="Previous listing"
            className="-translate-y-1/2 absolute top-1/2 left-3 hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-bg text-ink backdrop-blur-md transition-colors hover:border-line-strong hover:text-ink md:flex"
          >
            ‹
          </button>
        )}
        {safeActive < total - 1 && (
          <button
            type="button"
            onClick={() => setActive((i) => Math.min(total - 1, i + 1))}
            aria-label="Next listing"
            className="-translate-y-1/2 absolute top-1/2 right-3 hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-bg text-ink backdrop-blur-md transition-colors hover:border-line-strong hover:text-ink md:flex"
          >
            ›
          </button>
        )}

        {/* Phase 45.24 (2026-06-21): "← swipe →" hint removed for the
         * community listing carousel — gesture is self-evident. */}
      </div>
    </div>
  );
}

function ListingSlide({
  listing,
  shouldMount,
  isActive,
}: {
  listing: CommunityListingItem;
  shouldMount: boolean;
  isActive: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const poster = useMemo(() => {
    let p: string | null = null;
    if (listing.heroCfVideoId) {
      try {
        p = thumbnailUrl(listing.heroCfVideoId);
      } catch {
        /* fall through */
      }
    }
    if (!p) p = listing.heroPhotoUrl ?? null;
    return p;
  }, [listing.heroCfVideoId, listing.heroPhotoUrl]);

  useEffect(() => {
    if (!shouldMount) return;
    const v = ref.current;
    if (!v) return;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    v.removeAttribute('src');
    v.load();
    if (!listing.heroCfVideoId) return;
    let src: string;
    try {
      src = hlsUrl(listing.heroCfVideoId);
    } catch {
      return;
    }
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
  }, [shouldMount, listing.heroCfVideoId]);

  // Sound: chip tap is a user gesture, so unmuted autoplay should be
  // permitted. Try with sound first; fall back to muted if the browser
  // still blocks it. (phase34b.1 fix: chip-launched videos used to be
  // silent because we forced muted=true.)
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isActive) {
      v.muted = false;
      v.play().catch(() => {
        v.muted = true;
        void v.play().catch(() => {
          /* swallow */
        });
      });
    } else {
      v.pause();
    }
  }, [isActive]);

  const hasVideo = !!listing.heroCfVideoId;
  const bbs: string[] = [];
  if (listing.beds != null) bbs.push(`${listing.beds} bd`);
  if (listing.baths != null) bbs.push(`${listing.baths} ba`);
  if (listing.sqft != null) bbs.push(`${listing.sqft.toLocaleString()} sqft`);

  return (
    <div className="relative h-full w-full shrink-0 basis-full">
      {hasVideo && shouldMount ? (
        <video
          ref={ref}
          // biome-ignore lint/a11y/useMediaCaption: HLS source has no caption track.
          poster={poster ?? undefined}
          className="h-full w-full bg-black object-contain"
          playsInline
          loop
          preload="metadata"
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt={listing.address} className="h-full w-full bg-black object-contain" />
      ) : null}

      {/* Bottom overlay: price + address + bbs (real fields only). */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-5 pt-16 pb-10">
        {listing.price != null && (
          <div className="font-serif text-2xl text-ink leading-tight drop-shadow">
            {formatPrice(listing.price)}
          </div>
        )}
        <div className="mt-1 text-[14px] text-ink2 drop-shadow">{listing.address}</div>
        <div className="text-[12px] text-ink2 drop-shadow">
          {listing.city}, {listing.state}
        </div>
        {bbs.length > 0 && (
          <div className="mt-1.5 text-[12px] text-ink2 drop-shadow">{bbs.join(' · ')}</div>
        )}
      </div>
    </div>
  );
}
