/**
 * /admin/pipeline/community-nearby/[id] — per-community POI + bucket video
 * review, powered by the same CommunityNearbyPanel that used to live on the
 * agent-facing community edit page. Admin-scoped now.
 */

import { CommunityNearbyPanel } from '@/app/dashboard/communities/[id]/CommunityNearbyPanel';
import { loadNearbyPhotos } from '@/lib/poi/admin-nearby-photos';
import { loadNearbyPoisForCommunity } from '@/lib/poi/community-actions';
import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { CommunityTourSection } from '../../../_components/CommunityTourSection';

export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

export default async function AdminCommunityNearbyPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: community } = (await supabase
    .from('communities')
    .select('id, name, slug, city, state, status')
    .eq('id', id)
    .maybeSingle()) as {
    data: {
      id: string;
      name: string;
      slug: string | null;
      city: string | null;
      state: string | null;
      status: string;
    } | null;
  };

  if (!community) notFound();

  const [initialPois, photos] = await Promise.all([
    loadNearbyPoisForCommunity(community.id).catch(() => []),
    loadNearbyPhotos({ kind: 'community', id: community.id }).catch(() => []),
  ]);

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h1 className="text-xl font-semibold">{community.name}</h1>
      </header>

      {/* Community Tour: video → 8 steps → big photo table (owner 2026-08-16) */}
      <CommunityTourSection
        communityId={community.id}
        communityName={community.name}
        city={community.city}
        state={community.state}
        storageBase={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}
        bucket="listing-photos"
        photos={photos}
      />

      {/* Everything else, collapsible at the bottom */}
      <details className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          POI Review & Nearby Management
        </summary>
        <div className="mt-4">
          <CommunityNearbyPanel
            communityId={community.id}
            initialPois={initialPois}
            supabaseStorageBase={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}
          />
        </div>
      </details>
    </div>
  );
}
