/**
 * Mobile Property Detail route — `/listings/[id]`.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.3
 *
 * Currently landed (D2.1 – D2.3):
 *  - RSC that resolves the id param, loads the listing via
 *    `fetchMobileListing` (cached with `unstable_cache` per the
 *    supabase-rsc-perf-playbook skill), and 404s on miss.
 *  - Hero photo gallery (D2.2) mounted above the info block.
 *  - Canonical price + address block (D2.3): K/M-compressed price via the
 *    shared `formatPrice` helper, single-line canonical address string
 *    `{street}, {city}, {state}${zip?' '+zip:''}` (memory canonical form).
 *
 * Specs row (D2.4) and agent card + CTAs (D2.5) mount below the header in
 * the reserved slot. No mock/placeholder text lives here.
 *
 * Chrome (BottomNav / DesktopSidebar / TopBar) hides on this route via
 * the `/listings/` prefix in `isChromeHidden` — full-bleed mobile canvas
 * matching the reelestate teardown.
 */
import { notFound } from 'next/navigation';
import { fetchMobileListing } from '@/lib/reelestate/listing';
import { PhotoGallery } from '@/components/reelestate/PhotoGallery';
import { formatPrice } from '@/lib/format/price';

export const dynamic = 'force-dynamic';

interface DetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MobileListingDetailPage({ params }: DetailPageProps) {
  const { id } = await params;
  const listing = await fetchMobileListing(id);
  if (!listing) notFound();

  // Canonical single-line address (memory) — used everywhere a listing
  // needs a location string in ReelEstate UI. Zip is space-joined only when
  // present, per the exact template committed to memory.
  const fullAddress = `${listing.address}, ${listing.city}, ${listing.state}${
    listing.zip ? ` ${listing.zip}` : ''
  }`;

  const priceLabel = formatPrice(listing.price);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col pb-8">
      {/* Hero photo gallery (D2.2) — full-bleed above the info block; falls
          back to a neutral placeholder frame when a listing has no ready
          photos so the layout doesn't collapse. */}
      {listing.photos.length > 0 ? (
        <PhotoGallery photos={listing.photos} address={listing.address} />
      ) : (
        <div
          aria-hidden
          className="w-full bg-white/[0.04]"
          style={{ aspectRatio: '4 / 3' }}
        />
      )}

      {/* Info block — README §2.3 point 2. Price sits above the address in
          the reelestate teardown; specs row (D2.4) + description accordion
          + agent card (D2.5) mount immediately below this header. */}
      <header className="mt-4 flex flex-col gap-1.5 px-4">
        {priceLabel ? (
          <p className="text-[38px] font-bold leading-none tracking-tight text-white tabular-nums">
            {priceLabel}
          </p>
        ) : null}
        <h1 className="text-[17px] font-medium leading-snug text-white/90">
          {fullAddress}
        </h1>
      </header>
    </main>
  );
}
