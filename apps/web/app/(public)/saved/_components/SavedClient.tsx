'use client';

/**
 * SavedClient — (2026-06-13), extended / 43.4 / 45.9.
 *
 * Buyer Favorites surface (saves only).
 *
 * owner round 3 — the Listings / Communities pill
 * row was lifted out of this client and into the global TopBar as the page's
 * sub-tabs. SavedClient now takes a `kind` prop driven by the route segment
 * (/saved → listings, /saved/communities → communities). When the bucket is
 * empty we render a centered call-to-action (Explore listings · Explore
 * communities) without the "Tap the bookmark…" hint.
 *
 * grid refactored to share GridPageShell +
 * ListingGrid + GridCard primitives so this surface stays visually
 * identical to /browse, /communities, /dashboard, /dashboard/communities.
 * No more inline grid/card markup.
 *
 * Saves live on the account (phase311); signed out, the page is the sign-in
 * prompt the iOS Saved tab shows.
 */

import { GridCard, GridCardCaption } from '@/app/_components/GridCard';
import { GridFrame } from '@/app/_components/GridFrame';
import { GridPageShell } from '@/app/_components/GridPageShell';
import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
import { loginHref } from '@/lib/auth/login-href';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import type { BrowseCard } from '@/lib/feed/browse-card';
import { linkForCard } from '@/lib/feed/link-for-card';
import { BUYER_HOME, LISTINGS_ON_WEB } from '@/lib/listings/listings-on-web';
import { COMMUNITY_COMPARE_MAX, COMMUNITY_COMPARE_MIN } from '@percho/shared/community-compare';
import { Bookmark, Check } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  type SavedCommunityCard,
  fetchSavedCardsAction,
  fetchSavedCommunitiesAction,
} from '../_actions';

type Kind = 'listings' | 'communities';

type Bucket =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'ready'; savesListings: BrowseCard[]; savesCommunities: SavedCommunityCard[] };

export function SavedClient({ kind }: { kind: Kind }) {
  const [data, setData] = useState<Bucket>({ status: 'loading' });

  useEffect(() => {
    void (async () => {
      try {
        const [sl, sc] = await Promise.all([
          fetchSavedCardsAction(),
          fetchSavedCommunitiesAction(),
        ]);
        // Saves live on the account (phase311): signed out, there is nothing
        // to show but the way in.
        if (sl === null || sc === null) {
          setData({ status: 'signed_out' });
          return;
        }
        setData({ status: 'ready', savesListings: sl, savesCommunities: sc });
      } catch (err) {
        console.error('[SavedClient] fetch failed', err);
        setData({ status: 'ready', savesListings: [], savesCommunities: [] });
      }
    })();
  }, []);

  return (
    <main className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
      {data.status === 'loading' ? (
        <div className="mx-auto max-w-md px-6 py-24 text-center text-muted">Loading…</div>
      ) : data.status === 'signed_out' ? (
        <SignedOut />
      ) : kind === 'listings' ? (
        <ListingsView cards={data.savesListings} />
      ) : (
        <CommunitiesView communities={data.savesCommunities} />
      )}
    </main>
  );
}

/** Signed out — the same prompt the iOS Saved tab shows. */
function SignedOut() {
  return (
    <div className="mx-auto min-h-[60vh] max-w-2xl px-5 pt-10 pb-24 md:pb-10">
      <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-bg px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/10 text-ink">
          <Bookmark size={26} aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-serif text-ink text-xl">
          Sign in to keep the neighborhoods you like
        </h2>
        <p className="mt-2 text-ink2 text-sm">
          Your saves follow your account, on the web and in the app.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-center">
          <Link
            href={loginHref('/saved')}
            className="rounded-full bg-ink px-5 py-2 font-medium text-surface text-sm transition hover:opacity-90"
          >
            Sign in
          </Link>
          <Link
            href={BUYER_HOME}
            className="rounded-full border border-line-strong px-5 py-2 font-medium text-ink text-sm transition hover:bg-surface/30"
          >
            Explore neighborhoods
          </Link>
        </div>
      </div>
    </div>
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
          {LISTINGS_ON_WEB ? (
            <Link
              href="/browse"
              className="rounded-full bg-ink px-5 py-2 font-medium text-surface text-sm transition hover:opacity-90"
            >
              Explore listing
            </Link>
          ) : null}
          <Link
            href="/communities"
            className="rounded-full border border-line-strong px-5 py-2 font-medium text-ink text-sm transition hover:bg-surface/30"
          >
            Explore neighborhood
          </Link>
        </div>
      </div>
    </div>
  );
}

