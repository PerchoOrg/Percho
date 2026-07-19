'use client';

/**
 * VideoFeed — public listing page video feed.
 *
 * 2026-06-11 (parity hotfix v2): now a thin pass-through to BrowseFeed.
 * LeadModal moved into BrowseFeed itself so /browse and /v/ share Contact
 * UX too (per user request: "统一按照 public link 里的来").
 *
 * page_view fires once on mount; per-card analytics deferred until
 * BrowseFeed grows that hook.
 */

import { type BrowseCard, BrowseFeed } from '@/app/(public)/browse/_components/BrowseFeed';
import { track } from '@/lib/events/track';
import { useEffect } from 'react';

type Props = {
  listingId: string;
  cards: BrowseCard[];
};

export function VideoFeed({ listingId, cards }: Props) {
  useEffect(() => {
    track({ event_type: 'page_view', listing_id: listingId });
  }, [listingId]);

  if (cards.length === 0) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-bg text-muted text-sm">
        No videos yet for this listing.
      </main>
    );
  }

  return <BrowseFeed cards={cards} />;
}
