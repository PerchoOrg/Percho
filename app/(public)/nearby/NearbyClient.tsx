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
const GEO_PROMPTED_KEY = 'vicinity:nearby_geo_prompted';

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
  // Phase 45.27 (2026-06-21): first-visit soft prompt before triggering the
  // browser's native geolocation permission UI. Without this users see a bare
  // "allow location?" dialog with no context and reflexively deny.
  const [showSoftPrompt, setShowSoftPrompt] = useState(false);

  // Step 0 — pull stored radius preference (set from /profile Preferences).
  useEffect(() => {
    setRadius(readStoredRadius());
  }, []);

  const requestGeolocation = useCallback(() => {
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

  // Step 1 — on mount, decide whether to show the soft prompt or go straight
  // to the geolocation call. Skip the soft prompt if the user has already
  // been asked once (regardless of allow/deny — the browser will remember).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const alreadyPrompted = window.localStorage.getItem(GEO_PROMPTED_KEY) === '1';
    if (alreadyPrompted) {
      requestGeolocation();
    } else {
      setShowSoftPrompt(true);
    }
  }, [requestGeolocation]);

  const handleEnableLocation = useCallback(() => {
    window.localStorage.setItem(GEO_PROMPTED_KEY, '1');
    setShowSoftPrompt(false);
    requestGeolocation();
  }, [requestGeolocation]);

  const handleDismissPrompt = useCallback(() => {
    window.localStorage.setItem(GEO_PROMPTED_KEY, '1');
    setShowSoftPrompt(false);
    setGeoDenied(true);
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

  // Soft prompt — first visit, before native permission UI fires.
  if (showSoftPrompt) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nearby-geo-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 backdrop-blur-sm"
      >
        <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
          <div className="mb-3 text-3xl" aria-hidden>📍</div>
          <h2 id="nearby-geo-title" className="font-serif text-xl text-ink">
            See homes near you
          </h2>
          <p className="mt-2 text-ink2 text-sm leading-relaxed">
            Vicinity uses your location to show listings within your search radius.
            Your location stays on your device — we only use it to filter what you see.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleEnableLocation}
              className="w-full rounded-full bg-ink px-4 py-2.5 text-surface text-sm font-medium transition hover:opacity-90"
            >
              Enable location
            </button>
            <button
              type="button"
              onClick={handleDismissPrompt}
              className="w-full rounded-full px-4 py-2.5 text-ink2 text-sm transition hover:text-ink"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

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

function formatPrice(price: number | null): string {
  if (price == null) return 'Price on request';
  return `$${price.toLocaleString()}`;
}
