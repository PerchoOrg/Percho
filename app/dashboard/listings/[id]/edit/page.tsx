/**
 * /dashboard/listings/[id]/edit — placeholder until Phase 4.3.
 *
 * Phase 4.1 redirects here after a draft listing is created so the user has
 * a destination to land on. Phase 4.3 will replace this with the full edit
 * form (all fields, video reorder via dnd-kit, cover photo selector).
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

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
    .select('id, address, city, state, zip, status, slug')
    .eq('id', id)
    .maybeSingle()) as {
    data: {
      id: string;
      address: string;
      city: string;
      state: string;
      zip: string | null;
      status: string;
      slug: string;
    } | null;
  };

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
          {listing.zip ? ` ${listing.zip}` : ''} · status:{' '}
          <span className="font-medium text-cream">{listing.status}</span> · slug:{' '}
          <code className="text-cream">{listing.slug}</code>
        </p>
      </header>

      <section className="rounded border border-bronze/30 bg-ink2 p-6">
        <h2 className="text-base font-semibold">Edit form coming in Phase 4.3</h2>
        <p className="mt-2 text-sm text-cream/60">
          This page will let you fill in the remaining details (price, beds/baths, description, year
          built, lot size, HOA, style), upload home videos, reorder them via drag-and-drop, set the
          cover photo, and publish. Phase 4.1 created the draft row so the rest of the flow has
          somewhere to attach.
        </p>
      </section>
    </div>
  );
}
