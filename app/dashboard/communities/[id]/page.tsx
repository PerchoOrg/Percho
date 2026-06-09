/**
 * /dashboard/communities/[id] — community editor (Phase 4.4).
 *
 * Loads the community + its schools + its POIs in three parallel reads, then
 * renders the metadata form, the school sub-form, and the POI sub-form. All
 * three sub-areas use server actions defined in `../actions.ts`.
 */

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CommunityEditor } from './CommunityEditor';
import { CommunityVideoPanel, type CommunityVideoRow } from './CommunityVideoPanel';

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string;
  description: string | null;
}

export interface SchoolRow {
  id: string;
  name: string;
  grades: string | null;
  rating: number | null;
  source_url: string;
  recorded_at: string;
}

export interface PoiRow {
  id: string;
  name: string;
  poi_type: string;
  distance_text: string | null;
  source_url: string;
  recorded_at: string;
}

export default async function CommunityEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=%2Fdashboard%2Fcommunities%2F${id}`);

  // biome-ignore lint/suspicious/noExplicitAny: stub generated types
  const { data: community } = (await (supabase as any)
    .from('communities')
    .select('id, name, slug, city, state, description')
    .eq('id', id)
    .maybeSingle()) as { data: CommunityRow | null };

  if (!community) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-cream/60">Community not found.</p>
      </div>
    );
  }

  const [{ data: schoolsRaw }, { data: poisRaw }, { data: videosRaw }] = await Promise.all([
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('schools')
      .select('id, name, grades, rating, source_url, recorded_at')
      .eq('community_id', id)
      .order('name', { ascending: true }) as Promise<{ data: SchoolRow[] | null }>,
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('pois')
      .select('id, name, poi_type, distance_text, source_url, recorded_at')
      .eq('community_id', id)
      .order('poi_type', { ascending: true })
      .order('name', { ascending: true }) as Promise<{ data: PoiRow[] | null }>,
    // biome-ignore lint/suspicious/noExplicitAny: stub generated types
    (supabase as any)
      .from('community_videos')
      .select('id, cf_video_id, kind, school_id, poi_id, title, status, created_at')
      .eq('community_id', id)
      .order('created_at', { ascending: false }) as Promise<{
      data: CommunityVideoRow[] | null;
    }>,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{community.name}</h1>
        <p className="mt-1 text-sm text-cream/60">
          {community.city ? `${community.city}, ${community.state}` : community.state} · slug:{' '}
          <code className="text-cream">{community.slug}</code>
        </p>
      </header>

      <CommunityEditor community={community} schools={schoolsRaw ?? []} pois={poisRaw ?? []} />
      <CommunityVideoPanel
        communityId={community.id}
        initialVideos={videosRaw ?? []}
        schools={schoolsRaw ?? []}
        pois={poisRaw ?? []}
      />
    </div>
  );
}
