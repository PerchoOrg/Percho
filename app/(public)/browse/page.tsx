import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { DEMO_MEDIA_ENABLED, demoCoverFor } from '@/lib/demo-media';
import { fetchBrowseCards, fetchBrowseCardsByCommunitySlug } from '@/lib/feed/browse-cards';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

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
 * The page is now a single "For You" grid (always 2-up). The standalone
 * /nearby route still 308-redirects here.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>;
}) {
  const { community: communitySlug } = await searchParams;

  return (
    <main className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
      <BrowseHeader communitySlug={communitySlug ?? null} />
      <RecommendedGrid communitySlug={communitySlug ?? null} />
    </main>
  );
}

async function BrowseHeader({
  communitySlug,
}: {
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
      <div className="flex items-center justify-center px-4 py-3">
        <div className="text-ink2 text-[11px] tracking-[0.22em] uppercase">
          {communitySlug && communityLabel ? `Listings in ${communityLabel}` : 'For You'}
        </div>
      </div>
    </header>
  );
}

async function RecommendedGrid({ communitySlug }: { communitySlug: string | null }) {
  const scopedCards = communitySlug ? await fetchBrowseCardsByCommunitySlug(communitySlug) : null;
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
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-12">
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
              {(() => {
                const realSrc =
                  card.mediaKind === 'video'
                    ? thumbnailUrl(card.hero.cfVideoId)
                    : (card.heroPhotoUrl as string);
                const src = demoCoverFor(card.listing.id, realSrc) as string;
                const isDemoStock = DEMO_MEDIA_ENABLED && src !== realSrc;
                return (
                  <>
                    <Image
                      src={src}
                      alt={card.listing.address}
                      fill
                      sizes="(max-width: 640px) 50vw, 50vw"
                      priority={idx < 4}
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                    />
                    {isDemoStock && (
                      <span className="absolute top-2 right-2 bg-ink/85 px-1.5 py-0.5 text-[8px] tracking-[0.18em] text-surface uppercase backdrop-blur">
                        Stock
                      </span>
                    )}
                  </>
                );
              })()}
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
