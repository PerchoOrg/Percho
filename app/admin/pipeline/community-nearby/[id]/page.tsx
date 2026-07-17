/**
 * /admin/pipeline/community-nearby/[id] — per-community POI + bucket video
 * review, powered by the same CommunityNearbyPanel that used to live on the
 * agent-facing community edit page. Admin-scoped now (Phase 101e).
 */

import { CommunityNearbyPanel } from '@/app/dashboard/communities/[id]/CommunityNearbyPanel';
import { loadNearbyPoisForCommunity } from '@/lib/poi/community-actions';
import { createServiceClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

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

  const initialPois = await loadNearbyPoisForCommunity(community.id).catch(() => []);

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h1 className="text-xl font-semibold">{community.name}</h1>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <CommunityNearbyPanel
          communityId={community.id}
          initialPois={initialPois}
          supabaseStorageBase={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}
        />
      </section>
    </div>
  );
}
