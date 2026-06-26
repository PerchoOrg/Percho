'use client';

import type { BrowseCard } from '@/app/(public)/browse/_components/BrowseFeed';
import { GridPageShell } from '@/app/_components/GridPageShell';
import { ListingGrid, type ListingGridItem } from '@/app/_components/ListingGrid';
import { thumbnailUrl } from '@/lib/cloudflare/stream';
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
  const [geoError, setGeoError] = useState<string | null>(null);
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
      setGeoError('unsupported');
      setGeoDenied(true);
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        const reason =
          err.code === 1
            ? 'denied'
            : err.code === 2
              ? 'unavailable'
              : err.code === 3
                ? 'timeout'
                : 'unknown';
        setGeoError(reason);
        setGeoDenied(true);
      },
      // Phase 45.27.1 (2026-06-21): 8s was too tight — users were timing out
      // mid native-prompt. Bump to 30s and don't require high accuracy.
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 60_000 },
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

  const handleRetryGeolocation = useCallback(() => {
    setGeoDenied(false);
    setGeoError(null);
    requestGeolocation();
  }, [requestGeolocation]);

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
          <div className="mb-3 text-3xl" aria-hidden>
            📍
          </div>
          <h2 id="nearby-geo-title" className="font-serif text-xl text-ink">
            See homes near you
          </h2>
          <p className="mt-2 text-ink2 text-sm leading-relaxed">
            Vicinity uses your location to show listings within your search radius. Your location
            stays on your device — we only use it to filter what you see.
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

  // Geolocation denied / unavailable — show empty result with the reason
  // (helps diagnose: was it a hard browser deny, a timeout, or unavailable?)
  // and a Try again button that re-fires the geolocation call.
  if (!coords && geoDenied) {
    const message =
      geoError === 'denied'
        ? 'Location access is blocked for this site. Open your browser site settings (lock icon in the URL bar → Location → Allow), then try again.'
        : geoError === 'timeout'
          ? "We didn't get a location response in time."
          : geoError === 'unavailable'
            ? "Your device couldn't determine its location."
            : geoError === 'unsupported'
              ? "This browser doesn't support location."
              : 'Enable location access in your browser to see listings near you.';
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-ink2">{message}</p>
        {geoError !== 'denied' && geoError !== 'unsupported' && (
          <button
            type="button"
            onClick={handleRetryGeolocation}
            className="mt-6 rounded-full bg-ink px-5 py-2 text-surface text-sm font-medium transition hover:opacity-90"
          >
            Try again
          </button>
        )}
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

  // Phase 47.2 (2026-06-21): refactored to use shared GridPageShell +
  // ListingGrid primitives so /nearby matches /browse, /communities,
  // /dashboard, /dashboard/communities, /saved exactly. Distance pill
  // routes through ListingGridItem.distanceMi → GridCard topLeft slot.
  const items: ListingGridItem[] = cards.map((card) => {
    // Phase 60: agent's cover_url wins over the mediaKind hero.
    const realSrc =
      card.gridCoverUrl ??
      (card.mediaKind === 'video'
        ? thumbnailUrl(card.hero.cfVideoId)
        : (card.heroPhotoUrl as string));
    return {
      id: card.listing.id,
      href:
        card.mediaKind === 'video'
          ? `/browse/feed?start=${encodeURIComponent(card.listing.id)}`
          : `/v/${card.agent.slug}/${card.listing.slug}`,
      coverUrl: realSrc ?? null,
      price: card.listing.price,
      beds: card.listing.beds,
      baths: card.listing.baths,
      sqft: card.listing.sqft,
      address: card.listing.address,
      distanceMi: typeof card.distance === 'number' ? card.distance : null,
    };
  });

  return (
    <GridPageShell>
      <ListingGrid items={items} />
    </GridPageShell>
  );
}
