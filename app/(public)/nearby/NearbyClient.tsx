'use client';

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { demoCoverFor } from '@/lib/demo-media';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface NearbyResponse {
  cards: BrowseCard[];
  center: { lat: number; lng: number };
  radius: number;
}

const RADIUS_DEFAULT = 10;
const RADIUS_STORAGE_KEY = 'vicinity:nearby_radius';

function readStoredRadius(): number {
  if (typeof window === 'undefined') return RADIUS_DEFAULT;
  const raw = window.localStorage.getItem(RADIUS_STORAGE_KEY);
  if (!raw) return RADIUS_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 100) return RADIUS_DEFAULT;
  return n;
}

export function NearbyClient() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(RADIUS_DEFAULT);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NearbyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  // Step 0 — pull stored radius preference (set from /profile Preferences).
  useEffect(() => {
    setRadius(readStoredRadius());
  }, []);

  // Step 1 — try geolocation on mount. If denied/unavailable, render empty
  // state (no manual lat/lng input — owner request 2026-06-21).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setGeoDenied(true);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, []);

  const fetchNearby = useCallback(async (c: { lat: number; lng: number }, r: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nearby?lat=${c.lat}&lng=${c.lng}&radius=${r}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `nearby returned ${res.status}`);
      }
      const json = (await res.json()) as NearbyResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed_to_fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!coords) return;
    fetchNearby(coords, radius);
  }, [coords, radius, fetchNearby]);

  // Geolocation denied / unavailable — show empty result with a one-line
  // explanation. No input boxes.
  if (!coords && geoDenied) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-ink2">
          Enable location access in your browser to see listings near you.
        </p>
      </div>
    );
  }

  if (!coords) {
    return <p className="px-6 py-12 text-center text-ink2 text-sm">Reading your location…</p>;
  }

  if (loading && !data) {
    return <p className="px-6 py-12 text-center text-ink2 text-sm">Searching nearby…</p>;
  }

  if (error) {
    return <p className="px-6 py-12 text-center text-red-400 text-sm">{error}</p>;
  }

  const cards = data?.cards ?? [];

  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-ink2">
          No listings within {data?.radius ?? radius} mi.{' '}
          <Link href="/profile" className="text-ink hover:underline">
            Adjust your search radius in Preferences
          </Link>{' '}
          or check back soon.
        </p>
      </div>
    );
  }

  // Phase 45.10 (2026-06-20): match /browse card style exactly — caption
  // BELOW the image (not overlaid), 3:4 frame, no ring, gallery gap.
  return (
    <div className="mx-auto max-w-6xl px-3 pb-6 sm:px-6">
      <div className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4 md:gap-x-5 md:gap-y-12">
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
                  demoCoverFor(
                    card.listing.id,
                    card.mediaKind === 'video'
                      ? thumbnailUrl(card.hero.cfVideoId)
                      : (card.heroPhotoUrl as string),
                  ) as string
                }
                alt={card.listing.address}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                priority={idx < 4}
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
              />
              {typeof card.distance === 'number' && (
                <div className="absolute top-2 left-2 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] text-surface backdrop-blur">
                  {card.distance.toFixed(1)} mi
                </div>
              )}
            </div>
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
