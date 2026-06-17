import { BrowseFeed } from '@/app/(public)/browse/_components/BrowseFeed';
import {
  fetchBrowseCards,
  fetchBrowseCardsByCommunitySlug,
} from '@/lib/feed/browse-cards';
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
 *
 * Phase 27.4 (2026-06-16): also accepts `?community=<slug>` to scope
 * the feed to active listings inside a single community. Linked from
 * `/c/[slug]` tiles. Unknown slug falls through to global feed silently.
 */
export default async function BrowseFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; community?: string }>;
}) {
  const { start, community } = await searchParams;

  const allCards = community
    ? await fetchBrowseCardsByCommunitySlug(community)
    : await fetchBrowseCards();

  // If a community filter returned nothing (unknown slug or empty
  // community), fall back to the global feed so the user still sees
  // something rather than an empty page.
  const finalCards =
    community && allCards.length === 0 ? await fetchBrowseCards() : allCards;

  // Phase 10 (2026-06-12): the immersive swipe feed is video-only by
  // design ("TikTok for Homebuying"). Photo-only listings still appear in
  // the grid at `/browse`; clicking one opens the listing detail page,
  // not this feed. Filter them out here so we don't surface a broken
  // black card with no <video> source.
  const cards = finalCards.filter((c) => c.mediaKind === 'video');

  // Resolve `start` (a listing id) → array index. Bad / missing ids fall
  // through to 0 silently — preferable to a 404 because the swipe is just
  // a presentation-order tweak, not a route the user typed by hand.
  let initialIndex = 0;
  if (start) {
    const idx = cards.findIndex((c) => c.listing.id === start);
    if (idx >= 0) initialIndex = idx;
  }

  return (
    <BrowseFeed
      cards={cards}
      initialIndex={initialIndex}
    />
  );
}
