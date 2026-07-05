'use client';
import { listSavedListingIds, saveListing, unsaveListing } from '@/app/_actions/saved-listings';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import { listLiked, toggleLike as toggleLikeAction } from '@/lib/buyer/likes';
import { hlsUrl, thumbnailUrl } from '@/lib/cloudflare/stream';
import Hls from 'hls.js';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LeadModal } from '../../_components/LeadModal';
import { CaptionCard } from './CaptionCard';
import { CommunityCarousel } from './CommunityCarousel';
import { CommunitySheet, type CommunitySheetData } from './CommunitySheet';
import { ActionButton } from '../../_components/feed/ActionButton';
import { FEED_RAIL_BOTTOM, FEED_Z } from '../../_components/feed/constants';
import { FeedShell } from '../../_components/feed/FeedShell';
import {
  BackArrowIcon,
  BookmarkIcon,
  CommentIcon,
  HeartIcon,
  NearbyIcon,
  PlayIcon,
  ShareIcon,
} from '../../_components/feed/icons';

export type BrowseSourceVideo = {
  cfVideoId: string;
  /**
   * Phase 71.7 (2026-07-06): optional 1920x1080 landscape variant of the
   * same auto-rendered reel. Set when the render worker detects ≥80%
   * landscape source photos and produces a horizontal companion video.
   * The feed player exposes a fullscreen toggle when this is present.
   */
  cfVideoIdLandscape?: string | null;
  /**
   * Phase 70.11 (2026-07-04): direct mp4 URL for demo/mock listings that
   * bypass Cloudflare Stream. When set, the Card plays this URL as a
   * plain <video src>; `cfVideoId` is ignored (typically empty). At most
   * one of {cfVideoId, externalUrl} carries a real value.
   */
  externalUrl?: string | null;
  line1: string;
  line2?: string;
  /**
   * Phase 28 (2026-06-14): community-video category id (12-value enum
   * from `lib/zod/community-video-categories.ts`). Set on cards in the
   * single Nearby pool so the Card overlay can render the category
   * label + blurb pill above the caption. `undefined` for hero pool.
   */
  category?: string;
};

