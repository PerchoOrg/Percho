'use client';

/**
 * Phase 14 (2026-06-13): Nearby radius preference.
 *
 * Buyers are anonymous in V1 — there's no `user_preferences` table to
 * persist this server-side. We store a single integer in `localStorage`
 * under `vicinity:nearby_radius` and `/nearby` reads it on mount. If the
 * key is missing or invalid, the default is 10 mi (matches the original
 * /nearby slider default).
 *
 * Allowed values: 1 / 5 / 10 / 25 / 50 mi. The API caps at 100 mi but a
 * select with 5 buckets covers 95% of buyer searches and avoids the
 * fiddly slider that lived on /nearby pre-Phase 14.
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vicinity:nearby_radius';
const DEFAULT_RADIUS = 10;
const OPTIONS = [1, 5, 10, 25, 50] as const;

export function NearbyRadiusPref() {
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : DEFAULT_RADIUS;
    setRadius(
      Number.isFinite(n) && OPTIONS.includes(n as (typeof OPTIONS)[number]) ? n : DEFAULT_RADIUS,
    );
  }, []);

  function update(next: number) {
    setRadius(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="rounded-xl border border-cream/10 bg-ink2/40 p-4">
      <div className="font-medium text-cream/80 text-xs uppercase tracking-wider">Preferences</div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <label htmlFor="nearby-radius" className="text-cream/70 text-sm">
          Nearby search radius
        </label>
        <select
          id="nearby-radius"
          value={radius}
          onChange={(e) => update(Number(e.target.value))}
          className="rounded border border-bronze/30 bg-ink px-3 py-1 text-cream text-sm focus:border-gold focus:outline-none"
        >
          {OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} mi
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-cream/50 text-xs">
        Used by <span className="text-cream/70">Nearby</span> to decide which listings to show
        around your location.
        {saved && <span className="ml-2 text-gold">Saved.</span>}
      </p>
    </div>
  );
}
