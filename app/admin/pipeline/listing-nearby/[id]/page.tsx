/**
 * /admin/pipeline/listing-nearby/[id] — per-listing POI + bucket video
 * review, powered by the same ListingNearbyPanel used to be mounted on
 * the agent hub. Admin-scoped now.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { ListingNearbyPanel } from '@/app/dashboard/listings/[id]/edit/ListingNearbyPanel';
import { loadNearbyPoisForListing } from '@/lib/poi/listing-actions';

export const dynamic = 'force-dynamic';

interface Params { id: string }

export default async function AdminListingNearbyPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: listing } = (await supabase
    .from('listings')
    .select('id, address, city, state, status, community_id, agents(name, slug)')
    .eq('id', id)
    .maybeSingle()) as {
    data:
      | {
          id: string;
          address: string;
          city: string;
          state: string;
          status: string;
          community_id: string | null;
          agents: { name: string; slug: string } | null;
        }
      | null;
  };

  if (!listing) notFound();

  const initialPois = await loadNearbyPoisForListing(listing.id).catch(() => []);

  return (
    <div className="space-y-4">
      <div className="text-ink2 text-sm">
        <Link href="/admin/pipeline/listing-nearby" className="hover:text-ink">
          ← Listing Nearby
        </Link>
      </div>

      <header className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h1 className="text-xl font-semibold">{listing.address}</h1>
        <p className="text-ink2 mt-1 text-sm">
          {listing.city}, {listing.state} · {listing.status}
          {listing.community_id ? ' · community-scoped' : ' · no community'}
          {listing.agents?.name && ` · agent ${listing.agents.name}`}
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <ListingNearbyPanel
          listingId={listing.id}
          initialPois={initialPois}
          supabaseStorageBase={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}
        />
      </section>
    </div>
  );
}
