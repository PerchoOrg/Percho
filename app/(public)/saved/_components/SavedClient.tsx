'use client';

/**
 * SavedClient — Phase 21 (2026-06-13).
 *
 * Reads device_id from localStorage and renders a /browse-style grid of
 * saved listings. Pure client component (no SSR data fetch) because
 * device_id lives in browser storage. Loading + empty + populated
 * states all in-line.
 */

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { getOrCreateDeviceId } from '@/lib/buyer/device-id';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { Heart } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchSavedCardsAction } from '../_actions';

export function SavedClient() {
  const [cards, setCards] = useState<BrowseCard[] | null>(null);

  useEffect(() => {
    void (async () => {
      const deviceId = getOrCreateDeviceId();
      try {
        const c = await fetchSavedCardsAction({ deviceId });
        setCards(c);
      } catch (err) {
        console.error('[SavedClient] fetch failed', err);
        setCards([]);
      }
    })();
  }, []);

  if (cards === null) {
    return (
      <main className="min-h-dvh bg-ink pb-20 text-cream md:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-center border-cream/10 border-b bg-ink/85 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="font-medium text-cream/80 text-sm uppercase tracking-wider">Saved</div>
        </header>
        <div className="mx-auto max-w-md px-6 py-24 text-center text-cream/50">Loading…</div>
      </main>
    );
  }

  if (cards.length === 0) {
    return (
      <main className="mx-auto min-h-[80vh] max-w-2xl px-5 pt-10 pb-24 md:pb-10">
        <h1 className="font-serif text-3xl text-cream">Saved</h1>
        <p className="mt-2 text-cream/60 text-sm">Listings you save while browsing show up here.</p>
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-cream/10 bg-ink/40 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold">
            <Heart size={26} aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-serif text-cream text-xl">No saved listings yet</h2>
          <p className="mt-2 max-w-sm text-cream/60 text-sm">
            Tap the bookmark while browsing to save a listing for later.
          </p>
          <div className="mt-6">
            <Link
              href="/browse"
              className="rounded-full bg-gold px-5 py-2 font-medium text-ink text-sm transition hover:opacity-90"
            >
              Start browsing
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-ink pb-20 text-cream md:pb-0">
      <header className="sticky top-0 z-20 flex items-center justify-center border-cream/10 border-b bg-ink/85 px-4 py-3 backdrop-blur-md md:hidden">
        <div className="font-medium text-cream/80 text-sm uppercase tracking-wider">Saved</div>
      </header>

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
    </main>
  );
}

function formatPrice(price: number | null): string {
  if (price == null) return 'Price on request';
  return `$${price.toLocaleString()}`;
}
