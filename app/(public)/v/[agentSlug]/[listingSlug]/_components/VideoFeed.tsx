'use client';

/**
 * VideoFeed — vertical scroll-snap container for the public listing page.
 *
 * Phase 3.3: layout + scroll-snap only. No autoplay, no hls.js, no mount cap.
 * Each card renders its Cloudflare Stream poster (thumbnail) with a Play icon;
 * actual <video> playback wires up in Phase 3.4.
 *
 * Mobile-first: full-viewport (h-[100dvh]) cards. Desktop: letterboxed in a
 * max-w-[480px] column on a black background, mimicking the demo's preview.
 */

import { useState } from 'react';
import { ActionRail } from './ActionRail';
import { FeedCard } from './FeedCard';
import type { FeedAgent, FeedCard as FeedCardData, FeedListing } from './types';

type Props = {
  agent: FeedAgent;
  listing: FeedListing;
  cards: FeedCardData[];
};

export function VideoFeed({ agent, listing, cards }: Props) {
  // Local UI state. Phase 5 wires real saves; Phase 3 keeps it in-memory.
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  if (cards.length === 0) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-ink text-cream/60 text-sm">
        No videos yet for this listing.
      </main>
    );
  }

  return (
    <main className="relative h-[100dvh] w-full bg-ink">
      <div
        className="mx-auto h-full w-full max-w-[480px] snap-y snap-mandatory overflow-y-scroll scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {cards.map((card, i) => (
          <FeedCard
            key={card.id}
            card={card}
            agent={agent}
            listing={listing}
            isFirst={i === 0}
            isLast={i === cards.length - 1}
            liked={!!liked[card.id]}
            onToggleLike={() => setLiked((s) => ({ ...s, [card.id]: !s[card.id] }))}
          />
        ))}
      </div>

      {/* Action rail floats over the feed. Card-scoped state passes via props
          on the active card; for V1 we keep it global to the listing for
          simplicity (rail acts on the *current* listing, not per-card). */}
      <ActionRail
        liked={Object.values(liked).some(Boolean)}
        onToggleLike={() => {
          // Toggle the first card's like as a stand-in for "save listing".
          // Phase 5 replaces this with a real saved-listings server action.
          const firstId = cards[0]?.id;
          if (!firstId) return;
          setLiked((s) => ({ ...s, [firstId]: !s[firstId] }));
        }}
        listing={listing}
        agent={agent}
      />
    </main>
  );
}
