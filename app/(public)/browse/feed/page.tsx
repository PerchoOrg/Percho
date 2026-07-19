import { BrowseFeed } from '@/app/(public)/browse/_components/BrowseFeed';
import { fetchBrowseCards, fetchBrowseCardsByCommunitySlug } from '@/lib/feed/browse-cards';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Explore · Percho',
  description: 'Swipe through homes for sale. Video-first listing tours.',
};

export const dynamic = 'force-dynamic';

/**
 * Browse / Swipe Feed.
 *
 * the grid at `/browse` links here with `?start=<id>`
 * to deep-link the swipe view to a specific listing. Without `start`, the
 * feed renders top-down (back-compat for any external links pointing at
 * the previous `/browse` URL).
 *
 * also accepts `?community=<slug>` to scope
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
  const finalCards = community && allCards.length === 0 ? await fetchBrowseCards() : allCards;

  // photo-only listings now flow into the swipe
  // feed alongside video listings. The Phase 10 video-only constraint was
  // an engineering boundary leaking into product — buyers experience
  // Explore as a single stream regardless of media kind. `BrowseFeed`
  // already renders `PhotoCard` for `mediaKind === 'photo'`, so no component changes
  // are needed; we just stop filtering them out here.
  const cards = finalCards;

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
