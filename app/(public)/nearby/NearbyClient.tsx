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
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [needsManual, setNeedsManual] = useState(false);

  // Step 0 — pull stored radius preference (set from /profile Preferences).
  useEffect(() => {
    setRadius(readStoredRadius());
  }, []);

  // Step 1 — try geolocation on mount.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNeedsManual(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setNeedsManual(true);
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

  function applyManual() {
    const la = Number(manualLat);
    const ln = Number(manualLng);
    if (
      !Number.isFinite(la) ||
      !Number.isFinite(ln) ||
      la < -90 ||
      la > 90 ||
      ln < -180 ||
      ln > 180
    ) {
      setError('Enter valid lat (-90..90) and lng (-180..180).');
      return;
    }
    setCoords({ lat: la, lng: ln });
    setNeedsManual(false);
  }

  // Manual fallback when geolocation is denied/unavailable.
  if (!coords && needsManual) {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <p className="mb-3 text-ink2">Couldn&apos;t read your location. Enter it manually:</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              placeholder="lat (e.g. 33.838)"
              className="rounded border border-line bg-bg px-2 py-1 text-ink"
            />
            <input
              type="text"
              inputMode="decimal"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              placeholder="lng (e.g. -84.378)"
              className="rounded border border-line bg-bg px-2 py-1 text-ink"
            />
          </div>
          <button
            type="button"
            onClick={applyManual}
            className="mt-3 rounded border border-line px-3 py-1 text-ink2 text-xs hover:border-line-strong hover:text-ink"
          >
            Apply
          </button>
          {error && <p className="mt-2 text-red-400 text-xs">{error}</p>}
        </div>
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
                  demoCoverFor(
                    card.listing.id,
                    card.mediaKind === 'video'
                      ? thumbnailUrl(card.hero.cfVideoId)
                      : (card.heroPhotoUrl as string),
                  ) as string
                }
                alt={card.listing.address}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                priority={idx < 4}
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              {typeof card.distance === 'number' && (
                <div className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-cream backdrop-blur-sm">
                  {card.distance.toFixed(1)} mi
                </div>
              )}
              <div className="absolute right-2 bottom-2 left-2 text-cream">
                <div className="font-serif text-lg leading-tight tracking-tight drop-shadow">
                  {formatPrice(card.listing.price)}
                </div>
                <div className="truncate text-cream/80 text-xs">{card.listing.address}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-cream/80">
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

function formatPrice(price: number | null): string {
  if (price == null) return 'Price on request';
  return `$${price.toLocaleString()}`;
}
