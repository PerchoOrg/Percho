/**
 * Pure display helpers for the worker hub. No server imports — the client
 * components use these, so nothing in here may touch `node:` or the service
 * key. `hourlyHistogram` lives here for the same reason: the sparkline is
 * drawn in the browser from the timestamps the API returned.
 */

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Compact elapsed time: `45s`, `12m`, `3h 20m`, `2d 4h`. */
export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function ageSeconds(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now - t) / 1000 : null;
}

export function formatAge(iso: string | null | undefined, now = Date.now()): string {
  const sec = ageSeconds(iso, now);
  return sec === null ? '—' : `${formatDuration(sec)} ago`;
}

export function formatUsd(n: number): string {
  return n === 0 ? '$0.00' : `$${n.toFixed(n < 10 ? 2 : 0)}`;
}

/** Completions per hour over the last 24h, oldest bucket first. */
export function hourlyHistogram(timestamps: string[], now = Date.now()): number[] {
  const buckets = new Array<number>(24).fill(0);
  for (const ts of timestamps) {
    const t = new Date(ts).getTime();
    if (!Number.isFinite(t)) continue;
    const hoursAgo = Math.floor((now - t) / 3_600_000);
    if (hoursAgo < 0 || hoursAgo > 23) continue;
    const idx = 23 - hoursAgo;
    buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}
