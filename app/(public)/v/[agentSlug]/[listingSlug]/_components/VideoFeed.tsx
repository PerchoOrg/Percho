'use client';

/**
 * VideoFeed — vertical scroll-snap container for the public listing page.
 *
 * Phase 3.4: tracks the active card via IntersectionObserver, then tells each
 * FeedCard whether to mount its <video> (active ±1 only) and whether it's the
 * one currently playing.
 *
 * Phase 8.3 polish:
 *  - heart-pop animation key threaded into ActionRail
 *  - first-time scroll-cue chevron auto-fades after the first swipe
 *  - keyboard navigation (ArrowDown/ArrowUp/PageDown/PageUp) for desktop
 *
 * Why ±1: the next card pre-buffers so a swipe is instant; the previous one
 * stays mounted so a back-swipe doesn't restart loading. Total = 3 mounted
 * <video> tags max — see CLAUDE.md memory budget.
 */

import { track } from '@/lib/events/track';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionRail } from './ActionRail';
import { FeedCard } from './FeedCard';
import { LeadModal } from './LeadModal';
import type { FeedAgent, FeedCard as FeedCardData, FeedListing } from './types';

type Props = {
  agent: FeedAgent;
  listing: FeedListing;
  listingId: string;
  cards: FeedCardData[];
};

export function VideoFeed({ agent, listing, listingId, cards }: Props) {
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [leadOpen, setLeadOpen] = useState(false);
  const [likeAnimKey, setLikeAnimKey] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const toggleLikeRef = useRef<() => void>(() => {});

  const setCardRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (el) cardRefs.current.set(index, el);
      else cardRefs.current.delete(index);
    },
    [],
  );

  // IntersectionObserver: whichever card crosses 60% becomes active.
  useEffect(() => {
    if (cards.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.cardIdx);
            if (!Number.isNaN(idx)) {
              setActiveIndex(idx);
              if (idx > 0) setHasScrolled(true);
            }
          }
        }
      },
      { threshold: [0.6] },
    );
    for (const el of cardRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [cards.length]);

  // page_view once on mount.
  useEffect(() => {
    track({ event_type: 'page_view', listing_id: listingId });
  }, [listingId]);

  // card_view fires when active card changes.
  useEffect(() => {
    const card = cards[activeIndex];
    if (!card) return;
    track({
      event_type: 'card_view',
      listing_id: listingId,
      card_id: card.id,
      meta: { card_index: activeIndex, source: card.source, kind: card.kind },
    });
  }, [activeIndex, cards, listingId]);

  // Keyboard navigation (desktop affordance).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = scrollerRef.current;
      if (!el) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') {
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight, behavior: 'smooth' });
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
        e.preventDefault();
        el.scrollBy({ top: -el.clientHeight, behavior: 'smooth' });
      } else if (e.key === 'l' || e.key === 'L') {
        toggleLikeRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleLike = useCallback(() => {
    const id = cards[activeIndex]?.id;
    if (!id) return;
    const wasLiked = !!liked[id];
    setLiked((s) => ({ ...s, [id]: !s[id] }));
    if (!wasLiked) {
      setLikeAnimKey((n) => n + 1);
      // NOTE: card_like is not in the events whitelist (zod schemas.ts).
      // Phase 9 will add it alongside the saved-listings persistence work.
    }
  }, [cards, activeIndex, liked]);

  // Keep ref in sync so keyboard 'l' shortcut always sees the latest closure.
  useEffect(() => {
    toggleLikeRef.current = toggleLike;
  }, [toggleLike]);

  if (cards.length === 0) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-ink text-cream/60 text-sm">
        No videos yet for this listing.
      </main>
    );
  }

  return (
    <main className="relative h-[100dvh] w-full bg-ink">
      <div className="relative mx-auto h-full w-full max-w-[480px] md:shadow-2xl md:shadow-black">
        <div
          ref={scrollerRef}
          className="h-full w-full snap-y snap-mandatory overflow-y-scroll scroll-smooth scrollbar-hide"
          style={{ scrollbarWidth: 'none' }}
        >
          {cards.map((card, i) => {
            const distance = Math.abs(i - activeIndex);
            const shouldMount = distance <= 1;
            return (
              <div
                key={card.id}
                ref={(el) => {
                  setCardRef(i)(el);
                }}
                data-card-idx={i}
              >
                <FeedCard
                  card={card}
                  agent={agent}
                  listing={listing}
                  listingId={listingId}
                  isFirst={i === 0}
                  isLast={i === cards.length - 1}
                  liked={!!liked[card.id]}
                  onToggleLike={toggleLike}
                  index={i}
                  cardRef={() => {
                    /* outer wrapper carries the ref; inner card just renders */
                  }}
                  shouldMount={shouldMount}
                  isActive={i === activeIndex}
                />
              </div>
            );
          })}
        </div>

        {/* Scroll cue: only on first card, fades once the user swipes. */}
        {!hasScrolled && cards.length > 1 && activeIndex === 0 && (
          <div className="-translate-x-1/2 pointer-events-none absolute bottom-28 left-1/2 z-20 flex flex-col items-center gap-1 text-cream/80">
            <span className="text-[10px] tracking-[0.2em] uppercase drop-shadow">Swipe up</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width={20}
              height={20}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="animate-bounce text-gold"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </div>
        )}

        {/* Card progress dots — slim, top center. */}
        <div className="-translate-x-1/2 pointer-events-none absolute top-2 left-1/2 z-30 flex max-w-[60%] gap-1">
          {cards.slice(0, Math.min(cards.length, 12)).map((c, i) => (
            <span
              key={c.id}
              className={`h-0.5 w-4 rounded-full transition-colors ${
                i === Math.min(activeIndex, 11) ? 'bg-gold' : 'bg-white/25'
              }`}
            />
          ))}
        </div>

        <ActionRail
          liked={!!liked[cards[activeIndex]?.id ?? '']}
          onToggleLike={toggleLike}
          listing={listing}
          agent={agent}
          onContact={() => setLeadOpen(true)}
          likeAnimKey={likeAnimKey}
        />
      </div>

      <LeadModal
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        agent={agent}
        listing={listing}
        listingId={listingId}
      />
    </main>
  );
}
