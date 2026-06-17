import { thumbnailUrl } from '@/lib/cloudflare/stream';
import {
  fetchBrowseCards,
  fetchBrowseCardsByCommunitySlug,
} from '@/lib/feed/browse-cards';
import { fetchCommunityListCards } from '@/lib/communities/list';
import { CommunityGrid } from '@/app/_components/CommunityGrid';
import { BrowseTabs, type BrowseTab } from './_components/BrowseTabs';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Explore Listings · Vicinity',
  description: 'Explore homes for sale. Tap a listing to start a video tour.',
};

export const dynamic = 'force-dynamic';

/**
 * Browse — grid landing.
 *
 * Phase 9 (2026-06-12) pivot: instead of dropping the user straight into a
 * vertical swipe feed (which felt aggressive on first impression), we show
 * a Pinterest-style grid first. Tapping any card launches the swipe feed
 * starting at that listing — Xiaohongshu / Douyin "explore → detail" pattern.
 *
 * Phase 27.5 (2026-06-16): also accepts `?community=<slug>` to scope the
 * grid to active (published) listings inside a single community. Linked
 * from the "N active listings" badge on `/c/[slug]`. Unknown / empty slug
 * silently falls through to the global grid so the page is never empty.
 *
 * Phase 34b (2026-06-17): adds `?tab=communities` segmented control so
 * "active buyers" (browsing by area) can pick a community first instead
 * of starting from a single home. Communities view reuses the same grid
 * rendered on `/communities`.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string; tab?: string }>;
}) {
  const { community: communitySlug, tab: tabRaw } = await searchParams;
  const tab: BrowseTab = tabRaw === 'communities' ? 'communities' : 'homes';

  // Communities tab — early return; no listing fetches.
  if (tab === 'communities') {
    const communities = await fetchCommunityListCards();
    return (
      <main className="min-h-dvh bg-ink pb-20 text-cream md:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-center border-cream/10 border-b bg-ink/85 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="font-medium text-cream/80 text-sm uppercase tracking-wider">Explore</div>
        </header>
        <div className="mx-auto max-w-5xl px-2 py-4">
          <BrowseTabs active="communities" />
          <CommunityGrid communities={communities} />
        </div>
      </main>
    );
  }

  const scopedCards = communitySlug
    ? await fetchBrowseCardsByCommunitySlug(communitySlug)
    : null;
  const cards = scopedCards && scopedCards.length > 0 ? scopedCards : await fetchBrowseCards();
  const isCommunityScoped = Boolean(scopedCards && scopedCards.length > 0);

  // Resolve the community name for the header label when scoped.
  let communityLabel: string | null = null;
  if (isCommunityScoped && communitySlug) {
    const supabase = await createClient();
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    const { data } = (await (supabase as any)
      .from('communities')
      .select('name')
      .eq('slug', communitySlug)
      .maybeSingle()) as { data: { name: string } | null };
    communityLabel = data?.name ?? null;
  }

  return (
    <main className="min-h-dvh bg-ink pb-20 text-cream md:pb-0">
      <header className="sticky top-0 z-20 flex items-center justify-center border-cream/10 border-b bg-ink/85 px-4 py-3 backdrop-blur-md md:hidden">
        <div className="font-medium text-cream/80 text-sm uppercase tracking-wider">
          {isCommunityScoped && communityLabel ? `Listings in ${communityLabel}` : 'Explore'}
        </div>
      </header>

      {/* Segmented tabs — only on the global Explore (not when scoped to a single community). */}
      {!isCommunityScoped && (
        <div className="mx-auto max-w-5xl px-2 pt-4">
          <BrowseTabs active="homes" />
        </div>
      )}

      {cards.length === 0 ? (
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <p className="text-cream/80">
            No listings yet. Check back soon — agents are uploading new tours.
          </p>
        </div>
      ) : (
        <div className={`mx-auto max-w-5xl px-2 ${isCommunityScoped ? 'py-4' : 'pb-4'}`}>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
            {cards.map((card, idx) => (
              <Link
                key={card.listing.id}
                href={
                  card.mediaKind === 'video'
                    ? `/browse/feed?${isCommunityScoped ? `community=${encodeURIComponent(communitySlug as string)}&` : ''}start=${encodeURIComponent(card.listing.id)}`
                    : `/v/${card.agent.slug}/${card.listing.slug}`
                }
                prefetch={false}
                className="group block overflow-hidden rounded-xl bg-ink/60 ring-1 ring-cream/10 transition-shadow hover:ring-gold/60"
              >
                <div className="relative aspect-[3/4] w-full bg-black/40">
                  {/* Cover thumbnail — Cloudflare Stream poster (video) or
                   * Supabase Storage public URL (photo-only listing).
                   * Lazy-loaded by next/image; first 4 are eager so the LCP
                   * card paints fast on mobile. */}
                  <Image
                    src={
                      card.mediaKind === 'video'
                        ? thumbnailUrl(card.hero.cfVideoId)
                        : (card.heroPhotoUrl as string)
                    }
                    alt={card.listing.address}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    priority={idx < 4}
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute right-2 bottom-2 left-2 text-cream">
                    <div className="font-serif text-lg leading-tight tracking-tight drop-shadow">
                      {formatPrice(card.listing.price)}
                    </div>
                    <div className="truncate text-cream/85 text-xs">{card.listing.address}</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-cream/70">
                      {card.listing.beds != null && <span>{card.listing.beds} bd</span>}
                      {card.listing.baths != null && <span>· {card.listing.baths} ba</span>}
                      {card.listing.sqft != null && (
                        <span>· {card.listing.sqft.toLocaleString()} sqft</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function formatPrice(price: number | null): string {
  if (price == null) return 'Price on request';
  return `$${price.toLocaleString()}`;
}
