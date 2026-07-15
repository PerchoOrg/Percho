/**
 * Canonical price formatter — K/M short form for chrome / cards / detail
 * headers where the sub-thousand digits don't add signal.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.3
 *
 * Rules (locked here so ReelEstate variants stop drifting per memory §…):
 *   - null/undefined → empty string (caller decides fallback).
 *   - < $1,000        → `$NNN` exact.
 *   - < $1,000,000    → `$NK` (rounded to nearest 1K, no decimals).
 *   - >= $1,000,000   → `$N.NM` (one decimal, trailing `.0` trimmed).
 *
 * Full-digit variants (feed hero chip §2.1, browse caption §2.2) intentionally
 * do NOT use this helper — those overlays want punch, not compression.
 */
export function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  if (n < 1_000) return `$${Math.round(n)}`;
  if (n < 1_000_000) return `$${Math.round(n / 1_000)}K`;
  const m = n / 1_000_000;
  const oneDp = Math.round(m * 10) / 10;
  const label = Number.isInteger(oneDp) ? `${oneDp.toFixed(0)}` : `${oneDp.toFixed(1)}`;
  return `$${label}M`;
}
