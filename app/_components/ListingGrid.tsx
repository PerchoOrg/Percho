/**
 * ListingGrid — buyer-facing 4-up listing grid (mirrors CommunityGrid).
 *
 * Phase 47 (2026-06-21): extracted from /browse and /dashboard so My
 * Listings and For You share the exact same card. Caller hands in a
 * normalized `ListingGridItem[]` (id, href, cover, price, beds, baths,
 * sqft, address, optional badge, optional dimmed). Slot composition
 * happens here; cover/caption rendering happens inside GridCard.
 */

import { GridCard, GridCardBadgeDark, GridCardBadgeLight, GridCardCaption } from './GridCard';
import { GridFrame } from './GridFrame';

export type ListingGridItem = {
  id: string;
  href: string;
  coverUrl: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  address: string | null;
  /** Optional top-right badge — { label: 'Stock' } on demo cards, { label:
   *  'Inactive', tone: 'light' } on owner-side dimmed cards. */
  badge?: { label: string; tone?: 'dark' | 'light' } | null;
  /** Reduce cover opacity (used for inactive listings on the agent side). */
  dimmed?: boolean;
};

function fmtPrice(n: number | null): string {
  if (n == null) return 'Price on request';
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtBaths(n: number | null): string | null {
  if (n == null) return null;
  const whole = Math.floor(n);
  const frac = n - whole;
  return frac >= 0.5 ? `${whole}½` : `${whole}`;
}

function specsLine(item: ListingGridItem): string {
  return [
    item.beds != null ? `${item.beds} bd` : null,
    fmtBaths(item.baths) ? `${fmtBaths(item.baths)} ba` : null,
    item.sqft != null ? `${item.sqft.toLocaleString()} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function ListingGrid({
  items,
  emptyState,
}: {
  items: ListingGridItem[];
  /** Override the default "No listings yet…" empty state. */
  emptyState?: React.ReactNode;
}) {
  if (items.length === 0) {
    if (emptyState !== undefined) return <>{emptyState}</>;
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-ink2">
          No listings yet. Check back soon — agents are uploading new tours.
        </p>
      </div>
    );
  }

  return (
    <GridFrame>
      {items.map((item) => {
        const badge = item.badge;
        const topRight = badge ? (
          badge.tone === 'light' ? (
            <GridCardBadgeLight>{badge.label}</GridCardBadgeLight>
          ) : (
            <GridCardBadgeDark>{badge.label}</GridCardBadgeDark>
          )
        ) : null;
        const specs = specsLine(item);
        return (
          <GridCard
            key={item.id}
            href={item.href}
            coverUrl={item.coverUrl}
            alt={item.address ?? ''}
            dimmed={item.dimmed}
            topRight={topRight}
            fallback={
              <div className="grid h-full w-full place-items-center text-muted text-xs">
                No cover
              </div>
            }
            caption={
              <GridCardCaption
                title={fmtPrice(item.price)}
                sub={specs || null}
                sub2={item.address ?? '(no address)'}
              />
            }
          />
        );
      })}
    </GridFrame>
  );
}
