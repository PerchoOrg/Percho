/**
 * CommunityCarousel — Scenario A · L2
 *
 * Phase 34b (V1 redo, 2026-06-17): fullscreen horizontal-swipe carousel
 * over a community's videos. Opens after a buyer taps a video thumbnail
 * in CommunitySheet (L1).
 *
 * Phase 45.17 (2026-06-20): desktop layout brought to parity with the
 * listing video feed (BrowseFeed) and the community feed
 * (CommunityVideoFeed). Two changes per owner feedback:
 *
 *  (1) The carousel column is now constrained to the same phone-shape
 *      width on desktop (`md:w-[min(430px,calc(100vh*9/16))]`) instead
 *      of stretching edge-to-edge. Mobile stays full viewport. Beige
 *      gutters fill the surrounding space — same idiom as the other
 *      two feeds, single immersive surface.
 *  (2) A right-rail with Share / Like / Save / Contact buttons is
 *      rendered over the active slide, mirroring the listing feed's
 *      rail. Per owner: when the carousel is opened from a listing,
 *      Like/Save/Contact target the *listing* (the user's anchor),
 *      not the community video — Contact opens the listing agent's
 *      lead form. The community-feed entry point (`/c/[slug]/feed`)
 *      keeps its own rail (community-scoped, no Contact) and is
 *      unaffected by this change.
 *
 * Per V1 prototype:
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
import { demoCoverFor, demoVideoFor } from '@/lib/demo-media';
import type { BrowseSourceVideo } from './BrowseFeed';
import { ActionButton } from '../../_components/feed/ActionButton';
import {
  FEED_FRAME_CLASS,
  FEED_RAIL_BOTTOM,
  FEED_Z,
} from '../../_components/feed/constants';
import {
  BookmarkIcon,
  CommentIcon,
  HeartIcon,
  ShareIcon,
} from '../../_components/feed/icons';

interface Props {
  open: boolean;
  /** The community videos to swipe through (from `card.categoryVideos`). */
  videos: BrowseSourceVideo[];
  /** Index to start on. Clamped to [0, videos.length - 1]. */
  startIndex: number;
  /** Listing address shown in the back-button label so context is explicit. */
  backLabel: string;
  onClose: () => void;
  /**
   * Phase 45.17: rail handlers. The carousel renders a Share/Like/Save/Contact
   * rail when these are provided; they target the parent listing (the user's
   * anchor), so the parent (BrowseFeed) supplies them already bound to the
   * active card. `liked`/`saved` reflect the current per-listing state.
   */
  onShare?: () => void;
  onToggleLike?: () => void;
  onToggleSave?: () => void;
  onContact?: () => void;
  liked?: boolean;
  saved?: boolean;
}

