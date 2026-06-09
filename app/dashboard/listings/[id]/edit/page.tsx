/**
 * /dashboard/listings/[id]/edit — listing edit page (Phase 4.3a).
 *
 * Phase 4.3a: metadata fields (price/beds/baths/sqft/year_built/lot_size/hoa/style/description).
 * Phase 4.3b will add the video panel (list, upload, dnd-kit reorder).
 * Phase 4.3c will add the cover photo selector.
 *
 * Address/city/state/zip/lat/lng are read-only on this page — see
 * `actions.ts` header for rationale.
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { EditListingForm } from './EditListingForm';

interface ListingRow {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string | null;
  neighborhood: string | null;
  status: string;
  slug: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  lot_size: string | null;
  hoa: string | null;
  style: string | null;
  description: string[] | null;
}

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=%2Fdashboard%2Flistings%2F${id}%2Fedit`);

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: listing } = (await (supabase as any)
    .from('listings')
    .select(
      'id, address, city, state, zip, neighborhood, status, slug, price, beds, baths, sqft, year_built, lot_size, hoa, style, description',
    )
    .eq('id', id)
    .maybeSingle()) as { data: ListingRow | null };

  if (!listing) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-cream/60">
          Listing not found, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{listing.address}</h1>
        <p className="mt-1 text-sm text-cream/60">
          {listing.city}, {listing.state}
          {listing.zip ? ` ${listing.zip}` : ''}
          {listing.neighborhood ? ` · ${listing.neighborhood}` : ''} · status:{' '}
          <span className="font-medium text-cream">{listing.status}</span> · slug:{' '}
          <code className="text-cream">{listing.slug}</code>
        </p>
      </header>

      <section className="rounded border border-bronze/30 bg-ink2 p-6">
        <h2 className="mb-4 text-base font-semibold">Listing details</h2>
        <EditListingForm
          listingId={listing.id}
          initial={{
            price: listing.price,
            beds: listing.beds,
            baths: listing.baths,
            sqft: listing.sqft,
            year_built: listing.year_built,
            lot_size: listing.lot_size,
            hoa: listing.hoa,
            style: listing.style,
            description: listing.description ?? [],
          }}
        />
      </section>

      <section className="rounded border border-bronze/30 bg-ink2 p-6">
        <h2 className="text-base font-semibold">Videos & cover photo</h2>
        <p className="mt-2 text-sm text-cream/60">
          Coming in Phase 4.3b/c — upload home videos, drag to reorder, pick the cover photo.
        </p>
      </section>
    </div>
  );
}
