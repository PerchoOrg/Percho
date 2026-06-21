'use client';

/**
 * ListingsTabbedList — my-listings grid (Phase 46 rewrite).
 *
 * Phase 46 rebuild:
 *   - Status tabs gone (status simplified to 'active' | 'inactive' and the
 *     pill row was already hidden in 35.3).
 *   - Single grid layout matches buyer-facing `/browse`:
 *       grid-cols-2 gap-x-1 gap-y-2 md:grid-cols-4 md:gap-x-1.5 md:gap-y-3
 *     Each card aspect-[3/4] with bottom-gradient overlay.
 *   - Inactive listings rendered with reduced opacity + small "Inactive"
 *     pill in the corner (no scary red, just visual de-emphasis).
 *   - List view removed; the wide-row layout is no longer used anywhere.
 *   - Empty state simplified.
 *
 * Click → /dashboard/listings/<id>/edit (the new HubDetailShell).
 */

import Link from 'next/link';

export type ListingRow = {
  id: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string; // 'active' | 'inactive'
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
  fallback_cover_url: string | null;
  updated_at: string;
};

type Props = {
  agentSlug: string | null;
  rows: ListingRow[];
  /** Phase 43.10 / 46: only 'grid' is rendered now. Prop kept for forward
   * compat with the dashboard server component. */
  view?: 'grid';
};

function fmtPrice(n: number | null): string | null {
  if (n == null) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtBaths(n: number | null): string | null {
  if (n == null) return null;
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac >= 0.5) return `${whole}½`;
  return `${whole}`;
}

export function ListingsTabbedList({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line border-dashed bg-surface px-8 py-16 text-center">
        <p className="text-ink2 text-sm">
          No listings yet — tap + New listing to add one.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-1 gap-y-2 md:grid-cols-4 md:gap-x-1.5 md:gap-y-3">
      {rows.map((l) => {
        const cover = l.cover_url ?? l.fallback_cover_url;
        const price = fmtPrice(l.price);
        const isInactive = l.status === 'inactive';
        return (
          <Link
            key={l.id}
            href={`/dashboard/listings/${l.id}/edit`}
            className="group block"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt=""
                  className={`h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02] ${
                    isInactive ? 'opacity-60' : ''
                  }`}
                  loading="lazy"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-muted text-xs">
                  No cover
                </div>
              )}
              {isInactive && (
                <div className="absolute right-2 top-2 z-10 rounded-full border border-line bg-surface/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink2 backdrop-blur">
                  Inactive
                </div>
              )}
              {/* Bottom-gradient overlay for legibility — phase 45.26. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              <div className="absolute inset-x-2 bottom-2 text-surface">
                {price && (
                  <div className="font-serif text-[15px] font-semibold leading-tight tracking-[-0.01em]">
                    {price}
                  </div>
                )}
                <div className="mt-0.5 truncate text-[11px] opacity-95 tracking-wide">
                  {[
                    l.beds != null ? `${l.beds} bd` : null,
                    fmtBaths(l.baths) ? `${fmtBaths(l.baths)} ba` : null,
                    l.sqft != null ? `${l.sqft.toLocaleString()} sqft` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                <div className="mt-px truncate text-[11px] opacity-80">
                  {l.address ?? '(no address)'}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
