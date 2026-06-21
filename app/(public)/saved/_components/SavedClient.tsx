'use client';

/**
 * SavedClient — Phase 21 (2026-06-13), extended Phase 27.7 / 43.4 / 45.9.
 *
 * Buyer Favorites surface (saves only).
 *
 * Phase 45.11 (2026-06-20): owner round 3 — the Listings / Communities pill
 * row was lifted out of this client and into the global TopBar as the page's
 * sub-tabs. SavedClient now takes a `kind` prop driven by the route segment
 * (/saved → listings, /saved/communities → communities). When the bucket is
 * empty we render a centered call-to-action (Explore listings · Explore
 * communities) without the "Tap the bookmark…" hint.
 *
 * device_id lives in browser storage — pure client component.
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { Bookmark } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  type SavedCommunityCard,
  fetchSavedCardsAction,
  fetchSavedCommunitiesAction,
} from '../_actions';

type Kind = 'listings' | 'communities';

type Bucket = {
  savesListings: BrowseCard[] | null;
  savesCommunities: SavedCommunityCard[] | null;
};

export function SavedClient({ kind }: { kind: Kind }) {
  const [data, setData] = useState<Bucket>({
    savesListings: null,
    savesCommunities: null,
  });

  useEffect(() => {
    void (async () => {
      const deviceId = getOrCreateDeviceId();
      try {
        const [sl, sc] = await Promise.all([
          fetchSavedCardsAction({ deviceId }),
          fetchSavedCommunitiesAction({ deviceId }),
        ]);
        setData({ savesListings: sl, savesCommunities: sc });
      } catch (err) {
        console.error('[SavedClient] fetch failed', err);
        setData({ savesListings: [], savesCommunities: [] });
      }
    })();
  }, []);

  const loading = data.savesListings === null || data.savesCommunities === null;
  const cards = data.savesListings ?? [];
  const communities = data.savesCommunities ?? [];

  return (
    <main className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
      {loading ? (
        <div className="mx-auto max-w-md px-6 py-24 text-center text-muted">Loading…</div>
      ) : kind === 'listings' ? (
        <ListingsView cards={cards} />
      ) : (
        <CommunitiesView communities={communities} />
      )}
    </main>
  );
}

function FavoritesEmpty() {
  return (
    <div className="mx-auto min-h-[60vh] max-w-2xl px-5 pt-10 pb-24 md:pb-10">
      <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-bg px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/10 text-ink">
          <Bookmark size={26} aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-serif text-ink text-xl">Nothing saved yet</h2>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-center">
          <Link
            href="/browse"
            className="rounded-full bg-ink px-5 py-2 font-medium text-cream text-sm transition hover:opacity-90"
          >
            Explore listing
          </Link>
          <Link
            href="/communities"
            className="rounded-full border border-line-strong px-5 py-2 font-medium text-ink text-sm transition hover:bg-surface/30"
          >
            Explore community
          </Link>
        </div>
      </div>
    </div>
  );
}

function ListingsView({ cards }: { cards: BrowseCard[] }) {
  if (cards.length === 0) return <FavoritesEmpty />;
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-4">
      {/* Phase 45.26 (2026-06-21): TikTok-density grid — overlay variant D. */}
      <div className="grid grid-cols-2 gap-x-1 gap-y-2 md:grid-cols-4 md:gap-x-1.5 md:gap-y-3">
        {cards.map((card, idx) => (
          <Link
            key={card.listing.id}
            href={
              card.mediaKind === 'video'
                ? `/browse/feed?start=${encodeURIComponent(card.listing.id)}`
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
                sizes="(max-width: 640px) 50vw, 25vw"
                priority={idx < 4}
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              <div className="absolute inset-x-2 bottom-2 text-surface">
                <div className="font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]">
                  {formatPrice(card.listing.price)}
                </div>
                <div className="mt-0.5 truncate text-[11px] opacity-95 tracking-wide">
                  {[
                    card.listing.beds != null ? `${card.listing.beds} bd` : null,
                    card.listing.baths != null ? `${card.listing.baths} ba` : null,
                    card.listing.sqft != null ? `${card.listing.sqft.toLocaleString()} sqft` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                <div className="mt-px truncate text-[11px] opacity-80">{card.listing.address}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CommunitiesView({ communities }: { communities: SavedCommunityCard[] }) {
  if (communities.length === 0) return <FavoritesEmpty />;
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-4">
      {/* Phase 45.26 (2026-06-21): TikTok-density grid — overlay variant D. */}
      <div className="grid grid-cols-2 gap-x-1 gap-y-2 md:grid-cols-4 md:gap-x-1.5 md:gap-y-3">
        {communities.map((c, idx) => (
          <Link
            key={c.id}
            href={`/c/${c.slug}/feed`}
            prefetch={false}
            className="group block"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface">
              {c.coverUrl ? (
                <Image
                  src={c.coverUrl}
                  alt={c.name}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  priority={idx < 4}
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bronze/20 to-ink">
                  <span className="font-semibold text-3xl text-cream/70">{c.name.charAt(0)}</span>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              <div className="absolute inset-x-2 bottom-2 text-surface">
                <div className="truncate font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]">
                  {c.name}
                </div>
                <div className="mt-0.5 truncate text-[11px] opacity-90">
                  {c.city ? `${c.city}, ${c.state}` : c.state}
                </div>
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