export type BrowseCard = {
  id: string;
  /**
   * Phase 10 (2026-06-12): listings can be photo-only (no ready video).
   * `mediaKind` discriminates how the grid renders the cover; the swipe
   * feed filters to `mediaKind === 'video'` because the immersive feed
   * is video-only by design ("TikTok for Homebuying" framing).
   *   - 'video' → use `hero.cfVideoId` for poster/HLS.
   *   - 'photo' → use `heroPhotoUrl` directly. `hero.cfVideoId` is empty.
   */
  mediaKind: 'video' | 'photo';
  hero: { cfVideoId: string; cfVideoIdLandscape?: string | null; externalUrl?: string | null };
  /** Set when mediaKind === 'photo'. Public Supabase Storage URL. */
  heroPhotoUrl?: string;
  /**
   * Phase 60 (2026-06-26): grid thumbnail override sourced from
   * `listings.cover_url`. When the agent picks "Set as cover" on either
   * a photo or a video, this URL flows through. Grid consumers (`/browse`,
   * `/saved`, `/nearby`, `/c/[slug]`) prefer this over the
   * mediaKind-derived hero so the cover the agent picked actually shows
   * up on the buyer side. The swipe feed (`mediaKind`) is unchanged on
   * purpose — picking a photo cover for a video listing still lets the
   * buyer enter the video swipe; only the grid card is re-skinned.
   */
  gridCoverUrl?: string;
  /**
   * Phase 20 (2026-06-13): full photo URL list for the photo branch of the
   * detail page. Only set when mediaKind === 'photo' AND we want a swipeable
   * carousel (not just a grid cover). `/browse` grid leaves this undefined.
   * Order matches `listing_photos.sort_order`. First entry is the cover.
   */
  photos?: string[];
  /**
   * Optional richer hero pool — when set, the 'hero' source cycles through
   * these videos (horizontal swipe / repeat-tap Hero source on the rail).
   * Used by `/v/[agent]/[listing]` to expose multi-walkthrough listings;
   * `/browse` doesn't set this (single hero per card by design).
   */
  heroVideos?: BrowseSourceVideo[];
  schoolVideos?: BrowseSourceVideo[];
  nearbyVideos?: BrowseSourceVideo[];
  communityVideos?: BrowseSourceVideo[];
  /**
   * Phase 28 (2026-06-14): single Nearby pool — replaces schools /
   * pois / neighborhood splits with one feed of community videos, each
   * carrying a 12-category id. The right rail has one "Nearby" entry;
   * tapping it switches into this pool. The legacy three arrays above
   * are kept on the type so existing callers compile, but the feed
   * itself reads `categoryVideos` only.
   */
  categoryVideos: BrowseSourceVideo[];
  /**
   * Phase 20 (2026-06-13): plain-text schools / POIs for the photo branch
   * of the detail page (no community videos to switch to, so the right
   * rail is hidden — buyers see this list under the photo caption block
   * instead). `/browse` grid + video cards leave these undefined.
   */
  photoSchools?: { name: string; grades: string | null; rating: number | null }[];
  photoPois?: { name: string; distance_text: string | null }[];
  /**
   * Phase 14 (2026-06-13): present only when the card is rendered from
   * `/nearby` (computed via haversine from the buyer's location). Explore
   * cards leave it `undefined`. Used purely for an optional overlay line —
   * never affects sort order or click-through.
   */
  distance?: number;
  listing: {
    id: string;
    slug: string;
    address: string;
    city: string;
    state: string;
    zip: string | null;
    price: number | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    /**
     * Multi-paragraph description (Phase 9). Each entry is one paragraph;
     * rendered as the bottom caption (Xiaohongshu-style), expandable on tap.
     */
    description: string[];
  };
  agent: {
    slug: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  /**
   * Phase 34b (V1 buyer redo): set when the listing belongs to a community.
   * BrowseFeed renders a top-left chip per V1 prototype Scenario A; tapping
   * the chip opens CommunitySheet (L1) — does NOT navigate. videoCount is
   * the fan-out community-video pool size; listingCount is the number of
   * published listings in this community (real, used for sheet header).
   */
  community?: {
    slug: string;
    name: string;
    city: string | null;
    state: string;
    description: string | null;
    videoCount: number;
    listingCount: number;
  };
};

type Source = 'hero' | 'nearby';

function formatPrice(n: number | null): string {
  if (n == null) return '';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

interface CardProps {
  card: BrowseCard;
  source: Source;
  cycleIdx: number;
  shouldMount: boolean;
  isActive: boolean;
  cardRef: (el: HTMLElement | null) => void;
  paused: boolean;
  setPaused: (b: boolean) => void;
  onSwipe: (delta: 1 | -1) => void;
  poolSize: number;
  /** Global mute state from parent feed — propagated to <video> on every render. */
  muted: boolean;
  /** Called if the browser blocks autoplay-with-sound and we fall back to muted. */
  onAutoplayBlocked?: () => void;
  /**
   * Phase 34b (V1 redo): opens the community sheet at the parent level.
   * Only fires when `card.community` is set. Chip is rendered inside this
   * Card so it's positioned over the listing video; the sheet itself is
   * a sibling overlay outside the card swiper.
   */
  onOpenCommunitySheet?: () => void;
}

function poolFor(card: BrowseCard, source: Source): number {
  if (card.mediaKind === 'photo') {
    // Photos: swipe horizontally through the photo[] carousel. Source rail
    // is hidden in the parent — `source` is always 'hero' here.
    return Math.max(1, card.photos?.length ?? 1);
  }
  if (source === 'nearby') return card.categoryVideos.length;
  // hero: count heroVideos pool if provided, else 1 (single hero).
  return card.heroVideos && card.heroVideos.length > 0 ? card.heroVideos.length : 1;
}

function pickVideo(card: BrowseCard, source: Source, cycleIdx: number): BrowseSourceVideo {
  if (source === 'nearby' && card.categoryVideos.length > 0) {
    return card.categoryVideos[cycleIdx % card.categoryVideos.length] as BrowseSourceVideo;
  }
  // hero: use heroVideos pool if provided, else fall back to single hero.
  if (card.heroVideos && card.heroVideos.length > 0) {
    return card.heroVideos[cycleIdx % card.heroVideos.length] as BrowseSourceVideo;
  }
  return {
    cfVideoId: card.hero.cfVideoId,
    cfVideoIdLandscape: card.hero.cfVideoIdLandscape ?? null,
    externalUrl: card.hero.externalUrl ?? null,
    line1: card.listing.address,
    line2: `${card.listing.city}, ${card.listing.state}`,
  };
}

/**
 * Phase 20 (2026-06-13): photo-only card. Same layout language as the video
 * Card (gradient overlays, bottom caption, source overlay top-left, action
 * bar handled by parent), but renders an <img> carousel instead of <video>.
 * Horizontal swipe / left-right keys cycle through `card.photos[]` via the
 * parent's existing cycleByCard plumbing — so persistence/keyboard logic
 * stays single-source-of-truth in BrowseFeed.
 */
function PhotoCard({
  card,
  cycleIdx,
  cardRef,
  onSwipe,
  poolSize,
  isActive,
}: {
  card: BrowseCard;
  cycleIdx: number;
  cardRef: (el: HTMLElement | null) => void;
  onSwipe: (delta: 1 | -1) => void;
  poolSize: number;
  isActive: boolean;
}) {
  const realPhotos =
    card.photos && card.photos.length > 0
      ? card.photos
      : card.heroPhotoUrl
        ? [card.heroPhotoUrl]
        : [];
  const photos = realPhotos;
  const total = photos.length;
  const idx = total > 0 ? cycleIdx % total : 0;
  const current = photos[idx];

  // Phase 73 (2026-07-05): native horizontal scroll-snap, tuned to remove
  // the "卡顿" the owner reported on 72.6/72.7. Same iOS-native container
  // (owner: "还是要用 native scroll snap"), fixes below apply here AND to
  // CommunityCarousel afterwards.
  //
  // Sources of jank identified:
  //   1. onScroll → setState-in-parent (via onSwipe) fired on every raf
  //      of the scroll → forces React re-render → img re-render → decode
  //      restart → main-thread stall while GPU is trying to compose the
  //      swipe. Fix: onScroll only writes to a ref; parent idx is
  //      updated once the scroll SETTLES (rAF-debounced, ~100ms of
  //      quiescence).
  //   2. Neighbouring images not decoded before flick → compositor waits
  //      on a raster tile mid-swipe → visible stutter. Fix: eager range
  //      widened from ±1 to ±2 and `decoding="async"` on every img so
  //      decode work is off-thread.
  //   3. Each slide had `object-contain` on a raw <img> without GPU
  //      hoist. Fix: `translate3d(0,0,0)` on each slide + `will-change:
  //      transform` on the scroller so the browser keeps them on
  //      compositor layers instead of rasterising per-frame.
  //   4. `overscroll-x-contain` was the whole story for gesture
  //      handoff; keep it. Do NOT reintroduce `snap-always` (kills
  //      flick momentum, phase 72.7) or container-level
  //      `scrollBehavior: smooth` (kills user-driven feel, phase 72.7).
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const lastReportedIdxRef = useRef(idx);
  const isProgrammaticScrollRef = useRef(false);
  const scrollSettleTimerRef = useRef<number | null>(null);
  const settleDebounceRef = useRef<number | null>(null);

  // Phase 74.2 (2026-07-05): split display state from parent commit.
  // Owner: "滑动后页面和上面的计数不 sync — 上面的横杠和计数有延迟".
  //
  // Phase 73's 100ms settle debounce is what keeps the img/decode side
  // quiet during a swipe (see the ranting comment above), and we do NOT
  // want to lose that. But the counter pill + segmented progress bar are
  // pure visual feedback — they can (and should) track the finger in
  // real time. So we keep the parent commit debounced (still gates
  // decode/mount work), and drive the header UI off a lightweight local
  // `displayIdx` that we update from onScroll immediately.
  //
  // rAF-throttled read of scrollLeft → nearest slide → local setState.
  // Only the counter pill + segmented bar re-render, and they render as
  // sibling <div>s over the scroller — the scroller itself and every
  // <img> inside it depend on `idx` (parent-owned, still debounced), so
  // the compositor stays undisturbed.
  const [displayIdx, setDisplayIdx] = useState(idx);
  const displayRafRef = useRef<number | null>(null);

  // External idx change → programmatic scroll + resync display.
  useEffect(() => {
    setDisplayIdx(idx);
    const el = scrollerRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const target = idx * w;
    if (Math.abs(el.scrollLeft - target) < 2) return;
    isProgrammaticScrollRef.current = true;
    lastReportedIdxRef.current = idx;
    const diff = Math.abs(idx - Math.round(el.scrollLeft / w));
    el.scrollTo({ left: target, behavior: diff > 1 ? 'auto' : 'smooth' });
    if (scrollSettleTimerRef.current) window.clearTimeout(scrollSettleTimerRef.current);
    scrollSettleTimerRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 400);
    return () => {
      if (scrollSettleTimerRef.current) {
        window.clearTimeout(scrollSettleTimerRef.current);
        scrollSettleTimerRef.current = null;
      }
    };
  }, [idx]);

  // User scroll → parent idx, but **debounced to scroll-settle** so the
  // React tree is stable while the compositor is animating. Every
  // scroll event just resets a 100ms watchdog; the parent only hears
  // about the change once the user has stopped for a full frame budget.
  //
  // Also (phase 74.2): rAF-throttled local `displayIdx` update so the
  // counter/progress pill tracks the finger without waiting for settle.
  const onScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    const el = scrollerRef.current;
    if (!el || total <= 1) return;

    // Live display update (rAF-coalesced, local state only).
    if (displayRafRef.current == null) {
      displayRafRef.current = window.requestAnimationFrame(() => {
        displayRafRef.current = null;
        const el2 = scrollerRef.current;
        if (!el2) return;
        const w = el2.clientWidth || 1;
        const nearest = Math.max(
          0,
          Math.min(total - 1, Math.round(el2.scrollLeft / w)),
        );
        setDisplayIdx((prev) => (prev === nearest ? prev : nearest));
      });
    }

    // Parent commit (debounced, drives img mount / decode).
    if (settleDebounceRef.current) window.clearTimeout(settleDebounceRef.current);
    settleDebounceRef.current = window.setTimeout(() => {
      const w = el.clientWidth || 1;
      const nearest = Math.round(el.scrollLeft / w);
      if (nearest === lastReportedIdxRef.current) return;
      const rawDiff = nearest - lastReportedIdxRef.current;
      lastReportedIdxRef.current = nearest;
      const step: 1 | -1 = rawDiff > 0 ? 1 : -1;
      for (let i = 0; i < Math.abs(rawDiff); i++) onSwipe(step);
    }, 100);
  }, [onSwipe, total]);

  useEffect(() => {
    return () => {
      if (settleDebounceRef.current) {
        window.clearTimeout(settleDebounceRef.current);
        settleDebounceRef.current = null;
      }
      if (displayRafRef.current != null) {
        window.cancelAnimationFrame(displayRafRef.current);
        displayRafRef.current = null;
      }
    };
  }, []);

  const goPrev = () => onSwipe(-1);
  const goNext = () => onSwipe(1);

  return (
    <section
      ref={(el) => cardRef(el)}
      className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-black"
    >
      {/* Blurred backdrop — uses the current photo, kept in sync via
       * `key` so it swaps as the user scrolls. Desktop only; mobile
       * gets pure black to avoid the double-image effect at low
       * resolution. */}
      {current && (
        <img
          key={`bg-${idx}`}
          src={current}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden h-full w-full scale-110 object-cover opacity-60 blur-2xl md:block"
        />
      )}

      {/* Native horizontal scroll-snap track. `overflow-x-auto` gives
       * us system momentum + edge bounce; `snap-x snap-mandatory` locks
       * every release onto a slide boundary; `overscroll-x-contain`
       * stops the swipe from chaining to the parent (which is the
       * vertical feed scroll). Scrollbar hidden via utility.
       *
       * Phase 72.7 (2026-07-05): removed `scrollBehavior: 'smooth'`
       * inline style — it forced every user-driven snap alignment
       * through a 150ms constant CSS curve, which is what caused the
       * "first half follows finger, second half resets to fixed
       * speed" feel the owner reported. Smooth is now applied only
       * inside `scrollTo({ behavior: 'smooth' })` for programmatic
       * jumps (arrow buttons / keyboard). Also dropped `snap-always`
       * on individual slides so momentum can naturally advance more
       * than one slide on a hard flick. */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="scrollbar-hide absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
        style={{ willChange: 'transform', WebkitOverflowScrolling: 'touch' }}
      >
        {total === 0 && (
          <div className="flex h-full w-full flex-shrink-0 snap-center items-center justify-center text-cream/40 text-sm">
            No photo
          </div>
        )}
        {photos.map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="relative h-full w-full flex-shrink-0 snap-center"
            style={{ transform: 'translateZ(0)' }}
          >
            <img
              src={src}
              alt={
                i === idx
                  ? `${card.listing.address} — ${i + 1} of ${total}`
                  : ''
              }
              className="h-full w-full object-contain"
              // Phase 73: eager range widened ±1 → ±2 so a fast flick
              // never lands on an undecoded neighbour. `decoding=async`
              // moves decode off the main thread so it can't stall
              // compositing mid-swipe.
              loading={Math.abs(i - idx) <= 2 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
            />
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />

      {/* Phase 72.8 (2026-07-05): header alignment with CommunityCarousel
       * (video swipe). Owner: "仿照 listing feed 里的 community 视频里的
       * 格式,左上返回,右上计数,第二行才是虚线".
       *
       * Row 1 = header row (top-3, height 11) — the parent BrowseFeed
       * shell already renders the Back button in the left slot at
       * `top-0 pt-3`. We put the counter pill in the right slot at the
       * same vertical rhythm so the two align visually.
       * Row 2 = dashed segmented progress at `top-16`, below the header.
       *
       * Progress style is now cumulative (`i <= idx` filled) matching
       * CommunityCarousel — a progress bar, not a "current-only" tick,
       * so the buyer can see how deep they are into the reel. */}
      {poolSize > 1 && total > 1 && (
        <>
          <div className="pointer-events-none absolute top-3 right-3 z-10 flex h-9 items-center rounded-full border border-cream/20 bg-ink/55 px-3 font-medium text-[12px] text-cream backdrop-blur-md tabular-nums">
            {displayIdx + 1} / {total}
          </div>
          <div className="pointer-events-none absolute inset-x-3 top-16 z-10 flex gap-1">
            {photos.map((p, i) => (
              <div
                key={`${p}-prog`}
                className={`h-0.5 flex-1 rounded-full transition-colors ${
                  i <= displayIdx ? 'bg-cream' : 'bg-cream/20'
                }`}
              />
            ))}
          </div>
        </>
      )}

      {/* Desktop-only left/right arrows. Mobile uses the native swipe. */}
      {poolSize > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous photo"
            className="-translate-y-1/2 absolute top-1/2 left-3 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur transition-colors hover:border-cream hover:text-cream md:flex"
            style={{ touchAction: 'manipulation' }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next photo"
            className="-translate-y-1/2 absolute top-1/2 right-3 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur transition-colors hover:border-cream hover:text-cream md:flex"
            style={{ touchAction: 'manipulation' }}
          >
            ›
          </button>
        </>
      )}

      {/* Bottom caption — Phase 74 (2026-07-05): unified glass card
       * shared with the video Card. Description + schools/POIs live in
       * a light bottom sheet (WCAG AAA on the sheet, AA on the card
       * over any hero frame) instead of overlapping the photo inline. */}
      <CaptionCard
        listing={card.listing}
        agent={card.agent}
        schools={card.photoSchools}
        pois={card.photoPois}
      />
    </section>
  );
}

function Card({
  card,
  source,
  cycleIdx,
  shouldMount,
  isActive,
  cardRef,
  paused,
  setPaused,
  onSwipe,
  poolSize,
  muted,
  onAutoplayBlocked,
  onOpenCommunitySheet,
}: CardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Phase 71.7 (2026-07-06): in-page fullscreen for the landscape variant.
  // Only exposed when the current selection carries a `cfVideoIdLandscape`
  // (populated by the render worker for listings whose photos are ≥80%
  // horizontal). Toggling flips the container to `fixed inset-0 z-[9999]`
  // and swaps the HLS source to the landscape uid — same BGM, same
  // Ken-Burns pass, just letterbox-free horizontal composition.
  //
  // Custom in-page fullscreen (not the native Fullscreen API) because
  // iOS Safari's `webkitEnterFullscreen` on <video> tears down the src
  // and re-attaches at a fixed player, which breaks HLS.js and the
  // src-swap trick we depend on. A plain overlay div works everywhere.
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Phase 71.17 (2026-07-06): measure the actual `<section>` element's
  // bounding rect instead of window.innerWidth/innerHeight. On iPhone Plus /
  // Pro Max models (428×926), `window.innerHeight` reports the *small*
  // viewport (~781, URL bar visible) while `fixed inset-0` extends into the
  // *layout* viewport (~926 with URL bar hidden). Sizing the rotate-90 box
  // against innerHeight left ~30% black at top+bottom on those phones.
  //
  // Reading the section's live rect via ResizeObserver captures whatever
  // `fixed inset-0` actually resolves to on the current device — no phone
  // hardcoding, no viewport-model guessing. Also listens to
  // window.visualViewport `resize` so URL-bar collapse expansions repaint.
  //
  // 71.14/71.15 history: dvw/dvh (Tailwind arbitrary) was emitted but
  // fallback-substituted; raw px innerWidth/innerHeight was correct on
  // 393×852 devices but wrong on 428×926 due to the small/layout viewport
  // gap above.
  const sectionRef = useRef<HTMLElement | null>(null);
  const [vp, setVp] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    if (!isFullscreen) return;
    const el = sectionRef.current;
    if (!el) return;
    function measure() {
      const el2 = sectionRef.current;
      if (!el2) return;
      const r = el2.getBoundingClientRect();
      setVp({ w: Math.round(r.width), h: Math.round(r.height) });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      vv?.removeEventListener('resize', measure);
    };
  }, [isFullscreen]);

  // ESC exits fullscreen — desktop keyboards and iPad Magic Keyboards.
  useEffect(() => {
    if (!isFullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsFullscreen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  const sel = useMemo(() => pickVideo(card, source, cycleIdx), [card, source, cycleIdx]);

  // Phase 71.26 (2026-07-06): local `domPaused` state driven by rAF poll of
  // `videoRef.current.paused`. Play glyph binds to this local state, not the
  // parent-owned `paused` prop. Reason 71.25 didn't fix it: rAF was calling
  // parent's `setPaused` with a value that closes over stale `paused` prop
  // (React doesn't re-invoke the effect between prop syncs), so the parent
  // ping-pong never converged. Local state is authoritative and re-renders
  // only this card.
  const [domPaused, setDomPaused] = useState<boolean>(true);
  useEffect(() => {
    if (!shouldMount) return;
    let raf = 0;
    function tick() {
      const v = videoRef.current;
      if (v) setDomPaused(v.paused);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shouldMount]);

  // Phase 74.7 (2026-07-06): poster-attribute anti-pattern (skill ref §1).
  // Symptom: on first swipe to a card, iOS Safari flashes the <video>
  // poster with the system big-play-button overlay for ~200-500ms before
  // the video actually starts. Root cause: `<video poster=…>` renders
  // that placeholder until `.play()` is called, and the browser's HLS
  // pipeline needs 200-500ms to decode the first segment before the
  // real frame paints. The CommunityCarousel already fixed this in 74.3
  // via an <img> overlay + hasFirstFrame gate; BrowseFeed drifted.
  //
  // Fix: kill the `poster=` attribute, render the thumbnail as an
  // absolute <img> overlay while !hasFirstFrame, reveal the <video>
  // via opacity on `playing` / `loadeddata`. Reset the flag on src swap.
  const [hasFirstFrame, setHasFirstFrame] = useState(false);

  // Phase 71.7: pick the effective CF uid based on fullscreen state.
  // `cfVideoIdLandscape` is optional; fullscreen is only enterable when set.
  const hasLandscape = !!sel.cfVideoIdLandscape;
  const effectiveCfId =
    isFullscreen && sel.cfVideoIdLandscape ? sel.cfVideoIdLandscape : sel.cfVideoId;

  // Phase 71.13/71.14: aggressively play on fullscreen. iOS Safari native
  // HLS (Apple HLS via <video src>) reloads the media pipeline on src
  // change; the play() call from the shared effect (line ~660) can race
  // and silently no-op. Retry on multiple lifecycle events, muted (which
  // always satisfies autoplay policy under playsInline).
  //
  // Phase 71.17 (2026-07-06): stop retrying once we've observed a play/
  // playing event, and abort if user pauses. Previously canplay/loadeddata
  // kept firing during playback → racing with user's tap-to-pause: the
  // audio track would resume but the video texture stayed frozen.
  useEffect(() => {
    if (!isFullscreen) return;
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    let started = false;
    let attempts = 0;
    function markStarted() {
      started = true;
    }
    function tryPlay() {
      if (cancelled || started || !v || attempts > 6) return;
      // If user has actively paused, do NOT force-resume.
      if (v.paused && attempts > 0 && v.currentTime > 0) return;
      attempts += 1;
      v.muted = true;
      const p = v.play();
      if (p && typeof p.then === 'function') {
        p.then(() => setPaused(false)).catch(() => {});
      }
    }
    tryPlay();
    v.addEventListener('loadedmetadata', tryPlay);
    v.addEventListener('canplay', tryPlay);
    v.addEventListener('loadeddata', tryPlay);
    v.addEventListener('playing', markStarted);
    return () => {
      cancelled = true;
      v.removeEventListener('loadedmetadata', tryPlay);
      v.removeEventListener('canplay', tryPlay);
      v.removeEventListener('loadeddata', tryPlay);
      v.removeEventListener('playing', markStarted);
    };
  }, [isFullscreen, effectiveCfId, setPaused]);

  const isExternal = !!sel.externalUrl;
  let poster: string | null = null;
  if (isExternal) {
    poster = card.heroPhotoUrl ?? null;
  } else {
    try {
      poster = thumbnailUrl(effectiveCfId);
    } catch {
      poster = null;
    }
  }

  // (Re)attach HLS when mount or selected video changes.
  useEffect(() => {
    if (!shouldMount) return;
    const video = videoRef.current;
    if (!video) return;

    // Phase 74.7: hide <video> layer behind poster overlay until the
    // first real frame paints on this new src.
    setHasFirstFrame(false);

    // Tear down previous HLS attachment.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.removeAttribute('src');
    video.load();

    // Phase 70.11: external mp4 path — set video.src directly, skip HLS.
    if (isExternal && sel.externalUrl) {
      video.src = sel.externalUrl;
      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    }

    let src: string;
    try {
      src = hlsUrl(effectiveCfId);
    } catch {
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else if (Hls.isSupported()) {
      // capLevelToPlayerSize:false → don't cap quality to the player's pixel
      //   size (desktop letterbox renders smallish but we still want HD).
      // MANIFEST_PARSED → jump to the top level for first playback so users
      //   don't see the lowest-bitrate ladder rung. ABR can still downgrade
      //   on real network pressure afterwards.
      const hls = new Hls({
        maxBufferLength: 20,
        maxMaxBufferLength: 30,
        capLevelToPlayerSize: false,
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hls.levels.length > 0) {
          hls.nextLevel = hls.levels.length - 1;
        }
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [shouldMount, effectiveCfId, sel.externalUrl, isExternal]);

  // Play/pause on active changes.
  // Try with current mute state first; if browser blocks autoplay-with-sound
  // (no sticky activation), fall back to muted and signal parent to flip
  // the global mute state so the Sound button reflects reality.
  // Phase 71.13 (2026-07-06): re-run when effectiveCfId flips too — entering
  // fullscreen swaps the HLS source to the landscape uid; without this the
  // <video> stays paused after the src attach and the centre play glyph
  // sticks around.
  // biome-ignore lint/correctness/useExhaustiveDependencies: effectiveCfId triggers replay after source switch
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive && shouldMount) {
      v.muted = muted;
      v.play()
        .then(() => setPaused(false))
        .catch(() => {
          // Autoplay-with-sound was blocked. Retry muted — this always works.
          if (!v.muted) {
            v.muted = true;
            onAutoplayBlocked?.();
            v.play()
              .then(() => setPaused(false))
              .catch(() => setPaused(true));
          } else {
            setPaused(true);
          }
        });
    } else {
      v.pause();
      setPaused(true);
    }
  }, [isActive, shouldMount, setPaused, effectiveCfId, sel.externalUrl]);

  // Keep <video>.muted in sync with the global mute toggle while the card
  // is mounted (parent flips it from the Sound button).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted]);

  // Phase 71.15 (2026-07-06): keep React `paused` state in sync with the
  // actual <video> pause/play events. Previously we only set paused via
  // `.play()` / `.pause()` promise callbacks, which missed cases where
  // iOS Safari internally paused the media (buffer stall, src-swap
  // reload) — audio continued but UI showed play glyph, or vice versa.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    function onPlay() {
      setPaused(false);
    }
    function onPause() {
      setPaused(true);
    }
    v.addEventListener('play', onPlay);
    v.addEventListener('playing', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [setPaused, shouldMount]);

  // Phase 74.7 (skill ref §1): reveal <video> layer only after the first
  // real frame paints. `playing` fires post-decode+composite; `loadeddata`
  // is a defensive fallback for paused-preload siblings.
  useEffect(() => {
    if (!shouldMount) return;
    const v = videoRef.current;
    if (!v) return;
    const reveal = () => setHasFirstFrame(true);
    v.addEventListener('playing', reveal);
    v.addEventListener('loadeddata', reveal);
    return () => {
      v.removeEventListener('playing', reveal);
      v.removeEventListener('loadeddata', reveal);
    };
  }, [shouldMount, effectiveCfId]);

  const onTap = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // Phase 71.23: restore audio state that 71.22 zeroed on last pause.
      // Without this, resuming plays silent.
      try {
        v.volume = 1;
      } catch {}
      v.muted = muted;
      const p = v.play();
      if (p && typeof p.then === 'function') {
        p.then(() => setPaused(false)).catch(() => {});
      } else {
        setPaused(false);
      }
    } else {
      // Phase 71.22: `v.pause()` alone doesn't stop audio on iOS Safari when
      // HLS.js is driving the media pipeline — the audio buffer keeps
      // flushing. Belt-and-suspenders: pause + mute + zero-volume every
      // <video> on the page. Any element (current or preloaded neighbor)
      // that was still emitting sound goes silent. `onTap` play branch
      // above restores volume/muted on resume.
      try {
        const all = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
        for (const av of all) {
          try {
            av.pause();
          } catch {}
          try {
            av.muted = true;
          } catch {}
          try {
            av.volume = 0;
          } catch {}
        }
      } catch {}
      setPaused(true);
    }
  };

  return (
    <section
      ref={(el) => {
        cardRef(el);
        sectionRef.current = el;
      }}
      // Phase 28.3 (2026-06-16): hoist `touch-none` from the inner div to the
      // <section> root in Nearby mode. `touch-action` is NOT inherited — it's
      // resolved per-element by the browser. With it only on the inner div,
      // touches that landed on the <video> element (its default
      // `touch-action: auto` wins) leaked vertical pans to the outer snap-y
      // scroller and skipped to the next listing — exactly the bug the
      // 28.1 commit thought it had fixed. Putting it on the section means
      // the entire subtree (video + img poster + overlays) opts out of
      // native scrolling while in Nearby mode, so the JS swipe handler
      // owns vertical gestures uncontested.
      className={`${isFullscreen ? 'fixed inset-0 z-[9999]' : 'relative h-[100dvh] w-full snap-start snap-always'} overflow-hidden bg-black ${source === 'nearby' ? 'touch-none' : ''}`}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: tap-to-play */}
      <div
        // Hero mode keeps `touch-pan-y` so vertical pans pass through to the
        // snap-y listing scroller, and only horizontal swipes (heroVideos
        // pool) are intercepted here. Nearby's `touch-none` lives on the
        // section above (see comment).
        className={`absolute inset-0 ${source === 'nearby' ? '' : 'touch-pan-y'}`}
        onClick={onTap}
        onTouchStart={(e) => {
          if (e.touches.length !== 1) return;
          const t = e.touches[0];
          if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          if (!t) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (source === 'nearby') {
            // Vertical swipe cycles within the nearby pool — same gesture as
            // moving between listings, so the pool feels like a feed.
            if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.5) {
              e.preventDefault();
              e.stopPropagation();
              onSwipe(dy < 0 ? 1 : -1);
            }
            return;
          }
          // Hero: horizontal swipe cycles heroVideos (when present); vertical
          // pans fall through to the outer snap scroller for next listing.
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            e.preventDefault();
            e.stopPropagation();
            onSwipe(dx < 0 ? 1 : -1);
          }
        }}
      >
        {/* Desktop blurred backdrop — Douyin-style. Fills the letterbox
         * gutters on md+ where the video is object-contain (9:16 inside 16:9).
         * Uses the poster as a still backdrop (zero extra bandwidth: poster
         * is already loaded by the <video> tag below). Hidden on mobile where
         * object-cover already fills the viewport. */}
        {poster && (
          <img
            src={poster}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden h-full w-full scale-110 object-cover opacity-60 blur-2xl md:block"
          />
        )}
        {shouldMount ? (
          <>
            <video
              ref={videoRef}
              style={
                // Phase 71.14: rotate-90 fullscreen — measure the visual
                // viewport in JS and set width/height as raw pixels. Setting
                // `width = viewportHeight` and `height = viewportWidth`
                // BEFORE rotate-90 means after the CSS rotate lands the box
                // occupies exactly viewportWidth × viewportHeight — zero
                // black bars on any phone aspect ratio.
                isFullscreen && hasLandscape && vp.w > 0
                  ? {
                      position: 'fixed',
                      top: '50%',
                      left: '50%',
                      width: `${vp.h}px`,
                      height: `${vp.w}px`,
                      // Phase 71.19 (2026-07-06): Tailwind Preflight injects
                      // `img,video { max-width: 100%; height: auto; }` globally,
                      // which was clamping our 781×428 rotate box back down to
                      // the parent's 428px width — leaving a 428×428 <video>
                      // and ~20% top/bottom black bars after rotate. Explicit
                      // maxWidth/maxHeight/minWidth/minHeight none overrides
                      // Preflight so our JS-measured px sizes actually win.
                      maxWidth: 'none',
                      maxHeight: 'none',
                      minWidth: 0,
                      minHeight: 0,
                      transform: 'translate(-50%, -50%) rotate(90deg)',
                      objectFit: 'cover',
                      zIndex: 10000,
                      // Phase 71.20: video was intercepting taps because its
                      // `position:fixed` at zIndex 10000 sat above the parent
                      // div that owns onTap. `pointer-events: none` lets taps
                      // pass through to the transparent inner div below,
                      // which has onClick={onTap} for pause/play. The X and
                      // play glyph are separately positioned above with
                      // their own hit boxes so they still receive clicks.
                      pointerEvents: 'none',
                      // Phase 74.7 (skill ref §1): opacity gate — video stays
                      // hidden behind the poster overlay below until the
                      // first real frame paints (see reveal effect above).
                      opacity: hasFirstFrame ? 1 : 0,
                      transition: 'opacity 150ms',
                    }
                  : {
                      // Phase 74.7 (skill ref §1): opacity gate — see above.
                      opacity: hasFirstFrame ? 1 : 0,
                      transition: 'opacity 150ms',
                    }
              }
              className={
                isFullscreen && hasLandscape
                  ? // Phase 71.14 (2026-07-06): styles are inline (see `style`
                    // above). Keep className empty for the fullscreen branch
                    // to avoid Tailwind's arbitrary-vw/vh utilities racing
                    // with inline sizing.
                    ''
                  : 'relative h-full w-full object-contain'
              }
              playsInline
              muted
              loop
              preload="auto"
            />
            {/* Phase 74.7 (skill ref §1): poster overlay covers the <video>
             * until the first real frame paints. Killing the `poster=` attr
             * on <video> means iOS Safari never shows its system big-play
             * placeholder. Layer sits above <video> (which is opacity:0)
             * and is unmounted the moment hasFirstFrame flips true. */}
            {poster && !hasFirstFrame && (
              <img
                src={poster}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full bg-black object-contain"
              />
            )}
          </>
        ) : poster ? (
          <img
            src={poster}
            alt=""
            className="relative h-full w-full object-contain"
          />
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/50 to-transparent" />

      {/* Phase 28.1 (2026-06-15): single category pill — gold-on-gold,
       * top-left. Replaces the older dark-card source overlay AND the
       * bottom-caption gold pill that duplicated this same data. Only
       * shown in Nearby mode; hero is unlabelled. Pool counter sits in
       * the same pill so the user knows their position in the feed.
       * Phase 28.2 (2026-06-15): the per-category blurb (sel.line2) is
       * dropped — the title alone reads cleaner and the blurb was
       * pushing the pill into a multi-line wrap on long captions. */}
      {source === 'nearby' && sel.category && (
        <div className="absolute top-16 left-5 z-10 inline-flex items-center gap-2 rounded-full border border-cream/40 bg-cream/15 px-3 py-1 backdrop-blur">
          <span className="font-medium text-[11px] text-cream uppercase tracking-wider">
            {sel.line1}
          </span>
          {poolSize > 1 && (
            <span className="rounded-full bg-cream/15 px-1.5 py-0.5 font-medium text-[10px] text-cream/90 tabular-nums">
              {(cycleIdx % poolSize) + 1}/{poolSize}
            </span>
          )}
        </div>
      )}

      {/* Phase 68.4 (2026-07-03): chip finally simplified to a circular
       * ActionButton (matches Like/Save/Contact/Share visually) with the
       * video count as the badge. Owner: "不好看 做成一个圆形加数字 不要文字了".
       * Positioned inline as the first child of the right rail below —
       * this replaces the absolute-positioned chip. See rail block. */}

      {/* Phase 28.2 (2026-06-15): desktop nav arrows for the Nearby pool.
       * Touch events don't fire on a Mac mouse, so the vertical-swipe
       * gesture is mobile-only. Up/Down arrows (md:flex) mirror the
       * PhotoCard's left/right arrow pattern. Hidden when pool ≤ 1 or
       * when not in Nearby mode. Stops propagation so the click doesn't
       * also trigger the tap-to-pause handler. */}
      {source === 'nearby' && poolSize > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSwipe(-1);
            }}
            aria-label="Previous nearby video"
            className="-translate-x-1/2 absolute top-20 left-1/2 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur transition-colors hover:border-cream hover:text-cream md:flex"
            style={{ touchAction: 'manipulation' }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSwipe(1);
            }}
            aria-label="Next nearby video"
            className="-translate-x-1/2 absolute bottom-32 left-1/2 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur transition-colors hover:border-cream hover:text-cream md:flex"
            style={{ touchAction: 'manipulation', transform: 'translateX(-50%) rotate(180deg)' }}
          >
            ‹
          </button>
        </>
      )}

      {shouldMount && domPaused && (
        <div
          className="pointer-events-none flex items-center justify-center"
          style={
            isFullscreen && hasLandscape
              ? {
                  // Phase 71.20: play glyph must live above the fullscreen
                  // <video> (zIndex 10000) and rotate 90deg so its
                  // orientation matches the rotated video the user is
                  // watching.
                  position: 'fixed',
                  inset: 0,
                  zIndex: 10001,
                  transform: 'rotate(90deg)',
                }
              : { position: 'absolute', inset: 0 }
          }
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/40 text-cream backdrop-blur">
            <PlayIcon />
          </div>
        </div>
      )}

      {/* Phase 71.7 (2026-07-06): fullscreen toggle. Shown only when the
       * render worker produced a landscape companion (i.e. ≥80% horizontal
       * source photos). In portrait mode the button sits mid-lower over
       * the letterbox area (below where the horizontal frame ends);
       * tapping enters an in-page fullscreen overlay that swaps the HLS
       * source to the 1920x1080 landscape uid. Uses custom overlay rather
       * than the native Fullscreen API to avoid iOS Safari's
       * webkitEnterFullscreen tearing down HLS.js. */}
      {shouldMount && hasLandscape && !isFullscreen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsFullscreen(true);
          }}
          aria-label="View landscape fullscreen"
          className="-translate-x-1/2 absolute bottom-[26%] left-1/2 z-20 flex items-center gap-2 rounded-full border border-cream/30 bg-ink/70 px-4 py-2 text-cream text-sm backdrop-blur transition-colors hover:border-cream hover:bg-ink/85"
          style={{ touchAction: 'manipulation' }}
        >
          {/* corner-arrows expand icon */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 9V4h5" />
            <path d="M20 9V4h-5" />
            <path d="M4 15v5h5" />
            <path d="M20 15v5h-5" />
          </svg>
          <span>Full screen</span>
        </button>
      )}
      {isFullscreen && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(false);
            }}
            aria-label="Exit fullscreen"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/40 bg-ink/80 text-cream backdrop-blur transition-colors hover:border-cream hover:bg-ink/90"
          style={{
            // Phase 71.20: X button was hidden BEHIND the fullscreen video
            // because the video sits at zIndex 10000 (needed to escape the
            // parent stacking context). Bump X to 10002 (also above the
            // 10001 play glyph). Position via `fixed` so it doesn't inherit
            // the section's stacking-context ceiling.
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 10002,
            touchAction: 'manipulation',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        </>
      )}

      {/* Bottom caption — Phase 74 (2026-07-05): floating glass card
       * with description + agent card in a light bottom sheet (AAA
       * contrast) so nothing overlaps the video. Right rail lives at
       * `right-3`; the card reserves right-20 to clear it.
       * Phase 71.12 (2026-07-06): hidden in fullscreen — immersive mode
       * is video-only, price/address/agent card have no place there. */}
      {!isFullscreen && (
        <CaptionCard
          listing={card.listing}
          agent={card.agent}
        />
      )}
    </section>
  );
}

