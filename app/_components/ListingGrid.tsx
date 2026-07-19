/**
 * ListingGrid — buyer-facing 4-up listing grid (mirrors CommunityGrid).
 *
 * extracted from /browse and /dashboard so My
 * Listings and For You share the exact same card. Caller hands in a
 * normalized `ListingGridItem[]` (id, href, cover, price, beds, baths,
 * sqft, address, optional badge, optional dimmed). Slot composition
 * happens here; cover/caption rendering happens inside GridCard.
 */

import { Home } from 'lucide-react';

import { EmptyHubState } from './EmptyHubState';
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
  /**
   * city / state / zip surfaced so the grid
   * caption's third line renders the full address in the same shape as
   * the swipe feed CaptionCard: `street, city, state zip`. Any of them
   * can be null (drafts, legacy rows) — the formatter drops missing
   * segments gracefully.
   */
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /** Optional top-right badge — { label: 'Stock' } on demo cards, { label:
   *  'Inactive', tone: 'light' } on owner-side dimmed cards. */
  badge?: { label: string; tone?: 'dark' | 'light' } | null;
  /** Optional top-left distance pill — used by /nearby (e.g. "1.2 mi"). */
  distanceMi?: number | null;
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

/**
 * /74.7: grid caption 3rd line — mirror the swipe feed
 * shape but WITHOUT zip (owner: grid view should not show zipcode). Format:
 * `street, city, state`. Draft placeholders (no city/state) fall
 * through as street-only. Zip stays on the swipe feed + bottom sheet
 * because those have room; the 4-up grid does not.
 */
function formatFullAddress(item: ListingGridItem): string {
  const street = item.address?.trim() || null;
  const city = item.city?.trim() || null;
  const state = item.state?.trim() || null;
  if (!street && !city && !state) return '(no address)';
  if (!city && !state) return street ?? '(no address)';
  const geoTail = [city, state].filter(Boolean).join(', ');
  return street ? `${street}, ${geoTail}` : geoTail;
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
      <EmptyHubState
        icon={<Home className="h-6 w-6" strokeWidth={1.5} />}
        headline="No listings yet"
        sub="New tours will be uploaded soon — check back later."
      />
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
        const topLeft =
          typeof item.distanceMi === 'number' ? (
            <GridCardBadgeDark>{`${item.distanceMi.toFixed(1)} mi`}</GridCardBadgeDark>
          ) : null;
        return (
          <GridCard
            key={item.id}
            href={item.href}
            coverUrl={item.coverUrl}
            alt={item.address ?? ''}
            dimmed={item.dimmed}
            topLeft={topLeft}
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
                sub2={formatFullAddress(item)}
              />
            }
          />
        );
      })}
    </GridFrame>
  );
}
