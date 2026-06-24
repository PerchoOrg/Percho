import { GridPageShell } from '@/app/_components/GridPageShell';
import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { fetchBrowseCards, fetchBrowseCardsByCommunitySlug } from '@/lib/feed/browse-cards';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'For You · Vicinity',
  description: 'Listings recommended for you. Tap a card to start a video tour.',
};

export const dynamic = 'force-dynamic';

/**
 * Browse — grid landing.
 *
 * Phase 9 (2026-06-12) pivot: Pinterest-style grid first; tapping a card
 * launches the swipe feed starting at that listing.
 *
 * Phase 27.5 (2026-06-16): also accepts `?community=<slug>` to scope the
 * grid to a single community.
 *
 * Phase 43.7 (2026-06-20): dropped the Recommended / Nearby sub-tabs.
 * Phase 45 (2026-06-20): Nearby resurrected as a TopBar sub-tab.
 *
 * Phase 47 (2026-06-21): refactored on top of shared GridPageShell +
 * ListingGrid so /browse, /dashboard, /communities, /dashboard/communities
 * all share the same card and container chrome. Per-card mapping (video
 * vs photo href, demo "Stock" badge) lives here; cover + caption shell
 * lives in app/_components/GridCard.tsx.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>;
}) {
  const { community: communitySlug } = await searchParams;

  return (
    <div className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
      <RecommendedGrid communitySlug={communitySlug ?? null} />
    </div>
  );
}

async function RecommendedGrid({ communitySlug }: { communitySlug: string | null }) {
  let communityLabel: string | null = null;
  if (communitySlug) {
    const supabase = await createClient();
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data } = (await (supabase as any)
      .from('communities')
      .select('name')
      .eq('slug', communitySlug)
      .maybeSingle()) as { data: { name: string } | null };
    communityLabel = data?.name ?? null;
  }
  void communityLabel; // not currently rendered — header moved to TopBar

  const scopedCards = communitySlug ? await fetchBrowseCardsByCommunitySlug(communitySlug) : null;
  const cards = scopedCards && scopedCards.length > 0 ? scopedCards : await fetchBrowseCards();
  const isCommunityScoped = Boolean(scopedCards && scopedCards.length > 0);

  const items: ListingGridItem[] = cards.map((card) => {
    const src =
      card.mediaKind === 'video'
        ? thumbnailUrl(card.hero.cfVideoId)
        : (card.heroPhotoUrl as string);
    return {
      id: card.listing.id,
      href:
        card.mediaKind === 'video'
          ? `/browse/feed?${
              isCommunityScoped ? `community=${encodeURIComponent(communitySlug as string)}&` : ''
            }start=${encodeURIComponent(card.listing.id)}`
          : `/v/${card.agent.slug}/${card.listing.slug}`,
      coverUrl: src,
      price: card.listing.price,
      beds: card.listing.beds,
      baths: card.listing.baths,
      sqft: card.listing.sqft,
      address: card.listing.address,
      badge: null,
    };
  });

  return (
    <GridPageShell>
      <ListingGrid items={items} />
    </GridPageShell>
  );
}
