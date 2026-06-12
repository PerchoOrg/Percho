import { BrowseFeed } from '@/app/(public)/browse/_components/BrowseFeed';
import { fetchBrowseCards } from '@/lib/feed/browse-cards';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Explore · Vicinity',
  description: 'Swipe through homes for sale. Video-first listing tours.',
};

export const dynamic = 'force-dynamic';

/**
 * Browse / Swipe Feed.
 *
 * Phase 9 (2026-06-12): the grid at `/browse` links here with `?start=<id>`
 * to deep-link the swipe view to a specific listing. Without `start`, the
 * feed renders top-down (back-compat for any external links pointing at
 * the previous `/browse` URL).
 */
export default async function BrowseFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const { start } = await searchParams;
  const allCards = await fetchBrowseCards();
  // Phase 10 (2026-06-12): the immersive swipe feed is video-only by
  // design ("TikTok for Homebuying"). Photo-only listings still appear in
  // the grid at `/browse`; clicking one opens the listing detail page,
  // not this feed. Filter them out here so we don't surface a broken
  // black card with no <video> source.
  const cards = allCards.filter((c) => c.mediaKind === 'video');

  // Resolve `start` (a listing id) → array index. Bad / missing ids fall
  // through to 0 silently — preferable to a 404 because the swipe is just
  // a presentation-order tweak, not a route the user typed by hand.
  let initialIndex = 0;
  if (start) {
    const idx = cards.findIndex((c) => c.listing.id === start);
    if (idx >= 0) initialIndex = idx;
  }

  return <BrowseFeed cards={cards} initialIndex={initialIndex} />;
}
