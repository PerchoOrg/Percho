/**
 * Mobile Property Detail route — `/listings/[id]`.
 *
 * ref: docs/design/reelestate-teardown/README.md §2.3
 *
 * D2.1 scope (this file):
 *  - RSC that resolves the id param, loads the listing via
 *    `fetchMobileListing` (cached with `unstable_cache` per the
 *    supabase-rsc-perf-playbook skill), and 404s on miss.
 *  - Renders the canonical price + title + full-address triple so the
 *    fetch is verifiably hooked up to real Supabase data (§2.3 info block).
 *  - Hero gallery, stats card, Watch Reel CTA, About / Neighborhood /
 *    Commute / Agent card land in D2.2 – D2.5 and mount into the slots
 *    reserved below. No mock/placeholder text lives here.
 *
 * Chrome (BottomNav / DesktopSidebar / TopBar) hides on this route via
 * the `/listings/` prefix in `isChromeHidden` — full-bleed mobile canvas
 * matching the reelestate teardown.
 */
import { notFound } from 'next/navigation';
import { fetchMobileListing } from '@/lib/reelestate/listing';

export const dynamic = 'force-dynamic';

interface DetailPageProps {
  params: Promise<{ id: string }>;
}

function formatPriceFull(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

export default async function MobileListingDetailPage({ params }: DetailPageProps) {
  const { id } = await params;
  const listing = await fetchMobileListing(id);
  if (!listing) notFound();

  const fullAddress = `${listing.address}, ${listing.city}, ${listing.state}${
    listing.zip ? ` ${listing.zip}` : ''
  }`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-8 pt-6">
      {/* Info block — README §2.3 point 2. Hero + gallery (D2.2), stats
          card (D2.4), watch-reel CTA + about + neighborhood + commute +
          agent card (D2.5) mount around this block in later tasks. */}
      <header className="flex flex-col gap-1">
        {listing.price != null ? (
          <p className="text-[38px] font-bold leading-none tracking-tight text-white tabular-nums">
            {formatPriceFull(listing.price)}
          </p>
        ) : null}
        <h1 className="text-[22px] font-semibold text-white">{listing.address}</h1>
        <p className="text-[15px] leading-snug text-white/60">{fullAddress}</p>
      </header>
    </main>
  );
}
