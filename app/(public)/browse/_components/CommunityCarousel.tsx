/**
 * CommunityCarousel — Scenario A · L2
 *
 * fullscreen horizontal-swipe carousel
 * over a community's videos. Opens after a buyer taps a video thumbnail
 * in CommunitySheet (L1).
 *
 * desktop layout brought to parity with the
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

import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import Hls from 'hls.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton } from '../../_components/feed/ActionButton';
import { FEED_FRAME_CLASS, FEED_RAIL_BOTTOM, FEED_Z } from '../../_components/feed/constants';
import { BookmarkIcon, CommentIcon, HeartIcon, ShareIcon } from '../../_components/feed/icons';
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
  /**
   * rail handlers. The carousel renders a Share/Like/Save/Contact
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

  // swap the JS translateX + 40px-threshold
  // gesture for the same native scroll-snap pattern that BrowseFeed's
  // PhotoCard uses. Owner asked to port the same fix to the community
  // horizontal carousel. Same jank fixes apply:
  //   1. onScroll debounced to 100ms settle → parent setActive fires only
  //      once per gesture so React tree stays static during compositor
  //      animation
  //   2. GPU hoist: translateZ(0) per slide + willChange:transform on the
  //      scroller
  //   3. -webkit-overflow-scrolling: touch → explicit iOS momentum
  // Kept: `shouldMount = |i - active| <= 1` mount gating (only 3 <video>
  // tags at a time) + isActive-driven play/pause; those are correctness,
  // not perf.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticSettleTimerRef = useRef<number | null>(null);
  const scrollSettleDebounceRef = useRef<number | null>(null);
  const lastReportedIdxRef = useRef(0);

  // live display state for the counter/progress
  // bar so they track the finger without waiting for the 100ms scroll
  // settle. `active` still owns video mount/HLS attach — that stays
  // debounced. `displayActive` owns purely visual chrome. See
  // BrowseFeed.tsx PhotoCard for the same split.
  const [displayActive, setDisplayActive] = useState(0);
  const displayRafRef = useRef<number | null>(null);

  // Sync active index when the overlay opens at a new starting position.
  useEffect(() => {
    if (open) {
      const clamped = Math.max(0, Math.min(startIndex, videos.length - 1));
      setActive(clamped);
      setDisplayActive(clamped);
      lastReportedIdxRef.current = clamped;
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
      else if (e.key === 'ArrowRight') setActive((i) => Math.min(videos.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, videos.length, onClose]);

  // External `active` change → scroll the container to that slide.
  // `auto` for jumps > 1 (keyboard / arrow buttons that skip more than
  // one), `smooth` otherwise. `isProgrammaticScrollRef` gates the
  // onScroll handler so it doesn't ricochet the change back.
  useEffect(() => {
    if (!open) return;
    setDisplayActive(active);
    const el = scrollerRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const target = active * w;
    if (Math.abs(el.scrollLeft - target) < 2) return;
    isProgrammaticScrollRef.current = true;
    lastReportedIdxRef.current = active;
    const diff = Math.abs(active - Math.round(el.scrollLeft / w));
    el.scrollTo({ left: target, behavior: diff > 1 ? 'auto' : 'smooth' });
    if (programmaticSettleTimerRef.current) window.clearTimeout(programmaticSettleTimerRef.current);
    programmaticSettleTimerRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 400);
    return () => {
      if (programmaticSettleTimerRef.current) {
        window.clearTimeout(programmaticSettleTimerRef.current);
        programmaticSettleTimerRef.current = null;
      }
    };
  }, [active, open]);

  // User scroll → active. Debounced to 100ms of quiescence so React
  // doesn't re-render during compositor animation. Fires setActive once
  // per settled gesture, not per rAF.
  //
  // rAF-throttled `displayActive` update alongside so the
  // counter pill / segmented progress track the finger in real time,
  // without triggering video mount churn.
  const onScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    const el = scrollerRef.current;
    if (!el || videos.length <= 1) return;

    // Live display update (rAF-coalesced, local state only).
    if (displayRafRef.current == null) {
      displayRafRef.current = window.requestAnimationFrame(() => {
        displayRafRef.current = null;
        const el2 = scrollerRef.current;
        if (!el2) return;
        const w = el2.clientWidth || 1;
        const nearest = Math.max(0, Math.min(videos.length - 1, Math.round(el2.scrollLeft / w)));
        setDisplayActive((prev) => (prev === nearest ? prev : nearest));
      });
    }

    if (scrollSettleDebounceRef.current) window.clearTimeout(scrollSettleDebounceRef.current);
    scrollSettleDebounceRef.current = window.setTimeout(() => {
      const w = el.clientWidth || 1;
      const nearest = Math.max(0, Math.min(videos.length - 1, Math.round(el.scrollLeft / w)));
      if (nearest === lastReportedIdxRef.current) return;
      lastReportedIdxRef.current = nearest;
      setActive(nearest);
    }, 100);
  }, [videos.length]);

  useEffect(() => {
    return () => {
      if (scrollSettleDebounceRef.current) {
        window.clearTimeout(scrollSettleDebounceRef.current);
        scrollSettleDebounceRef.current = null;
      }
      if (displayRafRef.current != null) {
        window.cancelAnimationFrame(displayRafRef.current);
        displayRafRef.current = null;
      }
    };
  }, []);

  if (!open || videos.length === 0) return null;

  const total = videos.length;
  const safeActive = Math.min(active, total - 1);
  const safeDisplayActive = Math.min(displayActive, total - 1);
  const showRail = !!onShare || !!onToggleLike || !!onToggleSave || !!onContact;

  return (
    // Outer fixed wrapper fills the viewport with the cream gutter so the
    // surrounding chrome (sidebar / header) doesn't peek through; the
    // inner wrapper is the phone-shape column hosting the carousel.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${videos[safeActive]?.line1 ?? 'Neighborhood'} video carousel`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg"
    >
      <div className={FEED_FRAME_CLASS}>
        {/* Top bar: back + counter + (optional) share. */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to listing"
            className="flex h-10 items-center gap-2 rounded-full border border-cream/20 bg-ink/55 pr-3 pl-2 text-cream backdrop-blur-md transition-colors hover:border-cream hover:text-cream"
            style={{ touchAction: 'manipulation' }}
          >
            <span className="text-xl leading-none">‹</span>
            <span className="flex items-center gap-1.5 text-left leading-none">
              <span className="text-[12px] font-semibold">Back</span>
              <span className="text-cream/50">·</span>
              <span className="max-w-[38vw] truncate text-[11px] text-cream/70">{backLabel}</span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-10 items-center rounded-full border border-cream/20 bg-ink/55 px-3 font-medium text-[12px] text-cream backdrop-blur-md tabular-nums">
              {safeDisplayActive + 1} / {total}
            </div>
            {/* Share moved from top-right into
             * the right-rail bottom, matching BrowseFeed / CommunityVideoFeed
             * / CommunityListingCarousel. Owner reported a share button
             * still lingering top-right on nearby videos — this was the last surface still
             * putting Share in the top header. */}
          </div>
        </div>

        {/* segmented progress bar removed.
         * Owner: remove the dashed progress bar on listing-nearby —
         * just show the numeric counter, dashes are too cluttered.
         * The "N / M" counter pill in the top-right already conveys
         * position; the dashed track added visual clutter over the
         * hero frame. */}

        {/* Track — native horizontal scroll-snap. Same
         * container recipe as BrowseFeed PhotoCard: iOS momentum, snap
         * to slide boundaries, isolate horizontal from parent scroll. */}
        <div className="relative h-full w-full overflow-hidden">
          <div
            ref={scrollerRef}
            onScroll={onScroll}
            className="scrollbar-hide flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
            style={{
              willChange: 'transform',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {videos.map((v, i) => (
              <div
                key={`${v.cfVideoId}-${i}`}
                className="relative h-full w-full flex-shrink-0 snap-center"
                style={{ transform: 'translateZ(0)' }}
              >
                <CarouselSlide
                  video={v}
                  shouldMount={Math.abs(i - safeActive) <= 1}
                  isActive={i === safeActive}
                />
              </div>
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

          {/* "← swipe →" hint removed for the
           * community-videos carousel — gesture is self-evident, hint was
           * just visual noise. */}

          {/* Right rail — Like / Save / Contact. Mirrors BrowseFeed's
           * rail; buttons target the listing the user came
           * from, since the carousel is anchored to that listing. */}
          {showRail && (
            <div
              className={`absolute right-3 ${FEED_Z.rail} flex flex-col items-center gap-3`}
              style={{ bottom: FEED_RAIL_BOTTOM }}
            >
              {onToggleLike && (
                <ActionButton label="Like" onClick={onToggleLike} active={liked} activeColor="rose">
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
              {onShare && (
                <ActionButton label="Share" onClick={onShare}>
                  <ShareIcon />
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

  // overlay a poster <img> on top of the <video>
  // and only fade it out once the first video frame has actually rendered.
  //
  // Bug being fixed: horizontal-swiping between community videos flashed
  // the previous frame, then went black for ~200-500ms, then the new
  // video appeared. Root cause is that assigning a fresh HLS source to
  // the same <video> element (mount effect on `cfVideoId` change) tears
  // down the current media pipeline; the browser hides the `poster=`
  // attribute the moment `.play()` is called, but the first HLS segment
  // hasn't been decoded yet → the naked `bg-black` behind the element
  // shows through until decode finishes.
  //
  // Approach: don't rely on the `poster` attribute at all. Render the
  // thumbnail as an absolute-positioned <img> layer that stays visible
  // until the video fires `playing` (or `loadeddata` as a defensive
  // fallback). Reset the flag every time we swap `isActive` so the next
  // load also gets covered. Same idiom BrowseFeed uses — parity fix.
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  // tap-to-pause. Was never implemented on
  // the community carousel — user could only start/stop by leaving.
  // Local per-slide paused state, resets to false whenever isActive
  // flips true so a fresh slide never inherits the previous slide's
  // paused position.
  const [userPaused, setUserPaused] = useState(false);

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
    // New src → hide the video layer behind the poster until the first
    // frame renders. Otherwise `<video>` sits blank/black over the poster.
    setHasFirstFrame(false);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    v.removeAttribute('src');
    v.load();
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
  }, [shouldMount, video.cfVideoId]);

  // Reveal the video layer only after the first real frame paints. Use
  // `playing` as the primary signal (fires after decode + composite);
  // `loadeddata` as belt-and-suspenders in case the browser buffers a
  // frame without moving to `playing` (e.g. paused sibling).
  useEffect(() => {
    if (!shouldMount) return;
    const v = ref.current;
    if (!v) return;
    const reveal = () => setHasFirstFrame(true);
    v.addEventListener('playing', reveal);
    v.addEventListener('loadeddata', reveal);
    return () => {
      v.removeEventListener('playing', reveal);
      v.removeEventListener('loadeddata', reveal);
    };
  }, [shouldMount, video.cfVideoId]);

  // Play only the active slide; pause + fully silence siblings.
  //
  // two fixes on top of phase 34b.1's unmuted
  // play:
  //  (a) On slide-change (scroll), iOS Safari doesn't count the scroll
  //      gesture as user activation, so `.play()` unmuted is silently
  //      blocked and `playing` never fires — 74.3's overlay stayed up
  //      forever and the video looked frozen. Retry chain now:
  //      unmuted → muted → give up gracefully; the muted retry always
  //      succeeds and the poster overlay fades out on `playing`.
  //  (b) `v.pause()` on iOS Safari HLS.js does NOT stop audio (see
  //      phase 71.22 in BrowseFeed). Nuclear pattern: on every
  //      isActive-flip, pause + mute + volume=0 the previous slide's
  //      element, and reset volume=1 on the new one before .play(). The
  //      previous "voice keeps playing from slide 0" bug was slide 0's
  //      audio track surviving `.pause()` on scroll.
  // unified play/pause effect. Depends on both
  // `isActive` and `userPaused` so a tap-to-pause fully tears down the
  // canplay/loadeddata retry listeners — otherwise HLS buffering after a
  // user pause re-fires the retry chain and quietly resumes playback
  // (74.5's race). Mirrors BrowseFeed's imperative onTap model.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    // Not the active slide → nuclear pause (pause + mute + volume=0)
    // to keep sibling audio from leaking through iOS Safari's HLS.js
    // pipeline. See phase 71.22.
    if (!isActive) {
      try {
        v.pause();
      } catch {}
      try {
        v.muted = true;
        v.volume = 0;
      } catch {}
      return;
    }

    // Active slide, user pressed pause → nuclear-pause THIS video and
    // sweep every other <video> on the page too, since a preload
    // sibling can carry audio on iOS.
    if (userPaused) {
      try {
        v.pause();
      } catch {}
      try {
        v.muted = true;
        v.volume = 0;
      } catch {}
      try {
        document.querySelectorAll('video').forEach((av) => {
          try {
            av.pause();
          } catch {}
          try {
            (av as HTMLVideoElement).muted = true;
            (av as HTMLVideoElement).volume = 0;
          } catch {}
        });
      } catch {}
      return;
    }

    // Active + not paused → play. Restore audio state clobbered by any
    // prior pause branch, then unmuted-first with per-attempt muted
    // fallback (iOS scroll ≠ user gesture, so unmuted play may reject).
    try {
      v.volume = 1;
    } catch {}
    const tryPlay = () => {
      v.muted = false;
      v.play().catch(() => {
        v.muted = true;
        void v.play().catch(() => {});
      });
    };
    tryPlay();
    // Belt-and-suspenders: manifest may not be parsed by first .play().
    // Not `once` — every canplay retries unmuted from scratch. Because
    // this effect depends on [isActive, userPaused], a user pause tears
    // down these listeners, so no race with tap-to-pause.
    const retry = () => tryPlay();
    v.addEventListener('canplay', retry);
    v.addEventListener('loadeddata', retry);
    return () => {
      v.removeEventListener('canplay', retry);
      v.removeEventListener('loadeddata', retry);
    };
  }, [isActive, userPaused]);

  // Reset userPaused every time this slide (re-)becomes active, so a
  // fresh slide never inherits the previous slide's paused state.
  useEffect(() => {
    if (isActive) setUserPaused(false);
  }, [isActive]);

  return (
    <>
      {shouldMount ? (
        <>
          <video
            ref={ref}
            // biome-ignore lint/a11y/useMediaCaption: HLS source has no caption track.
            className={`h-full w-full bg-black object-cover transition-opacity duration-150 ${
              hasFirstFrame ? 'opacity-100' : 'opacity-0'
            }`}
            playsInline
            loop
            preload="auto"
          />
          {/* Poster overlay — covers the black gap between src swap and
           * first-frame decode. Fades out once `playing`/`loadeddata`
           * fires. Non-interactive so it doesn't eat the parent onClick. */}
          {poster && !hasFirstFrame && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full bg-black object-cover"
              decoding="async"
            />
          )}
        </>
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="h-full w-full bg-black object-cover" decoding="async" />
      ) : null}

      {/* tap-to-pause layer. Covers the whole slide but sits
       * BELOW the top bar / rail / desktop arrows (those are z-10+ on
       * the parent phone-column, outside this fragment). Non-scroll
       * taps toggle userPaused; scroll-snap drags fire touchcancel so
       * onClick doesn't misfire on swipe. */}
      {shouldMount && isActive && (
        <button
          type="button"
          aria-label={userPaused ? 'Play video' : 'Pause video'}
          onClick={() => setUserPaused((p) => !p)}
          className="absolute inset-0 z-[5] cursor-pointer bg-transparent"
          style={{ touchAction: 'manipulation' }}
        />
      )}

      {/* Center pause/play glyph — only shows while paused. Same visual
       * language as BrowseFeed's play glyph. */}
      {shouldMount && isActive && userPaused && (
        <div className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink/40 backdrop-blur-md">
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="ml-1 text-cream"
              aria-hidden
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* category label pill + blurb removed.
       * The bottom info card (title / category / distance / drive) already
       * conveys what the video is about — the "EATING OUT" pill and
       * "Where you actually go for dinner" tagline were the old
       * bucket-metadata surface and read as boilerplate now. Owner: remove
       * the old tag and description on the listing-feed nearby video. */}
    </>
  );
}
