'use client';

/**
 * CommunitiesNearbyClient — geolocation-driven communities-by-distance grid.
 *
 * Phase 45 (2026-06-20). Mirrors NearbyClient's geolocation/preference
 * flow exactly (radius from `vicinity:nearby_radius`); when geolocation is
 * denied/unavailable, renders an empty result (no manual lat/lng input —
 * owner request 2026-06-21).
 *
 * Owner clarification (2026-06-20): "community 没有坐标 但是里面的 video
 * 有坐标,nearby 给 videos 所在的 community". The /api/communities/nearby
 * endpoint handles that mapping; this client just renders the result with
 * a "0.4 mi away" badge per card.
 */

import { CommunityGrid } from '@/app/_components/CommunityGrid';
import type { CommunityListCard } from '@/lib/communities/list';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type CardWithDistance = CommunityListCard & { nearestVideoMi: number | null };

interface NearbyResponse {
  cards: CardWithDistance[];
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

export function CommunitiesNearbyClient() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(RADIUS_DEFAULT);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NearbyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

  useEffect(() => {
    setRadius(readStoredRadius());
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoDenied(true),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, []);

  const fetchNearby = useCallback(async (c: { lat: number; lng: number }, r: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/communities/nearby?lat=${c.lat}&lng=${c.lng}&radius=${r}`,
        { cache: 'no-store' },
      );
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

  if (!coords && geoDenied) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-ink2">
          Enable location access in your browser to see communities near you.
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
          No community videos within {data?.radius ?? radius} mi.{' '}
          <Link href="/profile" className="text-ink hover:underline">
            Adjust your search radius in Preferences
          </Link>{' '}
          or check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3 pb-6 sm:px-6">
      <CommunityGrid communities={cards} />
    </div>
  );
}
