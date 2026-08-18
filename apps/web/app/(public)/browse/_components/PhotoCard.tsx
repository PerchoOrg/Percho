'use client';
import type { BrowseCard } from '@/lib/feed/browse-card';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CaptionCard } from './CaptionCard';

/**
 * photo-only card. Same layout language as the video
 * Card (gradient overlays, bottom caption, source overlay top-left, action
 * bar handled by parent), but renders an <img> carousel instead of <video>.
 * Horizontal swipe / left-right keys cycle through `card.photos[]` via the
 * parent's existing cycleByCard plumbing — so persistence/keyboard logic
 * stays single-source-of-truth in BrowseFeed.
 */
export function PhotoCard({
  card,
  cycleIdx,
  cardRef,
  onSwipe,
  poolSize,
}: {
  card: BrowseCard;
  cycleIdx: number;
  cardRef: (el: HTMLElement | null) => void;
  onSwipe: (delta: 1 | -1) => void;
  poolSize: number;
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

  // native horizontal scroll-snap, tuned to remove
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

  // split display state from parent commit.
  // Owner: "滑动后页面和上面的计数不 sync — 上面的横杠和计数有延迟".
  //
  // 's 100ms settle debounce is what keeps the img/decode side
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
  // Also: rAF-throttled local `displayIdx` update so the
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
        const nearest = Math.max(0, Math.min(total - 1, Math.round(el2.scrollLeft / w)));
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
       * removed `scrollBehavior: 'smooth'`
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
          <div className="flex h-full w-full flex-shrink-0 snap-center items-center justify-center text-surface/40 text-sm">
            No photo
          </div>
        )}
        {photos.map((src, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: a b-roll pool can repeat the same src, so the index is what makes the key unique
            key={`${src}-${i}`}
            className="relative h-full w-full flex-shrink-0 snap-center"
            style={{ transform: 'translateZ(0)' }}
          >
            <img
              src={src}
              alt={i === idx ? `${card.listing.address} — ${i + 1} of ${total}` : ''}
              className="h-full w-full object-contain"
              // eager range widened ±1 → ±2 so a fast flick
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

      {/* header alignment with CommunityCarousel
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
          <div className="pointer-events-none absolute top-3 right-3 z-10 flex h-9 items-center rounded-full border border-surface/20 bg-ink/55 px-3 font-medium text-[12px] text-surface backdrop-blur-md tabular-nums">
            {displayIdx + 1} / {total}
          </div>
          <div className="pointer-events-none absolute inset-x-3 top-16 z-10 flex gap-1">
            {photos.map((p, i) => (
              <div
                key={`${p}-prog`}
                className={`h-0.5 flex-1 rounded-full transition-colors ${
                  i <= displayIdx ? 'bg-surface' : 'bg-surface/20'
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
            className="-translate-y-1/2 absolute top-1/2 left-3 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-surface/20 bg-ink/55 text-surface backdrop-blur transition-colors hover:border-surface hover:text-surface md:flex"
            style={{ touchAction: 'manipulation' }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next photo"
            className="-translate-y-1/2 absolute top-1/2 right-3 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-surface/20 bg-ink/55 text-surface backdrop-blur transition-colors hover:border-surface hover:text-surface md:flex"
            style={{ touchAction: 'manipulation' }}
          >
            ›
          </button>
        </>
      )}

      {/* Bottom caption — unified glass card
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
