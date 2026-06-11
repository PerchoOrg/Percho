'use client';

/**
 * VideoFeed — public listing page video feed.
 *
 * 2026-06-11 (parity hotfix): rewritten to delegate playback + right-rail UX
 * to the shared `BrowseFeed` component (same as `/browse`). Why: user
 * feedback that share-link feed felt second-class compared to browse —
 * Schools/Nearby/Area/Sound rail buttons were missing. Single source of
 * truth wins: BrowseFeed handles HLS, source switching, mute, share, and
 * we just override Contact to open LeadModal here.
 *
 * Shape: `cards: BrowseCard[]` (from `/browse`'s schema). For a single
 * listing this list always has length 1; multi-walkthrough listings are
 * exposed via `card.heroVideos` (BrowseFeed cycles them on repeat-tap of
 * the Hero source / horizontal swipe).
 *
 * page_view event still fires once on mount; per-card analytics are
 * deferred until BrowseFeed grows that hook (DEVLOG: parity tradeoff).
 */

import { type BrowseCard, BrowseFeed } from '@/app/(public)/browse/_components/BrowseFeed';
import { track } from '@/lib/events/track';
import { useEffect, useState } from 'react';
import { LeadModal } from './LeadModal';
import type { FeedAgent, FeedListing } from './types';

type Props = {
  agent: FeedAgent;
  listing: FeedListing;
  listingId: string;
  cards: BrowseCard[];
};

export function VideoFeed({ agent, listing, listingId, cards }: Props) {
  const [leadOpen, setLeadOpen] = useState(false);

  useEffect(() => {
    track({ event_type: 'page_view', listing_id: listingId });
  }, [listingId]);

  if (cards.length === 0) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-ink text-cream/60 text-sm">
        No videos yet for this listing.
      </main>
    );
  }

  return (
    <>
      <BrowseFeed cards={cards} onContact={() => setLeadOpen(true)} />
      <LeadModal
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        agent={agent}
        listing={listing}
        listingId={listingId}
      />
    </>
  );
}