/**
 * Phase 74 (2026-07-05): DescriptionBlock retired. Description now lives
 * inside the CaptionCard bottom sheet (light surface, AAA contrast), not
 * inline over the media.
 */

export function BrowseFeed({
  cards,
  initialIndex = 0,
}: {
  cards: BrowseCard[];
  /**
   * Phase 9: when launched from the grid, jump straight to the clicked card.
   * Defaults to 0 (top of feed) for backwards compatibility.
   */
  initialIndex?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Phase 35.3 (2026-06-17): Back semantics fix.
  //
  // Old behavior: Back pushed router.push(backHref) which was always
  // '/browse' (or '/dashboard' if ?from=dashboard). Same destination as
  // the Search button next to it, AND a same-tab forward-nav that lost
  // the grid's scroll position — so a buyer who tapped through 30
  // listings to get here landed back at slot 0. Tianrou flagged this:
  // two buttons doing the same thing isn't a feature.
  //
  // New behavior:
  //   - If we have history within the same origin → router.back().
  //     That's exactly what the browser back button does, preserves the
  //     grid scroll, and lets a buyer browse → listing → browse linearly.
  //   - If there's no history (deep link, opened in new tab) → push the
  //     fallback href (/dashboard for from=dashboard, /browse otherwise).
  //   - Dashboard "View ↗" still passes ?from=dashboard so the fallback
  //     stays /dashboard and the agent doesn't get dumped into /browse.
  //
  // The Search button next to Back is removed in this same change —
  // it was wired to /browse with title="Search (coming soon)", which is
  // a placeholder by our no-fake-data rule. When real search lands we
  // can add it back.
  const backFallbackHref = searchParams?.get('from') === 'dashboard' ? '/dashboard' : '/browse';
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [likeAnimKey, setLikeAnimKey] = useState(0);

  // Phase 34b (V1 redo, 2026-06-17): community sheet + carousel state.
  // The chip on each card opens a single shared sheet at the parent level
  // (only one card can be active at a time, so a single sheet suffices).
  // Carousel is L2 (fullscreen) and pushes/pops independently.
  const [sheetCardId, setSheetCardId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselStartIdx, setCarouselStartIdx] = useState(0);

  // Phase 21 (2026-06-13): persistent saves keyed by anonymous device id.
  // Hydrated on mount from saved_listings; toggleSave fires server actions.
  // Resolved lazily on the client (localStorage requires window).
  const deviceIdRef = useRef<string | null>(null);
  useEffect(() => {
    void (async () => {
      const id = getOrCreateDeviceId();
      deviceIdRef.current = id;
      try {
        const [ids, likedIds] = await Promise.all([
          listSavedListingIds({ deviceId: id }),
          listLiked({ deviceId: id, kind: 'listing' }),
        ]);
        if (ids.length > 0) {
          setSaved(Object.fromEntries(ids.map((lid: string) => [lid, true])));
        }
        if (likedIds.length > 0) {
          setLiked(Object.fromEntries(likedIds.map((lid: string) => [lid, true])));
        }
      } catch (err) {
        console.error('[BrowseFeed] saved hydrate failed', err);
      }
    })();
  }, []);

  // per-card source + cycle index. key = listing.id
  const [sourceByCard, setSourceByCard] = useState<Record<string, Source>>({});
  const [cycleByCard, setCycleByCard] = useState<Record<string, number>>({});
  const [pausedActive, setPausedActive] = useState(true);
  // Global mute state. We optimistically start UNMUTED — if the user arrived
  // via a click on the Landing "Explore" CTA (or any in-app navigation), the
  // browser's sticky activation lets us autoplay with sound. If the user
  // landed directly on /browse/feed (e.g. via a shared link in a new tab),
  // the browser will reject autoplay-with-sound and the Card's catch handler
  // calls setMuted(true) to fall back to muted playback. In either case the
  // bottom-bar Sound button reflects the actual state.
  const [muted, setMuted] = useState(false);
  // Set when autoplay-with-sound was blocked and we fell back to muted. The
  // next genuine user gesture (tap/swipe/keydown) on the feed flips us back
  // to unmuted — TikTok-style "first interaction enables sound" so users
  // don't have to find the Sound button.
  const wasAutoplayBlockedRef = useRef(false);
  useEffect(() => {
    if (!muted || !wasAutoplayBlockedRef.current) return;
    const unmuteOnce = () => {
      wasAutoplayBlockedRef.current = false;
      setMuted(false);
    };
    window.addEventListener('pointerdown', unmuteOnce, { once: true, passive: true });
    window.addEventListener('keydown', unmuteOnce, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unmuteOnce);
      window.removeEventListener('keydown', unmuteOnce);
    };
  }, [muted]);
  const [leadOpen, setLeadOpen] = useState(false);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Phase 27.9 (2026-06-16): infinite swipe — repeat the cards array as the
  // user nears the end. Keyed-by-listing.id state (saved / liked / source /
  // cycle) is intentionally shared across loop copies; a buyer landing on
  // copy #2 of the same listing sees its existing Like / Save state. Cap
  // 50 loops to bound DOM growth.
  const [loops, setLoops] = useState(2);
  const totalCards = cards.length === 0 ? 0 : cards.length * loops;
  useEffect(() => {
    if (cards.length === 0) return;
    if (activeIndex >= (loops - 1) * cards.length && loops < 50) {
      setLoops((l) => l + 1);
    }
  }, [activeIndex, loops, cards.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach on totalCards growth
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            const idxAttr = (e.target as HTMLElement).dataset.idx;
            if (idxAttr) setActiveIndex(Number(idxAttr));
          }
        }
      },
      { root, threshold: [0.6] },
    );
    // biome-ignore lint/complexity/noForEach: Map iteration is cleanest with forEach
    cardRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [totalCards]);

  // Phase 9: when launched from the grid with ?start=<id>, jump to that
  // card without animation on first paint. Skipped when initialIndex is 0
  // (default — natural top-of-feed entry from older deep links).
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional one-shot mount effect
  useEffect(() => {
    if (initialIndex <= 0) return;
    const root = scrollerRef.current;
    const target = cardRefs.current.get(initialIndex);
    if (!root || !target) return;
    root.scrollTo({ top: target.offsetTop, behavior: 'auto' });
  }, []);

  const setCardRef = useCallback((idx: number, el: HTMLElement | null) => {
    if (!el) {
      cardRefs.current.delete(idx);
      return;
    }
    el.dataset.idx = String(idx);
    cardRefs.current.set(idx, el);
  }, []);

  const active = cards[activeIndex];
  const activeId = active?.listing.id;
  const activeSource: Source = activeId ? (sourceByCard[activeId] ?? 'hero') : 'hero';
  const activeCycle = activeId ? (cycleByCard[activeId] ?? 0) : 0;
  const isLiked = activeId ? !!liked[activeId] : false;
  const isSaved = activeId ? !!saved[activeId] : false;
  void activeCycle; // kept for symmetry; per-card cycle read inside Card via cycleByCard

  const switchSource = useCallback(
    (s: Source) => {
      if (!active) return;
      const id = active.listing.id;
      setSourceByCard((prev) => {
        const cur = prev[id] ?? 'hero';
        // Same source tapped again → cycle next b-roll
        if (cur === s) {
          setCycleByCard((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
          return prev;
        }
        // New source → reset cycle
        setCycleByCard((c) => ({ ...c, [id]: 0 }));
        return { ...prev, [id]: s };
      });
    },
    [active],
  );

  const toggleLike = useCallback(() => {
    if (!active) return;
    const id = active.listing.id;
    const wasLiked = !!liked[id];
    setLiked((m) => ({ ...m, [id]: !wasLiked }));
    if (!wasLiked) setLikeAnimKey((n) => n + 1);

    const deviceId = deviceIdRef.current;
    if (!deviceId) return;
    void (async () => {
      const result = await toggleLikeAction({
        deviceId,
        kind: 'listing',
        targetId: id,
        liked: !wasLiked,
      });
      if (!result.ok) {
        console.error('[BrowseFeed] like toggle failed', result.error);
        setLiked((m) => ({ ...m, [id]: wasLiked }));
      }
    })();
  }, [active, liked]);

  const toggleSave = useCallback(() => {
    if (!active) return;
    const id = active.listing.id;
    const wasSaved = !!saved[id];
    // Optimistic flip; revert on server failure.
    setSaved((m) => ({ ...m, [id]: !wasSaved }));

    const deviceId = deviceIdRef.current;
    if (!deviceId) return; // hydration race; user likely double-tapped before mount fetch

    void (async () => {
      const result = await (wasSaved
        ? unsaveListing({ deviceId, listingId: id })
        : saveListing({ deviceId, listingId: id }));
      if (!result.ok) {
        console.error('[BrowseFeed] save toggle failed', result.error);
        // revert optimistic flip
        setSaved((m) => ({ ...m, [id]: wasSaved }));
      }
    })();
  }, [active, saved]);

  const openContact = useCallback(() => {
    setLeadOpen(true);
  }, []);

  const onShare = useCallback(async () => {
    if (!active) return;
    const url = `${window.location.origin}/v/${active.agent.slug}/${active.listing.slug}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: active.listing.address, url });
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      // Silent copy — user requested no popup after share.
    } catch {
      /* ignore — nothing else to do without clipboard access */
    }
  }, [active]);

  const hasNearby = (active?.categoryVideos.length ?? 0) > 0;

  // Keyboard: ←/→ cycle b-roll within current source, Esc returns to hero.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!active) return;
      if (e.key === 'Escape' && activeSource !== 'hero') {
        e.preventDefault();
        switchSource('hero');
        return;
      }
      if (activeSource === 'hero') return;
      const id = active.listing.id;
      const pool = poolFor(active, activeSource);
      if (pool <= 1) return;
      // Phase 28.1 (2026-06-15): in Nearby mode the swipe gesture is now
      // vertical, so accept ArrowUp/Down as the keyboard equivalent.
      // Left/Right are kept as a desktop power-user fallback.
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCycleByCard((c) => {
          const cur = c[id] ?? 0;
          return { ...c, [id]: (cur + 1) % pool };
        });
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCycleByCard((c) => {
          const cur = c[id] ?? 0;
          return { ...c, [id]: (((cur - 1) % pool) + pool) % pool };
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, activeSource, switchSource]);

  // Phase 28.2 (2026-06-15): desktop wheel/trackpad cycles the Nearby pool.
  // Without this, wheeling on a Mac scrolls the outer snap-y feed and jumps
  // to the next listing — the same UX bug the user reported. We intercept
  // wheel only while in Nearby mode, debounce by ignoring sub-threshold deltas
  // and a 350ms cool-down, and step through the pool by ±1.
  const wheelLockRef = useRef<number>(0);
  useEffect(() => {
    if (activeSource !== 'hero') {
      const root = scrollerRef.current;
      if (!root || !active) return;
      const id = active.listing.id;
      const pool = poolFor(active, activeSource);
      if (pool <= 1) return;
      const onWheel = (e: WheelEvent) => {
        if (Math.abs(e.deltaY) < 8) return;
        e.preventDefault();
        const now = Date.now();
        if (now - wheelLockRef.current < 350) return;
        wheelLockRef.current = now;
        const delta = e.deltaY > 0 ? 1 : -1;
        setCycleByCard((c) => {
          const cur = c[id] ?? 0;
          return { ...c, [id]: (((cur + delta) % pool) + pool) % pool };
        });
      };
      root.addEventListener('wheel', onWheel, { passive: false });
      return () => root.removeEventListener('wheel', onWheel);
    }
  }, [active, activeSource]);

  return (
    <FeedShell
      scrollerRef={scrollerRef}
      cards={Array.from({ length: totalCards }, (_, idx) => {
          const card = cards[idx % cards.length];
          if (!card) return null;
          const id = card.listing.id;
          const cardSource = sourceByCard[id] ?? 'hero';
          const cardCycle = cycleByCard[id] ?? 0;
          const isThisActive = idx === activeIndex;
          if (card.mediaKind === 'photo') {
            return (
              <PhotoCard
                key={`${card.id}-${idx}`}
                card={card}
                cycleIdx={cardCycle}
                cardRef={(el) => setCardRef(idx, el)}
                poolSize={poolFor(card, cardSource)}
                isActive={idx === activeIndex}
                onSwipe={(delta) => {
                  const pool = poolFor(card, cardSource);
                  if (pool <= 1) return;
                  setCycleByCard((c) => {
                    const cur = c[id] ?? 0;
                    const next = (((cur + delta) % pool) + pool) % pool;
                    return { ...c, [id]: next };
                  });
                }}
              />
            );
          }
          return (
            <Card
              key={`${card.id}-${idx}`}
              card={card}
              source={cardSource}
              cycleIdx={cardCycle}
              shouldMount={Math.abs(idx - activeIndex) <= 1}
              isActive={isThisActive}
              cardRef={(el) => setCardRef(idx, el)}
              paused={isThisActive ? pausedActive : true}
              setPaused={isThisActive ? setPausedActive : () => {}}
              poolSize={poolFor(card, cardSource)}
              muted={muted}
              onAutoplayBlocked={() => {
                wasAutoplayBlockedRef.current = true;
                setMuted(true);
              }}
              onSwipe={(delta) => {
                // Horizontal swipe cycles within the current source's b-roll pool.
                const pool = poolFor(card, cardSource);
                if (pool <= 1) return;
                setCycleByCard((c) => {
                  const cur = c[id] ?? 0;
                  const next = (((cur + delta) % pool) + pool) % pool;
                  return { ...c, [id]: next };
                });
              }}
              onOpenCommunitySheet={
                card.community
                  ? () => {
                      setSheetCardId(card.id);
                      setSheetOpen(true);
                      // Pause the underlying listing video so the sheet has focus.
                      setPausedActive(true);
                    }
                  : undefined
              }
            />
          );
        })}
    >

      {/* Right rail — Xiaohongshu / TikTok pattern (Phase 28, 2026-06-14).
       * All primary CTAs live here for an immersive bottom-edge: Like /
       * Save / Contact / Nearby (+ Sound for video). The bottom action
       * bar is gone; the caption block below extends to the safe-area.
       *
       * Nearby: switches into the single 12-category community-video pool.
       * Disabled (greyed) when the listing has no community videos. The
       * Card overlay renders a per-video category pill (label + blurb)
       * read from COMMUNITY_VIDEO_CATEGORIES on the client.
       *
       * Photo cards: same Like/Save/Contact/Nearby — only Sound is
       * hidden because there's no <video> to mute. Schools/POIs strip
       * inside PhotoCard caption is preserved (Phase 20).
       *
       * Phase 45.21 (2026-06-20): rail reverted back up to ~6rem from
       * the safe-area baseline. Phase 45.15 had lowered it to
       * `max(1rem, safe-area)` to align with the caption block, but
       * owner feedback after living with it: the buttons sat too low,
       * thumb reach was awkward and they crowded the caption. Caption
       * stays at `bottom: 1rem` — only the rail moves up. */}
      <div
        className={`absolute right-3 ${FEED_Z.rail} flex flex-col items-center gap-3`}
        style={{ bottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
      >
        {/* Phase 68.4 (2026-07-03): community chip replaced with a circular
         * ActionButton at the top of the rail — same visual weight as
         * Like/Save/Contact/Share so the whole column reads as one design.
         * Uses ActionButton's built-in badge to show video count in red.
         * Owner: "不好看 做成一个圆形加数字 不要文字了 放在 like 上面". */}
        {active?.community && (
          <ActionButton
            label="Nearby"
            onClick={() => {
              setSheetCardId(active.id);
              setSheetOpen(true);
              setPausedActive(true);
            }}
            badge={active.community.videoCount > 0 ? active.community.videoCount : undefined}
            badgeColor="red"
          >
            <span aria-hidden="true" className="text-[20px] leading-none">🏘️</span>
          </ActionButton>
        )}
        <div key={likeAnimKey} className={likeAnimKey > 0 ? 'heart-pop' : ''}>
          <ActionButton label="Like" onClick={toggleLike} active={isLiked} activeColor="rose">
            <HeartIcon filled={isLiked} />
          </ActionButton>
        </div>
        <ActionButton label="Save" onClick={toggleSave} active={isSaved}>
          <BookmarkIcon filled={isSaved} />
        </ActionButton>
        <ActionButton label="Contact" onClick={openContact}>
          <CommentIcon />
        </ActionButton>
        {/* Phase 68 (2026-07-03): Share moved from top-header right-slot into
         * the bottom of the right rail. Frees the top-right for the community
         * chip (笑云 feedback: chip in the top-left was invisible), and puts
         * social/outbound actions in one column. */}
        <ActionButton label="Share" onClick={onShare}>
          <ShareIcon />
        </ActionButton>
        {/* Phase 34b.1 (2026-06-17): right-rail "Nearby" button removed. The
         * top-left community chip already opens the same set of community
         * videos via CommunitySheet → CommunityCarousel — keeping both
         * surfaces was the duplication the chip was meant to replace.
         * Phase 37 (2026-06-18): /nearby tab in bottom nav was folded
         * into Explore sub-nav (Recommended | Nearby) — radius search
         * lives at /browse?tab=nearby. */}
        {/* phase34a (2026-06-17): right-rail mute button removed.
         * Volume is controlled by the device's system volume keys —
         * keeps the rail clean and avoids a redundant control. The
         * `muted` state is retained internally for the autoplay-blocked
         * fallback (browser blocks unmuted autoplay → start muted →
         * first interaction unmutes). */}
      </div>

      {/* Phase 28.1 (2026-06-15): centered NEARBY label removed — the
       * gold category pill on each card already tells the user they're
       * in the Nearby pool, and the right-rail Nearby button is in its
       * active gold state, so the standalone label was redundant. */}

      {/* Top header — Xiaohongshu video pattern. Phase 68 (2026-07-03):
       * Share button moved out of the top-right and into the bottom of
       * the right rail (see below). The community chip now occupies the
       * top-right slot instead. Only Back remains here. When viewing a
       * b-roll source, Back first returns to hero; on the hero we do
       * router.back() if there's history (preserves grid scroll), else
       * push the fallback. */}
      <div className={`absolute inset-x-0 top-0 ${FEED_Z.topbar} flex items-center justify-between px-3 pt-3`}>
        <button
          type="button"
          onClick={() => {
            if (activeSource !== 'hero') {
              switchSource('hero');
              return;
            }
            // history.length > 1 means there's at least one prior entry
            // we can pop back to. window.history.length is 1 on a fresh
            // tab / deep link, in which case we use the fallback.
            if (typeof window !== 'undefined' && window.history.length > 1) {
              router.back();
            } else {
              router.push(backFallbackHref);
            }
          }}
          aria-label={activeSource !== 'hero' ? 'Back to listing video' : 'Back'}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/55 text-cream backdrop-blur-md transition-colors hover:border-cream hover:text-cream"
          style={{ touchAction: 'manipulation' }}
        >
          <BackArrowIcon />
        </button>
        {/* Right slot intentionally empty — community chip renders at
         * top-3 right-3 inside the Card, above the right rail. */}
      </div>

      {/* Phase 28 (2026-06-14): the bottom Like/Save/Contact bar moved
       * into the right rail above. The caption block on the Card now
       * extends to the safe-area, giving an immersive bottom edge. */}

      {/* Phase 45.24 (2026-06-21): "Swipe up for more" hint removed —
       * gesture is self-evident on a TikTok-style feed and the text was
       * crowding the bottom edge over the caption. */}

      {active && (
        <LeadModal
          open={leadOpen}
          onClose={() => setLeadOpen(false)}
          agent={{ name: active.agent.name }}
          listing={{ address: active.listing.address }}
          listingId={active.listing.id}
        />
      )}

      {/* Phase 34b (V1 redo): community sheet (L1) + fullscreen carousel (L2).
       * Resolved once at parent level — `sheetCardId` selects which card's
       * community/data flows into the sheet. Sheet → carousel transition
       * keeps the sheet mounted underneath so closing the carousel returns
       * the user to L0 (listing video) per V1 spec — the sheet is a transient
       * lookup, not a stable anchor. */}
      {(() => {
        const sheetCard = sheetCardId ? (cards.find((c) => c.id === sheetCardId) ?? null) : null;
        const sheetData: CommunitySheetData | null =
          sheetCard && sheetCard.community
            ? {
                slug: sheetCard.community.slug,
                name: sheetCard.community.name,
                city: sheetCard.community.city,
                state: sheetCard.community.state,
                description: sheetCard.community.description,
                videoCount: sheetCard.community.videoCount,
                listingCount: sheetCard.community.listingCount,
                videos: sheetCard.categoryVideos,
              }
            : null;
        return (
          <>
            <CommunitySheet
              open={sheetOpen && !carouselOpen}
              data={sheetData}
              onClose={() => {
                setSheetOpen(false);
                setSheetCardId(null);
              }}
              onOpenCarousel={(idx) => {
                setCarouselStartIdx(idx);
                setCarouselOpen(true);
              }}
            />
            <CommunityCarousel
              open={carouselOpen}
              videos={sheetCard?.categoryVideos ?? []}
              startIndex={carouselStartIdx}
              backLabel={sheetCard?.listing.address ?? ''}
              onClose={() => {
                // Close carousel AND sheet — V1 spec: "‹ Back" goes to L0,
                // skipping the sheet so the user lands back on the listing
                // video without an extra dismiss step.
                setCarouselOpen(false);
                setSheetOpen(false);
                setSheetCardId(null);
              }}
              // Phase 45.17 (2026-06-20): rail handlers target the parent
              // listing (the user's anchor). Reuses the same callbacks the
              // main listing feed uses, so Like/Save state is consistent
              // whether the buyer taps the rail on L0 or in the carousel.
              // Per owner: "if exploring listing then going to see the
              // community videos, contact listing owner".
              onShare={onShare}
              onToggleLike={toggleLike}
              onToggleSave={toggleSave}
              onContact={openContact}
              liked={isLiked}
              saved={isSaved}
            />
          </>
        );
      })()}
    </FeedShell>
  );
}
