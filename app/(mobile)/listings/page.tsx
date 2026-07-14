/**
 * Mobile Properties List route — `/listings`.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.2
 *
 * L3.1 scope (this file):
 *  - 2-col grid on the dark near-black canvas from the mobile route group.
 *  - Dark-navy card tiles (`bg-bg-surface` + `bg-bg-border` hairline), rounded
 *    to the canonical `tile` radius from README §1 tokens.
 *  - Cover photo `object-cover` at a 4:5 portrait crop so the strip reads as a
 *    property card, not a square feed thumbnail (§2.2 layout).
 *  - Price uses the shared K/M `formatPrice` helper (memory canonical) and
 *    renders in cyan as the accent per §2.2.
 *  - Address uses the canonical `{street}, {city}, {state}${zip?' '+zip:''}`
 *    template (memory).
 *  - No filter bar yet (L3.2 will add it), no line-height refinement yet
 *    (L3.3 will land the 15/11/11 canonical caption rig). Caption sizing here
 *    is a neutral placeholder that L3.3 will tune — no `text-[15/11/11]` yet.
 *
 * Data: `fetchMobileListings` (real Supabase, anon RLS, unstable_cache 60s).
 * Empty query → empty state string, no seed/mock fallback.
 *
 * Chrome hides on `/listings/` prefix (existing entry in `isChromeHidden`),
 * so `/listings` itself also matches and the mobile layout owns chrome.
 */
import Link from 'next/link';
import { fetchMobileListings, type MobileListingCard } from '@/lib/reelestate/list';
import { formatPrice } from '@/lib/format/price';
import { ListingsFilterBar } from '@/components/reelestate/ListingsFilterBar';

export const dynamic = 'force-dynamic';

export default async function MobileListingsPage() {
  const listings = await fetchMobileListings();

  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-3 pt-4 pb-8">
      <header className="mb-3 px-1">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-white">
          Properties
        </h1>
      </header>

      <ListingsFilterBar />

      {listings.length === 0 ? (
        <p className="mt-8 px-2 text-center text-sm text-white/50">
          No active listings yet.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3">
          {listings.map((l) => (
            <li key={l.id}>
              <ListingTile listing={l} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ListingTile({ listing }: { listing: MobileListingCard }) {
  const addressLine = `${listing.address}, ${listing.city}, ${listing.state}${
    listing.zip ? ` ${listing.zip}` : ''
  }`;
  const specs = [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString('en-US')} sqft` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const priceLabel = formatPrice(listing.price);

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="block overflow-hidden rounded-tile border border-bg-border bg-bg-surface"
    >
      <div className="relative w-full bg-bg-elevated" style={{ aspectRatio: '4 / 5' }}>
        {listing.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- covers can be arbitrary Supabase Storage or MLS CDN URLs; kept out of next/image remote-patterns list.
          <img
            src={listing.cover_url}
            alt={listing.address}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-white/40">
            {listing.address}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 px-3 py-2.5">
        {priceLabel ? (
          <p className="font-semibold tabular-nums text-cyan">{priceLabel}</p>
        ) : null}
        {specs ? <p className="text-white/70">{specs}</p> : null}
        <p className="text-white/50">{addressLine}</p>
      </div>
    </Link>
  );
}
