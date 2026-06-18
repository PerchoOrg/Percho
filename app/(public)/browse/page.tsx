import { thumbnailUrl } from '@/lib/cloudflare/stream';
import {
  fetchBrowseCards,
  fetchBrowseCardsByCommunitySlug,
} from '@/lib/feed/browse-cards';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { NearbyClient } from '../nearby/NearbyClient';

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
 * Phase 34b.1 (2026-06-17): the `?tab=communities` segmented control was
 * removed — it duplicated `/communities`. One way to do each thing.
 *
 * Phase 37 (2026-06-18): introduced Recommended / Nearby sub-tabs (Douyin
 * 推荐/同城 model). The standalone /nearby route now 308-redirects here
 * with `?tab=nearby`. Both sub-tabs render Pinterest-style grids that click
 * through into the same vertical swipe feed — consumption shape stays
 * uniform across sub-tabs.
 *
 * Sub-tab visibility rules:
 *   - Hidden when `?community=<slug>` is set: that mode is a community-
 *     scoped grid where "nearby" has no meaning (the grid is already
 *     location-anchored to the community).
 *   - Default tab is `recommended`. Unknown values fall back to recommended.
 */
type BrowseTab = 'recommended' | 'nearby';

function parseTab(raw: string | undefined): BrowseTab {
  return raw === 'nearby' ? 'nearby' : 'recommended';
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string; tab?: string }>;
}) {
  const { community: communitySlug, tab: rawTab } = await searchParams;
  const activeTab = parseTab(rawTab);

  const isCommunityScoped = Boolean(communitySlug);
  const showSubTabs = !isCommunityScoped;

  return (
    <main className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
      <BrowseHeader
        activeTab={activeTab}
        showSubTabs={showSubTabs}
        communitySlug={communitySlug ?? null}
      />

      {/* Sub-tab content. Nearby is a client component (geolocation).
       * Recommended (and community-scoped) is server-rendered. */}
      {showSubTabs && activeTab === 'nearby' ? (
        <NearbyClient />
      ) : (
        <RecommendedGrid communitySlug={communitySlug ?? null} />
      )}
    </main>
  );
}

async function BrowseHeader({
  activeTab,
  showSubTabs,
  communitySlug,
}: {
  activeTab: BrowseTab;
  showSubTabs: boolean;
  communitySlug: string | null;
}) {
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

  return (
    <header className="sticky top-0 z-20 border-line border-b bg-bg/85 backdrop-blur-md md:hidden">
      {communitySlug && communityLabel ? (
        <div className="flex items-center justify-center px-4 py-3">
          <div className="text-ink2 text-[11px] tracking-[0.22em] uppercase">
            {`Listings in ${communityLabel}`}
          </div>
        </div>
      ) : showSubTabs ? (
        <nav aria-label="Explore sub-nav" className="flex items-center justify-center gap-8 px-4 py-3">
          <SubTabLink href="/browse" label="Recommended" active={activeTab === 'recommended'} />
          <SubTabLink href="/browse?tab=nearby" label="Nearby" active={activeTab === 'nearby'} />
        </nav>
      ) : (
        <div className="flex items-center justify-center px-4 py-3">
          <div className="text-ink2 text-[11px] tracking-[0.22em] uppercase">Explore</div>
        </div>
      )}
    </header>
  );
}

function SubTabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      prefetch={false}
      className={`relative pb-1 text-[12px] tracking-[0.18em] uppercase transition-colors ${
        active ? 'text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-0.5 h-px bg-ink"
        />
      ) : null}
    </Link>
  );
}

async function RecommendedGrid({ communitySlug }: { communitySlug: string | null }) {
  const scopedCards = communitySlug
    ? await fetchBrowseCardsByCommunitySlug(communitySlug)
    : null;
  const cards = scopedCards && scopedCards.length > 0 ? scopedCards : await fetchBrowseCards();
  const isCommunityScoped = Boolean(scopedCards && scopedCards.length > 0);

  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-ink2">
          No listings yet. Check back soon — agents are uploading new tours.
        </p>
      </div>
    );
  }

  return (
    <div className={`mx-auto max-w-6xl px-3 sm:px-6 ${isCommunityScoped ? 'py-6' : 'pb-6'}`}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-12 md:grid-cols-3 lg:grid-cols-4">
        {cards.map((card, idx) => (
          <Link
            key={card.listing.id}
            href={
              card.mediaKind === 'video'
                ? `/browse/feed?${isCommunityScoped ? `community=${encodeURIComponent(communitySlug as string)}&` : ''}start=${encodeURIComponent(card.listing.id)}`
                : `/v/${card.agent.slug}/${card.listing.slug}`
            }
            prefetch={false}
            className="group block"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface">
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
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
              />
            </div>
            {/* Caption — Pixieset / gallery idiom: text BELOW image, not overlaid. */}
            <div className="pt-3">
              <div className="font-serif text-base text-ink leading-tight tracking-[-0.012em]">
                {formatPrice(card.listing.price)}
              </div>
              <div className="mt-1 truncate text-ink2 text-[12px]">{card.listing.address}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted tracking-wide">
                {card.listing.beds != null && <span>{card.listing.beds} bd</span>}
                {card.listing.baths != null && <span>· {card.listing.baths} ba</span>}
                {card.listing.sqft != null && (
                  <span>· {card.listing.sqft.toLocaleString()} sqft</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function formatPrice(price: number | null): string {
  if (price == null) return 'Price on request';
  return `$${price.toLocaleString()}`;
}
