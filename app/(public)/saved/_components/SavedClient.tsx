'use client';

/**
 * SavedClient — Phase 21 (2026-06-13), extended Phase 27.7 (2026-06-17),
 * Phase 43.4 (2026-06-20).
 *
 * Buyer Favorites surface (saves only).
 *
 * Phase 45.9 (2026-06-20): owner dropped the Likes mode + page header per
 * "Favorites only show saves, and its sub tab are listing and community"
 * — was a 2-row pill control, now a single Listings/Communities row.
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

export function SavedClient() {
  const [kind, setKind] = useState<Kind>('listings');
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
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-1 px-4 py-3">
        <PillButton
          active={kind === 'listings'}
          onClick={() => setKind('listings')}
          label="Listings"
          count={cards.length}
        />
        <PillButton
          active={kind === 'communities'}
          onClick={() => setKind('communities')}
          label="Communities"
          count={communities.length}
        />
      </div>

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

function PillButton({
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
        active ? 'bg-ink/15 text-ink' : 'text-ink2 hover:text-ink'
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
        icon={<Bookmark size={26} aria-hidden="true" />}
        title="No saved listings yet"
        body="Tap the bookmark while browsing to save a listing for later."
        ctaHref="/browse"
        ctaLabel="Start browsing"
      />
    );
  }
  return (
    <div className="mx-auto max-w-5xl px-2 py-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {cards.map((card, idx) => (
          <Link
            key={card.listing.id}
            href={
              card.mediaKind === 'video'
                ? `/browse/feed?start=${encodeURIComponent(card.listing.id)}`
                : `/v/${card.agent.slug}/${card.listing.slug}`
            }
            prefetch={false}
            className="group block overflow-hidden rounded-xl bg-bg ring-1 ring-line transition-shadow hover:ring-line-strong"
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
                sizes="50vw"
                priority={idx < 4}
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute right-2 bottom-2 left-2 text-cream">
                <div className="font-serif text-lg leading-tight tracking-tight drop-shadow">
                  {formatPrice(card.listing.price)}
                </div>
                <div className="truncate text-ink2 text-xs">{card.listing.address}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-ink2">
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
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {communities.map((c, idx) => (
          <Link
            key={c.id}
            href={`/c/${c.slug}/feed`}
            prefetch={false}
            className="group block overflow-hidden rounded-xl bg-bg ring-1 ring-line transition-shadow hover:ring-line-strong"
          >
            <div className="relative aspect-[9/16] w-full bg-black/40">
              {c.coverUrl ? (
                <Image
                  src={c.coverUrl}
                  alt={c.name}
                  fill
                  sizes="50vw"
                  priority={idx < 4}
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted">
                  <Bookmark size={32} aria-hidden="true" />
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              <div className="absolute right-2 bottom-2 left-2 text-cream">
                <div className="font-serif text-lg leading-tight tracking-tight drop-shadow">
                  {c.name}
                </div>
                <div className="text-ink2 text-xs">
                  {c.city ? `${c.city}, ${c.state}` : c.state}
                </div>
                <div className="text-[10px] text-ink2">
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
      <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-bg px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/10 text-ink">
          {icon}
        </span>
        <h2 className="mt-4 font-serif text-ink text-xl">{title}</h2>
        <p className="mt-2 max-w-sm text-ink2 text-sm">{body}</p>
        <div className="mt-6">
          <Link
            href={ctaHref}
            className="rounded-full bg-ink px-5 py-2 font-medium text-cream text-sm transition hover:opacity-90"
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
