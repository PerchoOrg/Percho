'use client';

/**
 * Nearby radius preference.
 *
 * Buyers are anonymous in V1 — there's no `user_preferences` table to
 * persist this server-side. We store a single integer in `localStorage`
 * under `percho:nearby_radius` and `/nearby` reads it on mount. If the
 * key is missing or invalid, the default is 10 mi.
 *
 * 2026-06-14: Replaced 5-bucket select with a drag slider, range 1–100 mi
 * (matches the API cap at MAX_RADIUS_MI = 100).
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'percho:nearby_radius';
const DEFAULT_RADIUS = 10;
const MIN_RADIUS = 1;
const MAX_RADIUS = 100;

function clamp(n: number) {
  if (!Number.isFinite(n)) return DEFAULT_RADIUS;
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Math.round(n)));
}

export function NearbyRadiusPref() {
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : DEFAULT_RADIUS;
    setRadius(clamp(n));
  }, []);

  function update(next: number) {
    const v = clamp(next);
    setRadius(v);
    window.localStorage.setItem(STORAGE_KEY, String(v));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="font-medium text-ink2 text-xs uppercase tracking-wider">Preferences</div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <label htmlFor="nearby-radius" className="text-ink2 text-sm">
          Nearby search radius
        </label>
        <span className="font-medium text-ink text-sm tabular-nums">{radius} mi</span>
      </div>
      <input
        id="nearby-radius"
        type="range"
        min={MIN_RADIUS}
        max={MAX_RADIUS}
        step={1}
        value={radius}
        onChange={(e) => update(Number(e.target.value))}
        className="mt-3 w-full accent-gold"
      />
      <div className="mt-1 flex justify-between text-muted text-[10px]">
        <span>{MIN_RADIUS} mi</span>
        <span>{MAX_RADIUS} mi</span>
      </div>
      <p className="mt-2 text-muted text-xs">
        Used by <span className="text-ink2">Nearby</span> to decide which listings to show around
        your location.
        {saved && <span className="ml-2 text-ink">Saved.</span>}
      </p>
    </div>
  );
}
