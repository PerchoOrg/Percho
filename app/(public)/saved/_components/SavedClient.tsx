'use client';

/**
 * SavedClient — Phase 21 (2026-06-13), extended Phase 27.7 (2026-06-17).
 *
 * Reads device_id from localStorage and renders the buyer's saves in
 * two tabs: Listings (the original /browse-style grid) and
 * Communities (a 9:16 cover grid that links into each community's
 * swipe feed). Pure client component — device_id lives in browser
 * storage, no SSR data.
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { Bookmark, Heart } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchSavedCardsAction, fetchSavedCommunitiesAction, type SavedCommunityCard } from '../_actions';

type Tab = 'listings' | 'communities';

export function SavedClient() {
  const [tab, setTab] = useState<Tab>('listings');
  const [cards, setCards] = useState<BrowseCard[] | null>(null);
  const [communities, setCommunities] = useState<SavedCommunityCard[] | null>(null);

  useEffect(() => {
    void (async () => {
      const deviceId = getOrCreateDeviceId();
      try {
        const [c, cc] = await Promise.all([
          fetchSavedCardsAction({ deviceId }),
          fetchSavedCommunitiesAction({ deviceId }),
        ]);
        setCards(c);
        setCommunities(cc);
      } catch (err) {
        console.error('[SavedClient] fetch failed', err);
        setCards([]);
        setCommunities([]);
      }
    })();
  }, []);

  const loading = cards === null || communities === null;

  return (
    <main className="min-h-dvh bg-ink pb-20 text-cream md:pb-0">
      <header className="sticky top-0 z-20 border-cream/10 border-b bg-ink/85 backdrop-blur-md">
        <div className="flex items-center justify-center px-4 py-3 md:hidden">
          <div className="font-medium text-cream/80 text-sm uppercase tracking-wider">Saved</div>
        </div>
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 pb-2 md:pt-3">
          <TabButton
            active={tab === 'listings'}
            onClick={() => setTab('listings')}
            label="Listings"
            count={cards?.length}
          />
          <TabButton
            active={tab === 'communities'}
            onClick={() => setTab('communities')}
            label="Communities"
            count={communities?.length}
          />
        </div>
      </header>

      {loading ? (
        <div className="mx-auto max-w-md px-6 py-24 text-center text-cream/50">Loading…</div>
      ) : tab === 'listings' ? (
        <ListingsView cards={cards ?? []} />
      ) : (
        <CommunitiesView communities={communities ?? []} />
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-full px-4 py-1.5 font-medium text-sm transition ${
        active ? 'bg-gold/15 text-gold' : 'text-cream/60 hover:text-cream'
      }`}
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="ml-1.5 text-xs tabular-nums opacity-70">{count}</span>
      )}
    </button>
  );
}

function ListingsView({ cards }: { cards: BrowseCard[] }) {
  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<Heart size={26} aria-hidden="true" />}
        title="No saved listings yet"
        body="Tap the bookmark while browsing to save a listing for later."
        ctaHref="/browse"
        ctaLabel="Start browsing"
      />
    );
  }
  return (
    <div className="mx-auto max-w-5xl px-2 py-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
        {cards.map((card, idx) => (
          <Link
            key={card.listing.id}
            href={
              card.mediaKind === 'video'
                ? `/browse/feed?start=${encodeURIComponent(card.listing.id)}`
                : `/v/${card.agent.slug}/${card.listing.slug}`
            }
            prefetch={false}
            className="group block overflow-hidden rounded-xl bg-ink/60 ring-1 ring-cream/10 transition-shadow hover:ring-gold/60"
          >
            <div className="relative aspect-[3/4] w-full bg-black/40">
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
  );
}

function CommunitiesView({ communities }: { communities: SavedCommunityCard[] }) {
  if (communities.length === 0) {
    return (
      <EmptyState
        icon={<Bookmark size={26} aria-hidden="true" />}
        title="No saved communities yet"
        body="Tap the bookmark on any community's swipe feed to save the neighborhood — schools, walks, food."
        ctaHref="/communities"
        ctaLabel="Browse communities"
      />
    );
  }
  return (
    <div className="mx-auto max-w-5xl px-2 py-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
        {communities.map((c, idx) => (
          <Link
            key={c.id}
            href={`/c/${c.slug}/feed`}
            prefetch={false}
            className="group block overflow-hidden rounded-xl bg-ink/60 ring-1 ring-cream/10 transition-shadow hover:ring-gold/60"
          >
            <div className="relative aspect-[9/16] w-full bg-black/40">
              {c.coverCfVideoId ? (
                <Image
                  src={thumbnailUrl(c.coverCfVideoId)}
                  alt={c.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  priority={idx < 4}
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-cream/30">
                  <Bookmark size={32} aria-hidden="true" />
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              <div className="absolute right-2 bottom-2 left-2 text-cream">
                <div className="font-serif text-lg leading-tight tracking-tight drop-shadow">
                  {c.name}
                </div>
                <div className="text-cream/80 text-xs">
                  {c.city ? `${c.city}, ${c.state}` : c.state}
                </div>
                <div className="text-[10px] text-cream/70">
                  {c.videoCount} {c.videoCount === 1 ? 'video' : 'videos'}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="mx-auto min-h-[60vh] max-w-2xl px-5 pt-10 pb-24 md:pb-10">
      <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-cream/10 bg-ink/40 px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold">
          {icon}
        </span>
        <h2 className="mt-4 font-serif text-cream text-xl">{title}</h2>
        <p className="mt-2 max-w-sm text-cream/60 text-sm">{body}</p>
        <div className="mt-6">
          <Link
            href={ctaHref}
            className="rounded-full bg-gold px-5 py-2 font-medium text-ink text-sm transition hover:opacity-90"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

function formatPrice(price: number | null): string {
  if (price == null) return 'Price on request';
  return `$${price.toLocaleString()}`;
}
