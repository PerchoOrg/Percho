'use client';

/**
 * SavedClient — Phase 21 (2026-06-13), extended Phase 27.7 (2026-06-17),
 * Phase 43.4 (2026-06-20).
 *
 * Buyer Favorites surface. Two orthogonal axes:
 *   - mode: Saves (bookmark) vs Likes (heart reaction)
 *   - kind: Listings vs Communities
 *
 * Renders a 2-row pill control (top: Saves/Likes, bottom: Listings/
 * Communities) and a single grid driven by the active (mode, kind).
 * device_id lives in browser storage — pure client component.
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { Bookmark, Heart } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  fetchLikedCardsAction,
  fetchLikedCommunitiesAction,
  fetchSavedCardsAction,
  fetchSavedCommunitiesAction,
  type SavedCommunityCard,
} from '../_actions';

type Mode = 'saves' | 'likes';
type Kind = 'listings' | 'communities';

type Bucket = {
  savesListings: BrowseCard[] | null;
  savesCommunities: SavedCommunityCard[] | null;
  likesListings: BrowseCard[] | null;
  likesCommunities: SavedCommunityCard[] | null;
};

export function SavedClient() {
  const [mode, setMode] = useState<Mode>('saves');
  const [kind, setKind] = useState<Kind>('listings');
  const [data, setData] = useState<Bucket>({
    savesListings: null,
    savesCommunities: null,
    likesListings: null,
    likesCommunities: null,
  });

  useEffect(() => {
    void (async () => {
      const deviceId = getOrCreateDeviceId();
      try {
        const [sl, sc, ll, lc] = await Promise.all([
          fetchSavedCardsAction({ deviceId }),
          fetchSavedCommunitiesAction({ deviceId }),
          fetchLikedCardsAction({ deviceId }),
          fetchLikedCommunitiesAction({ deviceId }),
        ]);
        setData({
          savesListings: sl,
          savesCommunities: sc,
          likesListings: ll,
          likesCommunities: lc,
        });
      } catch (err) {
        console.error('[SavedClient] fetch failed', err);
        setData({
          savesListings: [],
          savesCommunities: [],
          likesListings: [],
          likesCommunities: [],
        });
      }
    })();
  }, []);

  const loading =
    data.savesListings === null ||
    data.savesCommunities === null ||
    data.likesListings === null ||
    data.likesCommunities === null;

  const cards =
    mode === 'saves' ? data.savesListings ?? [] : data.likesListings ?? [];
  const communities =
    mode === 'saves'
      ? data.savesCommunities ?? []
      : data.likesCommunities ?? [];

  return (
    <main className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
      <header className="sticky top-0 z-20 border-line border-b bg-bg backdrop-blur-md">
        <div className="flex items-center justify-center px-4 py-3 md:hidden">
          <div className="font-medium text-ink2 text-sm uppercase tracking-wider">
            Favorites
          </div>
        </div>
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 pb-2 md:pt-3">
          <div className="flex items-center gap-1">
            <PillButton active={mode === 'saves'} onClick={() => setMode('saves')} label="Saves" />
            <PillButton active={mode === 'likes'} onClick={() => setMode('likes')} label="Likes" />
          </div>
          <div className="flex items-center gap-1">
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
        </div>
      </header>

      {loading ? (
        <div className="mx-auto max-w-md px-6 py-24 text-center text-muted">Loading…</div>
      ) : kind === 'listings' ? (
        <ListingsView cards={cards} mode={mode} />
      ) : (
        <CommunitiesView communities={communities} mode={mode} />
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

function ListingsView({ cards, mode }: { cards: BrowseCard[]; mode: Mode }) {
  if (cards.length === 0) {
    return mode === 'saves' ? (
      <EmptyState
        icon={<Bookmark size={26} aria-hidden="true" />}
        title="No saved listings yet"
        body="Tap the bookmark while browsing to save a listing for later."
        ctaHref="/browse"
        ctaLabel="Start browsing"
      />
    ) : (
      <EmptyState
        icon={<Heart size={26} aria-hidden="true" />}
        title="No liked listings yet"
        body="Tap the heart while browsing to react to a listing."
        ctaHref="/browse"
        ctaLabel="Start browsing"
      />
    );
  }
  return (
    <div className="mx-auto max-w-5xl px-2 py-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
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

function CommunitiesView({
  communities,
  mode,
}: {
  communities: SavedCommunityCard[];
  mode: Mode;
}) {
  if (communities.length === 0) {
    return mode === 'saves' ? (
      <EmptyState
        icon={<Bookmark size={26} aria-hidden="true" />}
        title="No saved communities yet"
        body="Tap the bookmark on any community's swipe feed to save the neighborhood — schools, walks, food."
        ctaHref="/communities"
        ctaLabel="Browse communities"
      />
    ) : (
      <EmptyState
        icon={<Heart size={26} aria-hidden="true" />}
        title="No liked communities yet"
        body="Tap the heart on any community's swipe feed to react."
        ctaHref="/communities"
        ctaLabel="Browse communities"
      />
    );
  }
  return (
    <div className="mx-auto max-w-5xl px-2 py-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
