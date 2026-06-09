'use client';

/**
 * VideoFeed — vertical scroll-snap container for the public listing page.
 *
 * Phase 3.4: tracks the active card via IntersectionObserver, then tells each
 * FeedCard whether to mount its <video> (active ±1 only) and whether it's the
 * one currently playing.
 *
 * Why ±1: the next card pre-buffers so a swipe is instant; the previous one
 * stays mounted so a back-swipe doesn't restart loading. Total = 3 mounted
 * <video> tags max — see CLAUDE.md memory budget.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionRail } from './ActionRail';
import { FeedCard } from './FeedCard';
import type { FeedAgent, FeedCard as FeedCardData, FeedListing } from './types';

type Props = {
  agent: FeedAgent;
  listing: FeedListing;
  cards: FeedCardData[];
};

export function VideoFeed({ agent, listing, cards }: Props) {
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());

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
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        }
      },
      { threshold: [0.6] },
    );
    for (const el of cardRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [cards.length]);

  if (cards.length === 0) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-ink text-cream/60 text-sm">
        No videos yet for this listing.
      </main>
    );
  }

  return (
    <main className="relative h-[100dvh] w-full bg-ink">
      <div className="relative mx-auto h-full w-full max-w-[480px]">
        <div
          className="h-full w-full snap-y snap-mandatory overflow-y-scroll scroll-smooth"
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
                  isFirst={i === 0}
                  isLast={i === cards.length - 1}
                  liked={!!liked[card.id]}
                  onToggleLike={() => setLiked((s) => ({ ...s, [card.id]: !s[card.id] }))}
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

        <ActionRail
          liked={!!liked[cards[activeIndex]?.id ?? '']}
          onToggleLike={() => {
            const id = cards[activeIndex]?.id;
            if (!id) return;
            setLiked((s) => ({ ...s, [id]: !s[id] }));
          }}
          listing={listing}
          agent={agent}
        />
      </div>
    </main>
  );
}