export function CommunityCarousel({
  open,
  videos,
  startIndex,
  backLabel,
  onClose,
  onShare,
  onToggleLike,
  onToggleSave,
  onContact,
  liked,
  saved,
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
  const showRail =
    !!onShare || !!onToggleLike || !!onToggleSave || !!onContact;

  return (
    // Outer fixed wrapper fills the viewport with the cream gutter so the
    // surrounding chrome (sidebar / header) doesn't peek through; the
    // inner wrapper is the phone-shape column hosting the carousel.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${videos[safeActive]?.line1 ?? 'Community'} video carousel`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={FEED_FRAME_CLASS}>
        {/* Top bar: back + counter + (optional) share. */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to listing"
            className="flex h-11 items-center gap-2 rounded-full border border-cream/20 bg-ink/55 pr-3 pl-2 text-cream backdrop-blur-md transition-colors hover:border-cream hover:text-cream"
            style={{ touchAction: 'manipulation' }}
          >
            <span className="text-xl leading-none">‹</span>
            <span className="flex flex-col text-left leading-tight">
              <span className="text-[12px] font-semibold">Back</span>
              <span className="max-w-[40vw] truncate text-[10px] text-cream/70">
                {backLabel}
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-9 items-center rounded-full border border-cream/20 bg-ink/55 px-3 font-medium text-[12px] text-cream backdrop-blur-md tabular-nums">
              {safeActive + 1} / {total}
            </div>
            {onShare && (
              <button
                type="button"
                onClick={onShare}
                aria-label="Share listing"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-cream hover:text-cream"
                style={{ touchAction: 'manipulation' }}
              >
                <ShareIcon />
              </button>
            )}
          </div>
        </div>

        {/* Segmented progress bar */}
        <div className="absolute inset-x-3 top-16 z-10 flex gap-1">
          {videos.map((v, i) => (
            <div
              key={`${v.cfVideoId}-prog`}
              className={`h-0.5 flex-1 rounded-full ${
                i <= safeActive ? 'bg-cream' : 'bg-cream/20'
              }`}
            />
          ))}
        </div>

        {/* Track — translateX animates between active slides. */}
        <div className="relative h-full w-full overflow-hidden">
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

          {/* Desktop arrows (≥md). Pull them outside the phone-column to
           * avoid overlapping the right-rail buttons; they sit in the
           * cream gutter on either side. */}
          {safeActive > 0 && (
            <button
              type="button"
              onClick={() => setActive((i) => Math.max(0, i - 1))}
              aria-label="Previous video"
              className="-translate-y-1/2 -left-14 absolute top-1/2 hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-bg text-ink backdrop-blur-md transition-colors hover:border-line-strong hover:text-ink md:flex"
            >
              ‹
            </button>
          )}
          {safeActive < total - 1 && (
            <button
              type="button"
              onClick={() => setActive((i) => Math.min(total - 1, i + 1))}
              aria-label="Next video"
              className="-translate-y-1/2 -right-14 absolute top-1/2 hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-bg text-ink backdrop-blur-md transition-colors hover:border-line-strong hover:text-ink md:flex"
            >
              ›
            </button>
          )}

          {/* Swipe hint, fades after first move. */}
          {safeActive === 0 && total > 1 && (
            <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[10px] text-cream/85 uppercase tracking-widest">
              ← swipe →
            </div>
          )}

          {/* Right rail — Like / Save / Contact. Mirrors BrowseFeed's
           * rail (phase 28); buttons target the listing the user came
           * from, since the carousel is anchored to that listing. */}
          {showRail && (
            <div
              className={`absolute right-3 ${FEED_Z.rail} flex flex-col items-center gap-3`}
              style={{ bottom: FEED_RAIL_BOTTOM }}
            >
              {onToggleLike && (
                <ActionButton
                  label="Like"
                  onClick={onToggleLike}
                  active={liked}
                  activeColor="rose"
                >
                  <HeartIcon filled={liked} />
                </ActionButton>
              )}
              {onToggleSave && (
                <ActionButton label="Save" onClick={onToggleSave} active={saved}>
                  <BookmarkIcon filled={saved} />
                </ActionButton>
              )}
              {onContact && (
                <ActionButton label="Contact" onClick={onContact}>
                  <CommentIcon />
                </ActionButton>
              )}
            </div>
          )}
        </div>
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

  const demoVideoUrl = demoVideoFor(video.cfVideoId, 'nearby');
  const isDemoVideo = demoVideoUrl !== null;

  const poster = useMemo(() => {
    let p: string | null = null;
    try {
      p = thumbnailUrl(video.cfVideoId);
    } catch {
      p = null;
    }
    return demoCoverFor(video.cfVideoId, p);
  }, [video.cfVideoId]);

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
    if (isDemoVideo && demoVideoUrl) {
      v.src = demoVideoUrl;
      return;
    }
    let src: string;
    try {
      src = hlsUrl(video.cfVideoId);
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
  }, [shouldMount, video.cfVideoId, isDemoVideo, demoVideoUrl]);

  // Play only the active slide; pause siblings to save battery.
  // Sound: the carousel is opened by an explicit chip tap (user gesture),
  // so browsers grant autoplay-with-sound. Try unmuted first; if the browser
  // still blocks it (some iOS/strict policies), fall back to muted so the
  // video at least plays. Default-on volume mirrors the main feeds — the
  // user's system volume keys are the volume control. (phase34b.1 fix:
  // chip-launched videos used to be silent because we forced muted=true.)
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isActive) {
      v.muted = false;
      v.play().catch(() => {
        // Autoplay-with-sound blocked → retry muted so the user at least
        // sees the video play.
        v.muted = true;
        void v.play().catch(() => {
          /* swallow */
        });
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
          className="h-full w-full bg-black object-cover"
          playsInline
          loop
          preload="metadata"
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="h-full w-full bg-black object-cover" />
      ) : null}

      {/* Category label */}
      <div className="absolute top-24 left-4 inline-flex items-center rounded-full border border-cream/30 bg-ink/40 px-3 py-1 text-[11px] font-medium text-cream uppercase tracking-wider backdrop-blur-md">
        {video.line1}
      </div>
      {video.line2 && (
        <div className="absolute right-20 bottom-8 left-4 text-[13px] text-cream/85 leading-snug drop-shadow">
          {video.line2}
        </div>
      )}
    </div>
  );
}


