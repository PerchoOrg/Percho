/**
 * <PropertyPill> — compact property preview badge, designed to sit inside a
 * message bubble (or any narrow surface) as a tap target that opens the
 * detail screen for the referenced listing.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.7 (Messages Inbox — a row
 * can carry an embedded property pill so agent↔buyer chat threads reference
 * concrete listings inline)
 *
 * M5.2 scope: pure presentation. The pill does NOT fetch anything on its
 * own — the caller passes a plain data object. This keeps the component
 * usable in three contexts without pulling a data dependency into each:
 *   1. Message row (M5.3 thread page — future).
 *   2. Property detail "related" future slot.
 *   3. Storybook / visual-check screens.
 *
 * Layout mirrors screenshot §2.7:
 *   ┌────────────────────────────────────────┐
 *   │ [64² cover]  $525K            ›       │
 *   │              3 bd · 2 ba · 1,850 sqft  │
 *   │              742 Oak St, Decatur, GA   │
 *   └────────────────────────────────────────┘
 *
 * Wiring: whole card is one `<Link>` to `/listings/<id>`. No mock defaults;
 * missing fields collapse (price omitted, specs row omitted, etc.).
 */

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatPrice } from '@/lib/format/price';

export interface PropertyPillListing {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  cover_url: string | null;
}

interface PropertyPillProps {
  listing: PropertyPillListing;
}

export function PropertyPill({ listing }: PropertyPillProps) {
  const addressLine = `${listing.address}, ${listing.city}, ${listing.state}${listing.zip ? ` ${listing.zip}` : ''}`;
  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString('en-US')} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const price = formatPrice(listing.price);

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="flex items-center gap-3 rounded-tile border border-cyan/20 bg-bg-surface p-2 pr-3 shadow-glow-tile transition hover:border-cyan/50"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] bg-bg-elevated">
        {listing.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage / MLS CDN URLs sit outside next/image remote-patterns.
          <img
            src={listing.cover_url}
            alt={listing.address}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] text-white/40">
            {listing.address.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {price ? (
          <p className="text-[15px] font-semibold leading-tight text-cyan tabular-nums">{price}</p>
        ) : null}
        {specs ? (
          <p className="truncate text-[11px] leading-tight text-white/60">{specs}</p>
        ) : null}
        <p className="truncate text-[11px] leading-tight text-white/80">{addressLine}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/40" strokeWidth={2} />
    </Link>
  );
}