function ListingsView({ cards }: { cards: BrowseCard[] }) {
  if (cards.length === 0) return <FavoritesEmpty />;
  const items: ListingGridItem[] = cards.map((card) => ({
    id: card.listing.id,
    href:
      card.mediaKind === 'video'
        ? `/browse/feed?start=${encodeURIComponent(card.listing.id)}`
        : linkForCard(card),
    coverUrl:
      // agent's cover_url wins over the mediaKind-derived hero.
      card.gridCoverUrl ??
      (card.mediaKind === 'video'
        ? thumbnailUrl(card.hero.cfVideoId)
        : (card.heroPhotoUrl ?? null)),
    price: card.listing.price,
    beds: card.listing.beds,
    baths: card.listing.baths,
    sqft: card.listing.sqft,
    address: card.listing.address,
    city: card.listing.city,
    state: card.listing.state,
    zip: card.listing.zip,
    mlsNumber: card.listing.mlsNumber ?? null,
  }));
  return (
    <GridPageShell>
      <ListingGrid items={items} />
    </GridPageShell>
  );
}

/**
 * Saved neighbourhoods, and the way into Compare (phase311) — the same flow
 * as the iOS Saved tab: pick 2–5, then compare them side by side.
 */
function CommunitiesView({ communities }: { communities: SavedCommunityCard[] }) {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  if (communities.length === 0) return <FavoritesEmpty />;

  const canCompare =
    picked.length >= COMMUNITY_COMPARE_MIN && picked.length <= COMMUNITY_COMPARE_MAX;
  const togglePick = (id: string) =>
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : p.length < COMMUNITY_COMPARE_MAX
          ? [...p, id]
          : p,
    );
  const stopSelecting = () => {
    setSelecting(false);
    setPicked([]);
  };

  return (
    <GridPageShell>
      {communities.length >= COMMUNITY_COMPARE_MIN ? (
        <div className="flex items-center justify-between gap-3 px-1 pt-4 pb-3">
          <p className="text-ink2 text-sm">
            {selecting
              ? `Pick ${COMMUNITY_COMPARE_MIN}–${COMMUNITY_COMPARE_MAX} to compare · ${picked.length} picked`
              : 'Saved neighborhoods'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {selecting ? (
              <>
                <button
                  type="button"
                  onClick={stopSelecting}
                  className="rounded-full px-3 py-1.5 text-ink2 text-sm hover:text-ink"
                >
                  Cancel
                </button>
                {canCompare ? (
                  <Link
                    href={`/compare?ids=${picked.join(',')}`}
                    className="rounded-full bg-ink px-4 py-1.5 font-medium text-sm text-surface"
                  >
                    Compare {picked.length}
                  </Link>
                ) : (
                  <span className="rounded-full bg-ink/30 px-4 py-1.5 font-medium text-sm text-surface">
                    Compare
                  </span>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="rounded-full border border-line-strong px-4 py-1.5 font-medium text-ink text-sm hover:bg-surface"
              >
                Compare
              </button>
            )}
          </div>
        </div>
      ) : null}
      <GridFrame>
        {communities.map((c) => {
          const isPicked = picked.includes(c.id);
          return (
            <div key={c.id} className="relative">
              <GridCard
                href={`/c/${c.slug}`}
                coverUrl={c.coverUrl}
                alt={c.name}
                dimmed={selecting && !isPicked}
                fallback={
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink2/20 to-ink">
                    <span className="font-semibold text-3xl text-surface/70">
                      {c.name.charAt(0)}
                    </span>
                  </div>
                }
                topRight={
                  selecting ? (
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface ${isPicked ? 'bg-ink' : 'bg-black/20'}`}
                    >
                      {isPicked ? (
                        <Check size={14} className="text-surface" aria-hidden="true" />
                      ) : null}
                    </span>
                  ) : undefined
                }
                caption={
                  <GridCardCaption
                    title={c.name}
                    sub={c.city ? `${c.city}, ${c.state}` : c.state}
                  />
                }
              />
              {/* In select mode a tap picks the card instead of opening it. */}
              {selecting ? (
                <button
                  type="button"
                  aria-pressed={isPicked}
                  aria-label={`${isPicked ? 'Unpick' : 'Pick'} ${c.name}`}
                  onClick={() => togglePick(c.id)}
                  className="absolute inset-0 z-10 cursor-pointer"
                />
              ) : null}
            </div>
          );
        })}
      </GridFrame>
    </GridPageShell>
  );
}
